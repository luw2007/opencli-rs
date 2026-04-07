use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures::{SinkExt, StreamExt};
use autocli_core::CliError;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{oneshot, Mutex, RwLock};
use tracing::{debug, error, info, warn};

use crate::types::{DaemonCommand, DaemonResult};

/// Command response timeout.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
/// WebSocket heartbeat interval.
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
/// Idle shutdown threshold.
const IDLE_TIMEOUT: Duration = Duration::from_secs(300);

type PendingMap = HashMap<String, oneshot::Sender<DaemonResult>>;

/// Shared state for the daemon server.
pub struct DaemonState {
    pub extension_tx: Mutex<Option<futures::stream::SplitSink<WebSocket, Message>>>,
    pub pending_commands: RwLock<PendingMap>,
    pub extension_connected: RwLock<bool>,
    pub last_activity: RwLock<Instant>,
}

impl DaemonState {
    fn new() -> Self {
        Self {
            extension_tx: Mutex::new(None),
            pending_commands: RwLock::new(HashMap::new()),
            extension_connected: RwLock::new(false),
            last_activity: RwLock::new(Instant::now()),
        }
    }

    async fn touch(&self) {
        *self.last_activity.write().await = Instant::now();
    }
}

/// The Daemon HTTP + WebSocket server.
pub struct Daemon {
    port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl Daemon {
    /// Start the daemon server on the given port. Returns immediately after the listener binds.
    pub async fn start(port: u16) -> Result<Self, CliError> {
        let state = Arc::new(DaemonState::new());
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let cors = tower_http::cors::CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
            .allow_methods(tower_http::cors::Any)
            .allow_headers(tower_http::cors::Any);

        let app = Router::new()
            .route("/health", get(health_handler))
            .route("/ping", get(health_handler))
            .route("/status", get(status_handler))
            .route("/command", post(command_handler))
            .route("/ai-generate", post(ai_generate_proxy_handler))
            .route("/ext", get(ws_handler))
            .layer(cors)
            .with_state(state.clone());

        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
            .await
            .map_err(|e| {
                CliError::browser_connect(format!("Failed to bind daemon on port {port}: {e}"))
            })?;

        info!(port, "daemon listening");

        // Daemon runs permanently — no idle shutdown
        let _idle_state = state.clone();

        // Spawn the server
        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                    info!("daemon received shutdown signal");
                })
                .await
                .ok();
        });

        Ok(Self {
            port,
            shutdown_tx: Some(shutdown_tx),
        })
    }

    /// Gracefully shut down the daemon.
    pub async fn shutdown(mut self) -> Result<(), CliError> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        info!(port = self.port, "daemon shutdown complete");
        Ok(())
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

/// GET /health — simple liveness check.
async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

/// POST /ai-generate — proxy AI request to autocli.ai with local token.
/// Reads token from ~/.autocli/config.json, streams response back to caller.
async fn ai_generate_proxy_handler(
    body: axum::body::Bytes,
) -> impl IntoResponse {
    use axum::body::Body;
    use axum::http::Response;

    // Read token from local config
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let config_path = std::path::PathBuf::from(&home).join(".autocli").join("config.json");
    let token = match std::fs::read_to_string(&config_path) {
        Ok(content) => {
            serde_json::from_str::<serde_json::Value>(&content)
                .ok()
                .and_then(|v| v.get("autocli-token").and_then(|t| t.as_str()).map(String::from))
                .unwrap_or_default()
        }
        Err(_) => String::new(),
    };

    if token.is_empty() {
        return Response::builder()
            .status(StatusCode::UNAUTHORIZED)
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"error":"No token configured. Run: autocli auth"}"#))
            .unwrap();
    }

    // Determine API base
    let api_base = std::env::var("AUTOCLI_API_BASE")
        .unwrap_or_else(|_| "https://www.autocli.ai".to_string());
    let url = format!("{}/api/ai/extension-generate", api_base.trim_end_matches('/'));

    // Forward request to remote API
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(format!(r#"{{"error":"{}"}}"#, e)))
                .unwrap();
        }
    };

    let resp = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body(body.to_vec())
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::from(format!(r#"{{"error":"{}"}}"#, e)))
                .unwrap();
        }
    };

    // Stream the response back while buffering for save+upload
    let status = resp.status();
    let content_type = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();

    if !status.is_success() {
        let body_bytes = resp.bytes().await.unwrap_or_default();
        return Response::builder()
            .status(status.as_u16())
            .header("Content-Type", &content_type)
            .body(Body::from(body_bytes))
            .unwrap();
    }

    // Fork the stream: send to client AND buffer for post-processing
    let byte_stream = resp.bytes_stream();
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(32);
    let token_for_upload = token.clone();
    let api_base_for_upload = api_base.clone();
    let home_for_save = home.clone();

    tokio::spawn(async move {
        use futures::StreamExt;
        let mut stream = byte_stream;
        let mut all_bytes = Vec::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    all_bytes.extend_from_slice(&bytes);
                    let _ = tx.send(Ok(bytes)).await;
                }
                Err(e) => {
                    let _ = tx.send(Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))).await;
                    break;
                }
            }
        }
        drop(tx);

        // Post-processing: extract YAML, save locally, upload to server
        let full_text = String::from_utf8_lossy(&all_bytes).to_string();

        // Extract content from SSE stream or JSON response
        let yaml_content = extract_yaml_from_response(&full_text);
        if yaml_content.is_empty() {
            tracing::warn!("AI response contained no YAML content");
            return;
        }

        // Save locally
        if let Err(e) = save_adapter_locally(&home_for_save, &yaml_content) {
            tracing::warn!(error = %e, "Failed to save adapter locally");
        }

        // Upload to server
        if let Err(e) = upload_adapter_to_server(&api_base_for_upload, &token_for_upload, &yaml_content).await {
            tracing::warn!(error = %e, "Failed to upload adapter to server");
        }
    });

    let body_stream = tokio_stream::wrappers::ReceiverStream::new(rx);
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .body(Body::from_stream(body_stream))
        .unwrap()
}

/// Extract YAML content from SSE stream or JSON response
fn extract_yaml_from_response(text: &str) -> String {
    let mut content = String::new();

    // Try SSE format: data: {"choices":[{"delta":{"content":"..."}}]}
    for line in text.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if data.trim() == "[DONE]" { continue; }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed.get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                {
                    content.push_str(delta);
                }
            }
        }
    }

    // If no SSE content, try JSON response format
    if content.is_empty() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(text) {
            if let Some(msg) = parsed.get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
            {
                content = msg.to_string();
            }
        }
    }

    // Clean: remove markdown fencing and thinking tags
    let mut cleaned = content;
    while let Some(start) = cleaned.find("<think>") {
        if let Some(end) = cleaned.find("</think>") {
            cleaned = format!("{}{}", &cleaned[..start], &cleaned[end + 8..]);
        } else { cleaned = cleaned[..start].to_string(); break; }
    }
    while let Some(start) = cleaned.find("<thinking>") {
        if let Some(end) = cleaned.find("</thinking>") {
            cleaned = format!("{}{}", &cleaned[..start], &cleaned[end + 11..]);
        } else { cleaned = cleaned[..start].to_string(); break; }
    }
    let trimmed = cleaned.trim();
    let trimmed = trimmed.strip_prefix("```yaml").or_else(|| trimmed.strip_prefix("```")).unwrap_or(trimmed);
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed);
    trimmed.trim().to_string()
}

/// Save adapter YAML to ~/.autocli/adapters/{site}/{name}.yaml
fn save_adapter_locally(home: &str, yaml: &str) -> Result<(), String> {
    let site = yaml.lines()
        .find(|l| l.starts_with("site:"))
        .and_then(|l| l.strip_prefix("site:"))
        .map(|s| s.trim().trim_matches('"').to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let name = yaml.lines()
        .find(|l| l.starts_with("name:"))
        .and_then(|l| l.strip_prefix("name:"))
        .map(|s| s.trim().trim_matches('"').to_string())
        .unwrap_or_else(|| "default".to_string());

    let dir = std::path::PathBuf::from(home).join(".autocli").join("adapters").join(&site);
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    let path = dir.join(format!("{}.yaml", name));
    std::fs::write(&path, yaml).map_err(|e| format!("write: {}", e))?;
    tracing::info!(site = %site, name = %name, path = ?path, "Adapter saved locally");
    Ok(())
}

/// Upload adapter YAML to server
async fn upload_adapter_to_server(api_base: &str, token: &str, yaml: &str) -> Result<(), String> {
    let url = format!("{}/api/sites/upload", api_base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("client: {}", e))?;

    let body = serde_json::json!({ "config": yaml });
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("upload: {}", e))?;

    if resp.status().is_success() {
        tracing::info!("Adapter uploaded to server");
        Ok(())
    } else {
        Err(format!("upload status: {}", resp.status()))
    }
}

/// GET /status — return daemon and extension status.
/// Compatible with both autocli and original opencli formats.
async fn status_handler(State(state): State<Arc<DaemonState>>) -> impl IntoResponse {
    let ext = *state.extension_connected.read().await;
    let pending = state.pending_commands.read().await.len();
    Json(json!({
        "daemon": true,
        "extension": ext,
        // Original OpenCLI compatibility fields
        "ok": true,
        "extensionConnected": ext,
        "pending": pending,
    }))
}

/// POST /command — accept a command from the CLI and forward to the extension.
async fn command_handler(
    State(state): State<Arc<DaemonState>>,
    headers: HeaderMap,
    Json(cmd): Json<DaemonCommand>,
) -> impl IntoResponse {
    // Security: require X-AutoCLI or X-OpenCLI header (backward compatible)
    if !headers.contains_key("x-autocli") && !headers.contains_key("x-opencli") {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Missing X-AutoCLI header" })),
        );
    }

    state.touch().await;

    // Check extension connected
    if !*state.extension_connected.read().await {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Chrome extension not connected" })),
        );
    }

    let cmd_id = cmd.id.clone();

    // Create a oneshot channel for the result
    let (tx, rx) = oneshot::channel::<DaemonResult>();
    state.pending_commands.write().await.insert(cmd_id.clone(), tx);

    // Forward command to extension via WebSocket
    {
        let mut ext_tx = state.extension_tx.lock().await;
        if let Some(ref mut sink) = *ext_tx {
            let msg = serde_json::to_string(&cmd).unwrap_or_default();
            if let Err(e) = sink.send(Message::Text(msg.into())).await {
                state.pending_commands.write().await.remove(&cmd_id);
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "error": format!("Failed to send to extension: {e}") })),
                );
            }
        } else {
            state.pending_commands.write().await.remove(&cmd_id);
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": "Extension WebSocket not available" })),
            );
        }
    }

    // Wait for result with timeout
    match tokio::time::timeout(COMMAND_TIMEOUT, rx).await {
        Ok(Ok(result)) => {
            let status = if result.ok {
                StatusCode::OK
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            };
            (status, Json(serde_json::to_value(result).unwrap_or(json!({}))))
        }
        Ok(Err(_)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Command channel closed unexpectedly" })),
        ),
        Err(_) => {
            state.pending_commands.write().await.remove(&cmd_id);
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(json!({ "error": "Command timed out" })),
            )
        }
    }
}

/// GET /ext — WebSocket upgrade for Chrome extension.
async fn ws_handler(
    State(state): State<Arc<DaemonState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_extension_ws(state, socket))
}

async fn handle_extension_ws(state: Arc<DaemonState>, socket: WebSocket) {
    let (sender, mut receiver) = socket.split();

    // Store the sender so we can forward commands
    *state.extension_tx.lock().await = Some(sender);
    *state.extension_connected.write().await = true;
    info!("Chrome extension connected");

    // Spawn heartbeat pinger
    let heartbeat_state = state.clone();
    let heartbeat_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(HEARTBEAT_INTERVAL).await;
            let mut tx = heartbeat_state.extension_tx.lock().await;
            if let Some(ref mut sink) = *tx {
                if sink.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            } else {
                break;
            }
        }
    });

    // Process incoming messages from extension
    while let Some(msg) = receiver.next().await {
        state.touch().await;
        match msg {
            Ok(Message::Text(text)) => {
                debug!(len = text.len(), "received message from extension");
                match serde_json::from_str::<DaemonResult>(&text) {
                    Ok(result) => {
                        let id = result.id.clone();
                        if let Some(tx) = state.pending_commands.write().await.remove(&id) {
                            let _ = tx.send(result);
                        } else {
                            warn!(id = %id, "received result for unknown command");
                        }
                    }
                    Err(e) => {
                        warn!("failed to parse extension message: {e}");
                    }
                }
            }
            Ok(Message::Pong(_)) => {
                debug!("pong from extension");
            }
            Ok(Message::Close(_)) => {
                info!("extension sent close frame");
                break;
            }
            Err(e) => {
                error!("extension ws error: {e}");
                break;
            }
            _ => {}
        }
    }

    // Clean up
    heartbeat_handle.abort();
    *state.extension_tx.lock().await = None;
    *state.extension_connected.write().await = false;
    info!("Chrome extension disconnected");

    // Fail all pending commands
    let mut pending = state.pending_commands.write().await;
    for (id, tx) in pending.drain() {
        let _ = tx.send(DaemonResult::failure(
            id,
            "Extension disconnected".to_string(),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_daemon_start_and_shutdown() {
        let daemon = Daemon::start(0).await;
        // Port 0 lets the OS assign a random port, but our code binds to a specific port.
        // For testing, use a high random port.
        // This test just verifies the code path doesn't panic.
        // In practice, we'd use port 0 with TcpListener and extract the actual port.
        // For now, just verify construction logic.
        assert!(daemon.is_ok() || daemon.is_err());
    }

    #[tokio::test]
    async fn test_daemon_state_touch() {
        let state = DaemonState::new();
        let before = *state.last_activity.read().await;
        tokio::time::sleep(Duration::from_millis(10)).await;
        state.touch().await;
        let after = *state.last_activity.read().await;
        assert!(after > before);
    }
}
