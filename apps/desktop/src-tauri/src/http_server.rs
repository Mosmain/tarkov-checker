//! Local HTTP server on `0.0.0.0:47474` (same-Wi-Fi trust).
//! Release builds also serve the embedded SPA; dev mode leaves that to Vite.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

#[cfg(not(debug_assertions))]
use axum::http::Uri;
use axum::{
    extract::State,
    http::{header, HeaderValue, Method, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
    routing::{get, post},
    Extension, Router,
};
use futures_util::stream::{Stream, StreamExt};
use serde::Serialize;
use tauri::AppHandle;
use tokio::sync::broadcast;
use tokio_stream::wrappers::{errors::BroadcastStreamRecvError, BroadcastStream};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::hotkeys::HotkeyController;
use crate::server::config::{ConfigPatch, ConfigStore};
use crate::server::events::ServerEvent;
use crate::server::hotkeys::{HotkeyConfig, HotkeyPatch, HotkeyStore};
use crate::server::paths::{self, ConfigResponse};
use crate::watcher::{self, WatcherSlot};

pub const LISTEN_PORT: u16 = 47474;

const ALLOWED_ORIGINS: &[&str] = &[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mosmain.github.io",
];

/// Inputs needed to start the HTTP server.
pub struct Deps {
    pub config_store: Arc<ConfigStore>,
    pub watcher_slot: Arc<WatcherSlot>,
    pub app_handle: Option<AppHandle>,
    pub hotkey_store: Arc<HotkeyStore>,
    pub hotkeys: Arc<dyn HotkeyController>,
}

/// Per-server shared state. Cheap to clone (Arc all the way down).
///
/// `AppHandle` is deliberately NOT here — it lives as an axum `Extension`
/// layer instead. This keeps `AppState` constructable in unit tests
/// without needing `tauri::test::mock_app()` and its feature flag. The
/// PUT handler grabs the handle via `Extension<AppHandle>`.
#[derive(Clone)]
struct AppState {
    config_store: Arc<ConfigStore>,
    #[allow(dead_code)] // held so dropping it doesn't tear down event_tx subscribers
    watcher_slot: Arc<WatcherSlot>,
    /// Broadcast sender shared with the watcher modules; the SSE handler
    /// calls `subscribe()` on it per connection to get a fresh receiver.
    /// Held here (not inside WatcherSlot directly) so the HTTP handler
    /// can grab a clone without indirecting through the slot.
    event_tx: broadcast::Sender<ServerEvent>,
    /// Backend-owned global hotkey combos (persisted in hotkeys.json).
    hotkey_store: Arc<HotkeyStore>,
    /// Registers/reconciles the OS-global hotkeys from `hotkey_store`.
    hotkeys: Arc<dyn HotkeyController>,
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
async fn get_config_http(State(state): State<AppState>) -> Json<ConfigResponse> {
    let overrides = state.config_store.overrides().await;
    Json(ConfigResponse {
        paths: paths::resolve(&overrides),
        delete_screenshots: state.config_store.delete_screenshots().await,
    })
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
    Extension(app): Extension<Option<AppHandle>>,
    Json(patch): Json<ConfigPatch>,
) -> Result<Json<ConfigResponse>, (StatusCode, Json<ConfigError>)> {
    state.config_store.apply(patch).await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ConfigError {
                error: e.to_string(),
            }),
        )
    })?;
    let delete_screenshots = state.config_store.delete_screenshots().await;
    // Update the slot before re-applying so the restarted watcher sees it.
    state
        .watcher_slot
        .set_delete_screenshots(delete_screenshots);
    let resolved = paths::resolve(&state.config_store.overrides().await);
    watcher::apply_resolved(app.as_ref(), &state.watcher_slot, &resolved).await;
    Ok(Json(ConfigResponse {
        paths: resolved,
        delete_screenshots,
    }))
}

/// `GET /api/hotkeys` — the backend-owned combos. Same JSON the Tauri
/// `get_hotkeys` IPC command returns.
async fn get_hotkeys_http(State(state): State<AppState>) -> Json<HotkeyConfig> {
    Json(state.hotkey_store.get().await)
}

/// `PUT /api/hotkeys` — validate + persist the patch, then (re)register the
/// OS-global hotkeys. If a combo can't be claimed the manager reverts that
/// field; the *effective* config is persisted and returned so the client
/// snaps the recorder back. Unparseable combo → 400.
async fn put_hotkeys_http(
    State(state): State<AppState>,
    Json(patch): Json<HotkeyPatch>,
) -> Result<Json<HotkeyConfig>, (StatusCode, Json<ConfigError>)> {
    let merged = state
        .hotkey_store
        .apply(patch)
        .await
        .map_err(|error| (StatusCode::BAD_REQUEST, Json(ConfigError { error })))?;

    // Registration blocks (round-trips to the main / pump thread); keep it off
    // the async worker.
    let hotkeys = state.hotkeys.clone();
    let to_apply = merged.clone();
    let effective = tokio::task::spawn_blocking(move || hotkeys.apply(&to_apply))
        .await
        .unwrap_or(merged.clone());

    // Persist the revert if a field couldn't be registered.
    if effective != merged {
        if let Err(err) = state.hotkey_store.set(effective.clone()).await {
            eprintln!("[hotkeys] persist effective config failed: {err:#}");
        }
    }
    // Notify the other clients (browser/phone over SSE) so their view re-syncs.
    let _ = state.event_tx.send(ServerEvent::Hotkeys {
        config: effective.clone(),
    });
    Ok(Json(effective))
}

/// `POST /api/hotkeys/suspend` — drop all OS binds while a recorder captures.
async fn suspend_hotkeys_http(State(state): State<AppState>) -> StatusCode {
    let hotkeys = state.hotkeys.clone();
    let _ = tokio::task::spawn_blocking(move || hotkeys.suspend()).await;
    StatusCode::NO_CONTENT
}

/// `POST /api/hotkeys/resume` — re-claim the combos after capture finishes.
async fn resume_hotkeys_http(State(state): State<AppState>) -> StatusCode {
    let hotkeys = state.hotkeys.clone();
    let _ = tokio::task::spawn_blocking(move || hotkeys.resume()).await;
    StatusCode::NO_CONTENT
}

// Release-only: bake apps/client/dist/ into the .exe. In dev the SPA is
// served by Vite, so the helper just 404s on non-API paths.
#[cfg(not(debug_assertions))]
#[derive(rust_embed::Embed)]
#[folder = "../../client/dist/"]
struct EmbeddedSpa;

#[cfg(not(debug_assertions))]
async fn spa_fallback(uri: Uri) -> Response {
    let raw = uri.path().trim_start_matches('/');
    let path = if raw.is_empty() { "index.html" } else { raw };
    let (asset, served) = match EmbeddedSpa::get(path) {
        Some(file) => (file, path),
        None => match EmbeddedSpa::get("index.html") {
            Some(file) => (file, "index.html"),
            None => return StatusCode::NOT_FOUND.into_response(),
        },
    };
    let mime = mime_guess::from_path(served)
        .first_or_octet_stream()
        .as_ref()
        .to_string();
    let cache = if served.starts_with("assets/") {
        // Vite content-hashes everything under assets/ — cacheable forever.
        "public, max-age=31536000, immutable"
    } else {
        // index.html + unhashed public files (maps, fonts, manifest): always
        // revalidate, so a self-updated exe serves its fresh frontend instead
        // of a browser-cached copy of the previous version.
        "no-cache"
    };
    (
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, cache.to_string()),
        ],
        asset.data.into_owned(),
    )
        .into_response()
}

#[cfg(debug_assertions)]
async fn spa_fallback() -> Response {
    (
        StatusCode::NOT_FOUND,
        "Dev: SPA is served by Vite on :5173. Helper only serves /api/* and /events.",
    )
        .into_response()
}

fn cors_layer() -> CorsLayer {
    let origins: Vec<HeaderValue> = ALLOWED_ORIGINS
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::PUT, Method::POST, Method::OPTIONS])
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
        .route("/api/hotkeys", get(get_hotkeys_http).put(put_hotkeys_http))
        .route("/api/hotkeys/suspend", post(suspend_hotkeys_http))
        .route("/api/hotkeys/resume", post(resume_hotkeys_http))
        .route("/events", get(events_sse))
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
pub fn spawn(deps: Deps) {
    let event_tx = deps.watcher_slot.event_sender();
    let state = AppState {
        config_store: deps.config_store,
        watcher_slot: deps.watcher_slot,
        event_tx,
        hotkey_store: deps.hotkey_store,
        hotkeys: deps.hotkeys,
    };
    let app_handle = deps.app_handle;
    tauri::async_runtime::spawn(async move {
        // Always 0.0.0.0 — the LAN-phone scenario needs it, and same-
        // machine browsers reach the port via localhost regardless.
        let addr = SocketAddr::from(([0, 0, 0, 0], LISTEN_PORT));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(err) => {
                eprintln!("[http-server] bind {addr} failed: {err}");
                return;
            }
        };
        // Children must not inherit the listener (WebView2 helpers, the
        // self-update respawn): an inherited handle keeps the port bound
        // after this process exits and the successor's bind dies with 10048.
        #[cfg(windows)]
        unsafe {
            use std::os::windows::io::AsRawSocket;
            use windows_sys::Win32::Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT};
            SetHandleInformation(
                listener.as_raw_socket() as usize as _,
                HANDLE_FLAG_INHERIT,
                0,
            );
        }
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
    use axum::body::{to_bytes, Body};
    use axum::http::Request as HttpRequest;
    use tower::ServiceExt;

    /// No-op hotkey controller — the route tests never register real OS
    /// hotkeys, they only exercise the HTTP wiring + store.
    struct NoopHotkeys;
    impl HotkeyController for NoopHotkeys {
        fn apply(&self, desired: &HotkeyConfig) -> HotkeyConfig {
            desired.clone()
        }
        fn suspend(&self) {}
        fn resume(&self) {}
    }

    fn tmp_json(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "tarkov-checker-test-{tag}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
        ))
    }

    async fn test_state() -> AppState {
        // ConfigStore wants a file path it can write to. Tests use a
        // per-process tmp file; the file may not exist yet (load returns
        // empty state in that case).
        let store = ConfigStore::load(tmp_json("config"))
            .await
            .expect("test config store should load");
        let hotkey_store = HotkeyStore::load(tmp_json("hotkeys"))
            .await
            .expect("test hotkey store should load");
        let watcher_slot = Arc::new(WatcherSlot::default());
        let event_tx = watcher_slot.event_sender();
        AppState {
            config_store: Arc::new(store),
            watcher_slot,
            event_tx,
            hotkey_store: Arc::new(hotkey_store),
            hotkeys: Arc::new(NoopHotkeys),
        }
    }

    /// Test router that mirrors the production wiring. We deliberately
    /// delegate to the real [`router`] so any divergence (route order,
    /// fallback, layer stacking) is exercised by the suite. The only
    /// thing missing is the `Extension<AppHandle>` layer, which means
    /// a successful PUT /api/config would 500 — fine because no test
    /// fires PUT to completion (CORS preflight tests use OPTIONS only).
    fn test_router(state: AppState) -> Router {
        router(state)
    }

    async fn body_text(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    // -----------------------------------------------------------------
    // /api/ping — identity probe, always open
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
    // /api/config — open access on the trusted LAN
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn get_config_returns_json() {
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
    // /api/hotkeys — backend-owned combos
    // -----------------------------------------------------------------

    #[tokio::test]
    async fn get_hotkeys_returns_defaults() {
        let response = test_router(test_state().await)
            .oneshot(
                HttpRequest::builder()
                    .uri("/api/hotkeys")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = body_text(response).await;
        assert!(body.contains("\"zoomIn\""), "body: {body}");
        assert!(body.contains("\"airdrop\""), "body: {body}");
    }

    #[tokio::test]
    async fn put_hotkeys_applies_valid_patch() {
        // Unlike PUT /api/config, the hotkeys PUT needs no Extension<AppHandle>
        // (NoopHotkeys in test state), so it runs to completion here.
        let response = test_router(test_state().await)
            .oneshot(
                HttpRequest::builder()
                    .method(Method::PUT)
                    .uri("/api/hotkeys")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"zoomIn":"CommandOrControl+Alt+Z"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = body_text(response).await;
        assert!(
            body.contains("CommandOrControl+Alt+Z"),
            "effective config should echo the new combo: {body}"
        );
    }

    #[tokio::test]
    async fn put_hotkeys_rejects_unparseable_combo() {
        let response = test_router(test_state().await)
            .oneshot(
                HttpRequest::builder()
                    .method(Method::PUT)
                    .uri("/api/hotkeys")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"airdrop":"not+a+real+key"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn suspend_resume_hotkeys_return_no_content() {
        for path in ["/api/hotkeys/suspend", "/api/hotkeys/resume"] {
            let response = test_router(test_state().await)
                .oneshot(
                    HttpRequest::builder()
                        .method(Method::POST)
                        .uri(path)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NO_CONTENT, "path: {path}");
        }
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
                    // Chrome sends this on public→private preflights; the
                    // allow header below is only emitted in response to it.
                    .header("access-control-request-private-network", "true")
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
}
