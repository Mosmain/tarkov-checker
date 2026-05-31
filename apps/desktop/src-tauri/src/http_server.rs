//! Local HTTP server for the future "browser as frontend" mode.
//!
//! Listens on `127.0.0.1:47474` by default. The Tauri webview keeps talking
//! to the Rust core via IPC (`invoke`/`listen`); this server exists so the
//! same core can also serve a frontend running in a real browser (the
//! hosted page on GitHub Pages / a domain).
//!
//! Security model — see also CLAUDE.md "Future architecture":
//!
//! * Bind address depends on the user's `lan_mode` toggle (persisted in
//!   `%APPDATA%/tarkov-checker/config.json`). Default `false` →
//!   `127.0.0.1`. Opt-in `true` → `0.0.0.0`, advertised via QR on the
//!   tray menu's "Pair phone" flow.
//! * `CorsLayer` strict-allowlist on `Origin`. The browser is the only
//!   relevant attacker on localhost — native code on the same machine
//!   already has filesystem access and does not need the API. The
//!   allowlist guarantees:
//!     * Browser-context calls from anything that is not our frontend
//!       (the user's `app.tarkov-checker.com` / GitHub Pages page or the
//!       Vite dev server) get no `Access-Control-Allow-Origin` header,
//!       and the browser drops the response in JS.
//!     * Cross-origin PUT requests (the dangerous ones — state-changing,
//!       JSON body) trigger a preflight that fails for any unknown origin,
//!       so the side effect never happens.
//!     * `allow_private_network(true)` tells Chrome's Private Network
//!       Access policy that we know what we are doing — the hosted page
//!       is intentionally talking to a loopback origin.
//! * Token auth (`auth_guard`) is applied to state-changing and stream
//!   routes (`/api/config`, `/events`) ONLY when `lan_mode` is `true`.
//!   On loopback-only the same-machine attacker already has filesystem
//!   access and CORS protects against drive-by browser callers, so the
//!   token check is unnecessary overhead. With LAN exposure, anyone on
//!   the same Wi-Fi can reach `0.0.0.0:47474` raw, so we require the
//!   bearer. `/api/ping` and the embedded-SPA fallback stay open in
//!   both modes — the frontend needs both to bootstrap before it has
//!   the token in hand.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
    routing::get,
    Extension, Router,
};
use futures_util::stream::{Stream, StreamExt};
use serde::Serialize;
use subtle::ConstantTimeEq;
use tauri::AppHandle;
use tokio::sync::broadcast;
use tokio_stream::wrappers::{errors::BroadcastStreamRecvError, BroadcastStream};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::events::ServerEvent;
use crate::server::paths::{self, ResolvedPaths};
use crate::watcher::{self, WatcherSlot};

/// Fixed port for the in-process helper. Loopback (`127.0.0.1`) or LAN
/// (`0.0.0.0`) — see [`spawn`]. Public-`pub` because the QR-pairing flow
/// (D4) and the tray's "Copy pairing URL" handler (E3) both need to
/// build URLs that embed it.
pub const LISTEN_PORT: u16 = 47474;

/// Origins permitted by the CORS allowlist. Anything else gets no
/// `Access-Control-Allow-Origin` header and is silently dropped by the
/// browser.
///
/// **Caveat for user-scoped GitHub Pages**: `https://mosmain.github.io`
/// is the origin for *all* of that user's project pages, not just this
/// one. Any other Pages-hosted repo under the same user can talk to
/// the helper too. Move to a custom domain if/when that matters.
const ALLOWED_ORIGINS: &[&str] = &[
    // Vite dev server (when running the SPA via `pnpm dev`).
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    // Production hosted frontend on GitHub Pages.
    "https://mosmain.github.io",
];

/// Inputs needed to start the HTTP server. Caller assembles, [`spawn`]
/// consumes — keeps the call-site at `lib.rs` honest about what the
/// server reaches into.
pub struct Deps {
    pub auth_token: String,
    pub config_store: Arc<ConfigStore>,
    pub watcher_slot: Arc<WatcherSlot>,
    pub app_handle: AppHandle,
}

/// Per-server shared state. Cheap to clone (Arc all the way down).
///
/// `AppHandle` is deliberately NOT here — it lives as an axum `Extension`
/// layer instead. This keeps `AppState` constructable in unit tests
/// without needing `tauri::test::mock_app()` and its feature flag. The
/// PUT handler grabs the handle via `Extension<AppHandle>`.
#[derive(Clone)]
struct AppState {
    /// Expected bearer token. Read by [`auth_guard`] (LAN mode) and by
    /// [`ping`] for the `paired` flag.
    auth_token: Arc<String>,
    config_store: Arc<ConfigStore>,
    watcher_slot: Arc<WatcherSlot>,
    /// Broadcast sender shared with the watcher modules; the SSE handler
    /// calls `subscribe()` on it per connection to get a fresh receiver.
    /// Held here (not inside WatcherSlot directly) so the HTTP handler
    /// can grab a clone without indirecting through the slot.
    event_tx: broadcast::Sender<ServerEvent>,
}

#[derive(Serialize)]
struct PingResponse {
    name: &'static str,
    version: &'static str,
    status: &'static str,
    /// `true` iff the request carried a valid bearer token (header or
    /// query). The frontend uses this to decide whether to keep the
    /// stored token or prompt re-pair when it returns `false` despite
    /// localStorage holding a token (stale after a "Reset pairing").
    ///
    /// Returned in both LAN-on and LAN-off modes so the frontend can
    /// rely on the same boot logic regardless of the helper's mode.
    /// In LAN-off mode the field is informational only — the
    /// downstream routes don't gate on it.
    paired: bool,
}

async fn ping(
    State(state): State<AppState>,
    headers: HeaderMap,
    uri: Uri,
) -> Json<PingResponse> {
    let paired = extract_bearer_token(&headers, &uri)
        .map(|t| token_matches(&t, &state.auth_token))
        .unwrap_or(false);
    Json(PingResponse {
        name: "tarkov-checker",
        version: env!("CARGO_PKG_VERSION"),
        status: "ok",
        paired,
    })
}

/// Wire-shape returned by the PUT-error path. Single `error` field with
/// the user-facing message — same JSON the frontend's HTTP wrapper
/// already knows how to surface.
#[derive(Serialize)]
struct ConfigError {
    error: String,
}

/// `GET /api/config` — current resolved paths (env > manual > detected),
/// plus the `source` and `exists` flags per slot. Same JSON the Tauri
/// `get_config` IPC command returns, so a browser frontend reads the
/// same shape as the webview.
async fn get_config_http(State(state): State<AppState>) -> Json<ResolvedPaths> {
    let overrides = state.config_store.overrides().await;
    Json(paths::resolve(&overrides))
}

/// `GET /events` — Server-Sent Events stream of `ServerEvent`s. One JSON
/// frame per `position` / `map-change` watcher emission. The same data
/// the Tauri webview receives via `listen("position", …)`.
///
/// Each connection calls `event_tx.subscribe()` to get a fresh broadcast
/// receiver — slow consumers get `Lagged` errors which we surface as a
/// dropped frame (logged client-side as a gap), not a closed connection.
/// Keep-alive sends `: ping\n\n` every 25 s so reverse proxies don't
/// drop the idle stream; harmless on a direct LAN/localhost link.
async fn events_sse(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let receiver = state.event_tx.subscribe();
    let stream = BroadcastStream::new(receiver).filter_map(
        |item: Result<ServerEvent, BroadcastStreamRecvError>| async move {
            match item {
                Ok(event) => match Event::default().json_data(event) {
                    Ok(sse_event) => Some(Ok(sse_event)),
                    Err(err) => {
                        eprintln!("[events] failed to serialise ServerEvent: {err}");
                        None
                    }
                },
                Err(BroadcastStreamRecvError::Lagged(n)) => {
                    eprintln!("[events] subscriber lagged by {n} events — dropped");
                    None
                }
            }
        },
    );
    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(25))
            .text("ping"),
    )
}

/// `PUT /api/config` — persists the manual-overrides patch, re-resolves
/// the path table, and re-applies the watcher pipeline so the new path
/// takes effect immediately. UNC / empty / invalid patches surface as
/// 400 with a JSON error body (e.g. `{"error":"UNC paths are not
/// supported: \\server\share"}`).
async fn put_config_http(
    State(state): State<AppState>,
    Extension(app): Extension<AppHandle>,
    Json(patch): Json<ConfigPatch>,
) -> Result<Json<ResolvedPaths>, (StatusCode, Json<ConfigError>)> {
    state.config_store.apply(patch).await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ConfigError {
                error: e.to_string(),
            }),
        )
    })?;
    let resolved = paths::resolve(&state.config_store.overrides().await);
    watcher::apply_resolved(&app, &state.watcher_slot, &resolved).await;
    Ok(Json(resolved))
}

/// Pulls the bearer token from either the `Authorization` header or
/// the `?token=…` query string. The header path is for normal `fetch`
/// callers; the query path exists because `EventSource` cannot set
/// custom headers, so the SSE endpoint accepts the token in the URL.
///
/// Returns the raw token string with no trust applied — the caller
/// still has to compare it against the expected value (see
/// [`token_matches`]). Missing / malformed → `None`.
fn extract_bearer_token(headers: &HeaderMap, uri: &Uri) -> Option<String> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return Some(token.to_string());
        }
    }
    // Query path — the token is plain hex with no URL-special chars, so
    // a manual `&`/`=` split is sufficient. Sticking to std avoids
    // pulling in `url`/`form_urlencoded` just for this.
    if let Some(query) = uri.query() {
        for pair in query.split('&') {
            if let Some(value) = pair.strip_prefix("token=") {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Constant-time string comparison. A regular `==` short-circuits on
/// the first mismatching byte, leaking position info via timing — that
/// matters on a network-reachable secret. `ct_eq` reads both inputs
/// fully in every call.
fn token_matches(provided: &str, expected: &str) -> bool {
    provided.as_bytes().ct_eq(expected.as_bytes()).into()
}

/// Rejects the request unless it carries a valid bearer token (header
/// or `?token=` query). Applied only when LAN mode is on — see
/// [`router`] for the conditional wiring.
async fn auth_guard(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let valid = extract_bearer_token(req.headers(), req.uri())
        .as_deref()
        .map(|t| token_matches(t, &state.auth_token))
        .unwrap_or(false);
    if valid {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

/// Embedded copy of `apps/client/dist/` baked into the .exe at compile
/// time. Path is relative to the crate root (`apps/desktop/src-tauri/`).
///
/// Debug builds read each file fresh from disk on every request — edit
/// the SPA, refresh the page, no rebuild. Release builds bake the
/// gzipped bytes into the binary (~1 MB of compressed assets).
///
/// The embed only fires at compile time, so `apps/client/dist/` must
/// exist when `cargo build` runs. The Tauri wrapper's `beforeBuildCommand`
/// (`pnpm --filter @tarkov-checker/client build`) takes care of that for
/// the production build. For `cargo build` invoked directly the dev has
/// to build the SPA first; otherwise rust-embed emits a build-time error.
#[derive(rust_embed::Embed)]
#[folder = "../../client/dist/"]
struct EmbeddedSpa;

/// Axum `fallback` for any path not matched by the API/SSE routes.
///
/// Two responsibilities:
///   1. Serve the literal asset when the path matches a file in the
///      embedded dist (e.g. `/maps/Customs.svg`, `/assets/index-*.js`).
///   2. Fall back to `index.html` for any other path — SPA history
///      mode means routes like `/maps/customs` are client-side only,
///      the server has to hand back the shell so the Vue router can
///      take over.
///
/// `mime_guess` picks the right Content-Type from the file extension;
/// without it the browser refuses to execute JS served as
/// `application/octet-stream`.
async fn spa_fallback(uri: Uri) -> Response {
    let raw = uri.path().trim_start_matches('/');
    let path = if raw.is_empty() { "index.html" } else { raw };

    let (asset, served_path) = match EmbeddedSpa::get(path) {
        Some(file) => (file, path),
        // Unknown path → SPA history fallback. If index.html itself is
        // missing the dist is malformed; return 404 rather than masking it.
        None => match EmbeddedSpa::get("index.html") {
            Some(file) => (file, "index.html"),
            None => return StatusCode::NOT_FOUND.into_response(),
        },
    };

    let mime = mime_guess::from_path(served_path)
        .first_or_octet_stream()
        .as_ref()
        .to_string();
    ([(header::CONTENT_TYPE, mime)], asset.data.into_owned()).into_response()
}

fn cors_layer() -> CorsLayer {
    let origins: Vec<HeaderValue> = ALLOWED_ORIGINS
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::PUT, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE])
        // Chrome's Private Network Access policy: a public-origin page
        // (HTTPS on internet) hitting a private IP (127.0.0.1) needs an
        // explicit opt-in from the target. Without this header Chrome
        // will warn now and block in future versions.
        .allow_private_network(true)
        // Cache preflight result for a day — saves an OPTIONS round-trip
        // per request type. Browsers cap this at their own maximum
        // (Chromium = 2h, Firefox = 24h) so we just ask for the upper end.
        .max_age(Duration::from_secs(86400))
}

fn router(state: AppState, lan_mode: bool) -> Router {
    // Split routes by whether the bearer guard applies. `/api/ping` and
    // the SPA fallback stay open in both modes — the frontend hits
    // them to bootstrap before it has a token in hand. `/api/config`
    // (state-changing) and `/events` (live position stream) are the
    // ones we want gated when the listener is reachable from the LAN.
    let mut protected = Router::new()
        .route("/api/config", get(get_config_http).put(put_config_http))
        .route("/events", get(events_sse));

    if lan_mode {
        protected = protected.route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth_guard,
        ));
    }

    Router::new()
        .route("/api/ping", get(ping))
        .merge(protected)
        .with_state(state)
        // SPA fallback MUST come after the API/SSE routes and BEFORE
        // the CORS layer, so unknown paths hit `spa_fallback` instead
        // of 404'ing and the embedded HTML still picks up CORS headers
        // (irrelevant in the same-origin case but cheap and consistent).
        .fallback(spa_fallback)
        .layer(cors_layer())
}

/// Spawn the HTTP server. Returns immediately; the actual `serve()` runs
/// on a background tokio task. If binding fails (port busy, permission
/// denied), the error is logged and the rest of the app continues —
/// the HTTP frontend is optional, the Tauri webview path still works.
///
/// Reads `lan_mode` from the config store once at startup. Toggling it
/// later does NOT rebind the listener — see PLAN-LAN-AND-TRAY.md
/// "Restart-on-config-change" for the rationale.
pub fn spawn(deps: Deps) {
    let event_tx = deps.watcher_slot.event_sender();
    let state = AppState {
        auth_token: Arc::new(deps.auth_token),
        config_store: deps.config_store.clone(),
        watcher_slot: deps.watcher_slot,
        event_tx,
    };
    let app_handle = deps.app_handle;
    let config_store = deps.config_store;
    tauri::async_runtime::spawn(async move {
        let lan_mode = config_store.is_lan_mode().await;
        // LAN mode → `0.0.0.0` (any interface), otherwise loopback only.
        // Same port either way — see [`LISTEN_PORT`].
        let host = if lan_mode { [0, 0, 0, 0] } else { [127, 0, 0, 1] };
        let addr = SocketAddr::from((host, LISTEN_PORT));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(err) => {
                eprintln!("[http-server] bind {addr} failed: {err}");
                return;
            }
        };
        eprintln!(
            "[http-server] listening on http://{addr} (lan_mode={lan_mode}, auth={})",
            if lan_mode { "required" } else { "off" }
        );
        let app = router(state, lan_mode).layer(Extension(app_handle));
        if let Err(err) = axum::serve(listener, app).await {
            eprintln!("[http-server] serve loop ended: {err}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::Request as HttpRequest;
    use axum::middleware;
    use tower::ServiceExt;

    async fn test_state() -> AppState {
        // ConfigStore wants a file path it can write to. Tests use a
        // per-process tmp file; the file may not exist yet (load returns
        // empty state in that case).
        let tmp = std::env::temp_dir().join(format!(
            "tarkov-checker-test-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
        ));
        let store = ConfigStore::load(tmp)
            .await
            .expect("test config store should load");
        let watcher_slot = Arc::new(WatcherSlot::default());
        let event_tx = watcher_slot.event_sender();
        AppState {
            auth_token: Arc::new("unused-in-tests".to_string()),
            config_store: Arc::new(store),
            watcher_slot,
            event_tx,
        }
    }

    /// Test router that mirrors the production wiring. We deliberately
    /// delegate to the real [`router`] so any divergence (route order,
    /// fallback, layer stacking) is exercised by the suite. The only
    /// thing missing is the `Extension<AppHandle>` layer, which means
    /// a successful PUT /api/config would 500 — fine because no test
    /// fires PUT to completion (CORS preflight tests use OPTIONS only).
    fn test_router(state: AppState, lan_mode: bool) -> Router {
        router(state, lan_mode)
    }

    async fn body_text(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    // -----------------------------------------------------------------
    // /api/ping — public probe, always unauthenticated. Surfaces a
    // `paired` flag that reflects whether the request carried a valid
    // bearer (so frontends can detect a stale localStorage token).
    // -----------------------------------------------------------------

    const PING_TEST_TOKEN: &str = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    async fn ping_test_state() -> AppState {
        let mut state = test_state().await;
        state.auth_token = Arc::new(PING_TEST_TOKEN.to_string());
        state
    }

    #[tokio::test]
    async fn ping_returns_identity_json() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/ping")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = body_text(response).await;
        assert!(body.contains("\"name\":\"tarkov-checker\""), "body: {body}");
        assert!(body.contains("\"status\":\"ok\""), "body: {body}");
    }

    #[tokio::test]
    async fn ping_paired_false_when_no_token() {
        let response = test_router(ping_test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/ping")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_text(response).await;
        assert!(body.contains("\"paired\":false"), "body: {body}");
    }

    #[tokio::test]
    async fn ping_paired_true_with_valid_bearer_header() {
        let response = test_router(ping_test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/ping")
                    .header(header::AUTHORIZATION, format!("Bearer {PING_TEST_TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_text(response).await;
        assert!(body.contains("\"paired\":true"), "body: {body}");
    }

    #[tokio::test]
    async fn ping_paired_true_with_valid_query_token() {
        // EventSource cannot set headers — query path must work too.
        let response = test_router(ping_test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/api/ping?token={PING_TEST_TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_text(response).await;
        assert!(body.contains("\"paired\":true"), "body: {body}");
    }

    #[tokio::test]
    async fn ping_paired_false_with_wrong_token() {
        let response = test_router(ping_test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/ping")
                    .header(header::AUTHORIZATION, "Bearer wrong-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = body_text(response).await;
        assert!(body.contains("\"paired\":false"), "body: {body}");
    }

    // -----------------------------------------------------------------
    // /api/config — open access on localhost, browser-origin is the gate
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn get_config_returns_json_with_no_auth() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/config")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = body_text(response).await;
        // Shape of ResolvedPaths: three slots, each with value/source/exists.
        assert!(body.contains("gameDir"), "body: {body}");
        assert!(body.contains("screenshotsDir"), "body: {body}");
    }

    // -----------------------------------------------------------------
    // /events — SSE smoke test (handler opens, sends correct headers)
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn events_endpoint_opens_with_sse_content_type() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        // axum's Sse response sets text/event-stream automatically.
        assert!(ct.starts_with("text/event-stream"), "content-type: {ct}");
    }

    // -----------------------------------------------------------------
    // SPA fallback (embedded apps/client/dist/)
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn spa_fallback_root_returns_index_html() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert!(ct.starts_with("text/html"), "content-type: {ct}");
        let body = body_text(response).await;
        // index.html mounts the Vue app into <div id="app">.
        assert!(body.contains("id=\"app\""), "body missing app root: {body}");
    }

    #[tokio::test]
    async fn spa_fallback_unknown_route_returns_index_html() {
        // SPA history mode: any non-API path that does NOT match an
        // asset must return the same shell so the client-side router
        // can resolve it.
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/some/deep/route")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = body_text(response).await;
        assert!(body.contains("id=\"app\""), "body missing app root: {body}");
    }

    #[tokio::test]
    async fn spa_fallback_serves_static_asset_with_mime() {
        // favicon.svg is generated by the client build and lives at
        // apps/client/dist/favicon.svg — a stable target across builds.
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/favicon.svg")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert_eq!(ct, "image/svg+xml");
    }

    // -----------------------------------------------------------------
    // CORS preflight + Origin-allowlist (via tower-http CorsLayer)
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn cors_preflight_with_allowed_origin_passes() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .method(Method::OPTIONS)
                    .uri("/api/config")
                    .header(header::ORIGIN, "http://localhost:5173")
                    .header("access-control-request-method", "PUT")
                    .header("access-control-request-headers", "content-type")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        // CorsLayer answers preflight directly; status is 200 OK.
        assert!(
            response.status().is_success(),
            "status: {}",
            response.status()
        );
        let acao = response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .and_then(|v| v.to_str().ok());
        assert_eq!(acao, Some("http://localhost:5173"));
        // PNA opt-in must be present for Chrome to accept the target.
        let acapn = response
            .headers()
            .get("access-control-allow-private-network")
            .and_then(|v| v.to_str().ok());
        assert_eq!(acapn, Some("true"));
    }

    #[tokio::test]
    async fn cors_preflight_with_unknown_origin_gets_no_acao() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .method(Method::OPTIONS)
                    .uri("/api/config")
                    .header(header::ORIGIN, "https://evil.example.com")
                    .header("access-control-request-method", "PUT")
                    .header("access-control-request-headers", "content-type")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        // No allowlist match → no ACAO header → browser rejects in JS land.
        assert!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .is_none(),
            "evil origin should not get an ACAO echo"
        );
    }

    #[tokio::test]
    async fn simple_get_from_allowed_origin_carries_acao_in_response() {
        let response = test_router(test_state().await, false)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/config")
                    .header(header::ORIGIN, "http://localhost:5173")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let acao = response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .and_then(|v| v.to_str().ok());
        assert_eq!(acao, Some("http://localhost:5173"));
    }

    // -----------------------------------------------------------------
    // auth_guard middleware — focused tests against a small dummy
    // router. Decouples middleware behaviour from the real route names
    // so refactors to /api/config / /events don't churn these.
    // -----------------------------------------------------------------

    const TEST_TOKEN: &str = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

    fn router_with_auth_guard(token: &str) -> Router {
        let watcher_slot = Arc::new(WatcherSlot::default());
        let event_tx = watcher_slot.event_sender();
        let state = AppState {
            auth_token: Arc::new(token.to_string()),
            config_store: Arc::new(
                tauri::async_runtime::block_on(ConfigStore::load(std::env::temp_dir().join(
                    format!("tarkov-checker-test-guard-{}.json", std::process::id()),
                )))
                .expect("test config store should load"),
            ),
            watcher_slot,
            event_tx,
        };
        Router::new()
            .route("/api/_test_protected", get(|| async { "ok" }))
            .route_layer(middleware::from_fn_with_state(state.clone(), auth_guard))
            .with_state(state)
    }

    #[tokio::test]
    async fn auth_guard_without_header_returns_401() {
        let response = router_with_auth_guard(TEST_TOKEN)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/_test_protected")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn auth_guard_with_valid_token_passes() {
        let response = router_with_auth_guard(TEST_TOKEN)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/_test_protected")
                    .header(header::AUTHORIZATION, format!("Bearer {TEST_TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn auth_guard_with_wrong_token_returns_401() {
        let response = router_with_auth_guard(TEST_TOKEN)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/_test_protected")
                    .header(header::AUTHORIZATION, "Bearer wrong-token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    // -----------------------------------------------------------------
    // extract_bearer_token — dual extraction (header OR query)
    // -----------------------------------------------------------------

    #[test]
    fn extract_token_picks_header_first() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer header-token"),
        );
        let uri: Uri = "/anything?token=query-token".parse().unwrap();
        // Header wins when both are present.
        assert_eq!(
            extract_bearer_token(&headers, &uri).as_deref(),
            Some("header-token")
        );
    }

    #[test]
    fn extract_token_falls_back_to_query() {
        let headers = HeaderMap::new();
        let uri: Uri = "/events?token=query-only-token".parse().unwrap();
        assert_eq!(
            extract_bearer_token(&headers, &uri).as_deref(),
            Some("query-only-token")
        );
    }

    #[test]
    fn extract_token_returns_none_when_missing() {
        let headers = HeaderMap::new();
        let uri: Uri = "/api/ping".parse().unwrap();
        assert!(extract_bearer_token(&headers, &uri).is_none());
    }

    #[test]
    fn extract_token_ignores_unrelated_query_params() {
        let headers = HeaderMap::new();
        let uri: Uri = "/events?foo=bar&token=hex123&baz=qux".parse().unwrap();
        assert_eq!(
            extract_bearer_token(&headers, &uri).as_deref(),
            Some("hex123")
        );
    }

    #[test]
    fn extract_token_ignores_malformed_authorization_header() {
        let mut headers = HeaderMap::new();
        // Wrong scheme (Basic instead of Bearer) — must not be picked up.
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Basic dXNlcjpwYXNz"),
        );
        let uri: Uri = "/api/ping".parse().unwrap();
        assert!(extract_bearer_token(&headers, &uri).is_none());
    }

    // -----------------------------------------------------------------
    // LAN-mode wiring: protected vs always-open routes
    // -----------------------------------------------------------------

    const LAN_TEST_TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    async fn lan_test_state() -> AppState {
        let mut state = test_state().await;
        state.auth_token = Arc::new(LAN_TEST_TOKEN.to_string());
        state
    }

    #[tokio::test]
    async fn lan_mode_blocks_get_config_without_token() {
        let response = test_router(lan_test_state().await, true)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/config")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn lan_mode_allows_get_config_with_valid_bearer() {
        let response = test_router(lan_test_state().await, true)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/config")
                    .header(header::AUTHORIZATION, format!("Bearer {LAN_TEST_TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn lan_mode_blocks_events_without_token() {
        let response = test_router(lan_test_state().await, true)
            .oneshot(
                HttpRequest::builder()
                    .uri("/events")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn lan_mode_allows_events_with_query_token() {
        // EventSource path — token via query, never header.
        let response = test_router(lan_test_state().await, true)
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/events?token={LAN_TEST_TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        // SSE content-type confirms the stream opened, not just a 200.
        let ct = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert!(ct.starts_with("text/event-stream"), "content-type: {ct}");
    }

    #[tokio::test]
    async fn lan_mode_keeps_ping_open() {
        // Phone bootstrap: /api/ping must work without a token even in
        // LAN mode so the frontend can detect helper presence before
        // pairing.
        let response = test_router(lan_test_state().await, true)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/ping")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn lan_mode_keeps_spa_shell_open() {
        // Phone bootstrap: the SPA shell must load without a token so
        // the JS can read the `#token=` fragment and store it.
        let response = test_router(lan_test_state().await, true)
            .oneshot(
                HttpRequest::builder()
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
