//! Local HTTP server for the future "browser as frontend" mode.
//!
//! Listens on `127.0.0.1:47474` by default. The Tauri webview keeps talking
//! to the Rust core via IPC (`invoke`/`listen`); this server exists so the
//! same core can also serve a frontend running in a real browser (the
//! hosted page on GitHub Pages / a domain).
//!
//! Security model — see also CLAUDE.md "Future architecture":
//!
//! * Bind to `127.0.0.1` only. No LAN exposure unless the user explicitly
//!   opts into the (future) `lan_mode` toggle.
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
//! * Token auth (`auth_guard`) exists in this module but is NOT applied
//!   to any production route today. It will be wired in when the LAN
//!   mode lands and we open the listener to `0.0.0.0`. The token itself
//!   is still generated and persisted on first run so that switching to
//!   LAN mode does not require any bootstrap on the helper side.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    Extension, Router,
    extract::{Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::Next,
    response::{
        Json, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::get,
};
use futures_util::stream::{Stream, StreamExt};
use tokio_stream::wrappers::{BroadcastStream, errors::BroadcastStreamRecvError};
use serde::Serialize;
use subtle::ConstantTimeEq;
use tauri::AppHandle;
use tokio::sync::broadcast;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::events::ServerEvent;
use crate::server::paths::{self, ResolvedPaths};
use crate::watcher::{self, WatcherSlot};

const LISTEN_ADDR: &str = "127.0.0.1:47474";

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
    /// Reserved for LAN-mode bearer-token validation. Currently unread
    /// by any production route — kept in state so wiring `auth_guard`
    /// back is a one-line change.
    #[allow(dead_code)]
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
}

async fn ping() -> Json<PingResponse> {
    Json(PingResponse {
        name: "tarkov-checker",
        version: env!("CARGO_PKG_VERSION"),
        status: "ok",
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

/// Extracts `Authorization: Bearer <value>` and compares it against the
/// expected token in constant time. Missing/malformed header → `false`.
///
/// Kept available for the future LAN-mode token enforcement. Not used
/// by any production route in the current localhost-only build.
#[allow(dead_code)] // re-wired when LAN-mode lands
fn bearer_matches(headers: &axum::http::HeaderMap, expected: &str) -> bool {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return false;
    };
    let Ok(s) = value.to_str() else {
        return false;
    };
    let Some(token) = s.strip_prefix("Bearer ") else {
        return false;
    };
    // Constant-time compare — a regular `==` would short-circuit on the
    // first mismatching byte, giving a timing oracle on the token.
    token.as_bytes().ct_eq(expected.as_bytes()).into()
}

/// Requires a valid Bearer token. Currently unused — kept here so LAN
/// mode can apply it as a `route_layer` without re-implementing the
/// middleware shape.
#[allow(dead_code)] // re-wired when LAN-mode lands
async fn auth_guard(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if bearer_matches(req.headers(), &state.auth_token) {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
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

fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/ping", get(ping))
        .route("/api/config", get(get_config_http).put(put_config_http))
        .route("/events", get(events_sse))
        .with_state(state)
        .layer(cors_layer())
}

/// Spawn the HTTP server. Returns immediately; the actual `serve()` runs
/// on a background tokio task. If binding fails (port busy, permission
/// denied), the error is logged and the rest of the app continues —
/// the HTTP frontend is optional, the Tauri webview path still works.
pub fn spawn(deps: Deps) {
    let event_tx = deps.watcher_slot.event_sender();
    let state = AppState {
        auth_token: Arc::new(deps.auth_token),
        config_store: deps.config_store,
        watcher_slot: deps.watcher_slot,
        event_tx,
    };
    let app_handle = deps.app_handle;
    tauri::async_runtime::spawn(async move {
        let addr: SocketAddr = match LISTEN_ADDR.parse() {
            Ok(a) => a,
            Err(err) => {
                eprintln!("[http-server] invalid LISTEN_ADDR {LISTEN_ADDR}: {err}");
                return;
            }
        };
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(err) => {
                eprintln!("[http-server] bind {addr} failed: {err}");
                return;
            }
        };
        eprintln!("[http-server] listening on http://{addr}");
        let app = router(state).layer(Extension(app_handle));
        if let Err(err) = axum::serve(listener, app).await {
            eprintln!("[http-server] serve loop ended: {err}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
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

    fn test_router(state: AppState) -> Router {
        // Production router includes the CorsLayer; the test router omits
        // the Extension<AppHandle> layer because we never exercise PUT to
        // a successful conclusion in unit tests (it needs a real AppHandle
        // to fire watcher::apply_resolved).
        Router::new()
            .route("/api/ping", get(ping))
            .route("/api/config", get(get_config_http).put(put_config_http))
            .route("/events", get(events_sse))
            .with_state(state)
            .layer(cors_layer())
    }

    async fn body_text(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    // -----------------------------------------------------------------
    // /api/ping — public, no auth, just identity probe
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn ping_returns_identity_json() {
        let response = test_router(test_state().await)
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

    // -----------------------------------------------------------------
    // /api/config — open access on localhost, browser-origin is the gate
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn get_config_returns_json_with_no_auth() {
        let response = test_router(test_state().await)
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
        let response = test_router(test_state().await)
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
    // CORS preflight + Origin-allowlist (via tower-http CorsLayer)
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn cors_preflight_with_allowed_origin_passes() {
        let response = test_router(test_state().await)
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
        assert!(response.status().is_success(), "status: {}", response.status());
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
        let response = test_router(test_state().await)
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
        let response = test_router(test_state().await)
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
    // auth_guard middleware (dormant production-side, still tested so
    // wiring it back for LAN-mode is a single .route_layer(...) line)
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
}
