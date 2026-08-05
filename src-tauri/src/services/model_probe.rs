//! 模型上游接口自动探测
//!
//! 对 Codex provider 的每个模型发极简真实请求（max_output_tokens=1），
//! 按序探测三种上游接口，任一返回 2xx 即判定该模型支持此接口：
//!   1. `/responses`        (OpenAI Responses API)  → openai_responses
//!   2. `/chat/completions` (OpenAI Chat Completions) → openai_chat
//!   3. `/v1/messages`      (Anthropic Messages)     → anthropic
//!
//! 探测结果写回 `settings_config.modelCatalog.models[].apiFormat`，
//! 替代手工维护白名单：首次接入 provider 时对每个未标注的模型自动探测，
//! 用户也可随时手动重测。
//!
//! 成本：每模型最多 3 次请求，每次 max_output_tokens=1，≈0 token 成本。

use crate::error::AppError;
use futures::future::join_all;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// 单模型探测结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProbeResult {
    pub model: String,
    /// 探测到的上游接口：openai_responses / openai_chat / anthropic。
    /// None = 三种接口都失败（无法判定，调用方回退 provider 级默认）。
    pub api_format: Option<String>,
}

/// 接口探测的超时（秒）
const PROBE_TIMEOUT_SECS: u64 = 10;
/// 模型间并发探测数
const PROBE_CONCURRENCY: usize = 4;

/// 探测服务
pub struct ModelProbeService;

impl ModelProbeService {
    /// 对一批模型逐个探测上游接口。
    ///
    /// `base_url` 和 `api_key` 来自 provider 配置（前端传入）；探测不经过
    /// 本地代理，直接打到上游，避免代理路由逻辑干扰判定。
    pub async fn probe_models(
        base_url: &str,
        api_key: &str,
        models: &[String],
    ) -> Result<Vec<ModelProbeResult>, AppError> {
        if models.is_empty() {
            return Ok(vec![]);
        }

        let client = crate::proxy::http_client::get();
        let base_url = base_url.trim_end_matches('/').to_string();
        let timeout = Duration::from_secs(PROBE_TIMEOUT_SECS);

        // 并发探测，限制并发数（按 chunk 分批）
        let mut results = Vec::with_capacity(models.len());
        for chunk in models.chunks(PROBE_CONCURRENCY) {
            let batch = join_all(
                chunk
                    .iter()
                    .map(|model| probe_one_model(client.clone(), &base_url, api_key, model, timeout)),
            )
            .await;
            results.extend(batch.into_iter().flatten());
        }

        Ok(results)
    }
}

/// 探测单个模型：按序试 responses → chat → anthropic，任一 2xx 即停。
async fn probe_one_model(
    client: reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    timeout: Duration,
) -> Option<ModelProbeResult> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return None;
    }

    // 1. Responses API
    let responses_url = build_endpoint_url(base_url, "/responses");
    let responses_body = serde_json::json!({
        "model": model,
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [{ "type": "input_text", "text": "hi" }]
            }
        ],
        "max_output_tokens": 1,
        "stream": false
    });
    if let Some(true) = try_probe(&client, &responses_url, api_key, &responses_body, timeout).await {
        return Some(ModelProbeResult {
            model,
            api_format: Some("openai_responses".to_string()),
        });
    }

    // 2. Chat Completions API
    let chat_url = build_endpoint_url(base_url, "/chat/completions");
    let chat_body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": "hi" }],
        "max_tokens": 1,
        "stream": false
    });
    if let Some(true) = try_probe(&client, &chat_url, api_key, &chat_body, timeout).await {
        return Some(ModelProbeResult {
            model,
            api_format: Some("openai_chat".to_string()),
        });
    }

    // 3. Anthropic Messages API
    let anthropic_url = build_endpoint_url(base_url, "/v1/messages");
    let anthropic_body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": "hi" }],
        "max_tokens": 1
    });
    if let Some(true) = try_probe(&client, &anthropic_url, api_key, &anthropic_body, timeout).await {
        return Some(ModelProbeResult {
            model,
            api_format: Some("anthropic".to_string()),
        });
    }

    log::debug!(
        "[ModelProbe] {model}: all three upstream interfaces failed, keeping unset"
    );
    Some(ModelProbeResult {
        model,
        api_format: None,
    })
}

/// 对单个接口发一次探测请求。
///
/// 返回 `Some(true)` = 2xx（支持）；`Some(false)` = 明确 4xx/5xx（不支持）；
/// `None` = 网络错误/超时（无法判定，视为不支持并继续下一接口）。
async fn try_probe(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
    timeout: Duration,
) -> Option<bool> {
    let mut builder = client.post(url).timeout(timeout).json(body);
    if !api_key.trim().is_empty() {
        builder = builder.bearer_auth(api_key.trim());
    }

    match builder.send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                log::debug!("[ModelProbe] {url}: HTTP {status} → supported");
                Some(true)
            } else {
                log::debug!("[ModelProbe] {url}: HTTP {status} → not supported");
                Some(false)
            }
        }
        Err(err) => {
            log::debug!("[ModelProbe] {url}: network error → {err}");
            None
        }
    }
}

/// 拼接接口路径。base_url 可能带 /v1 前缀（如 `https://api.example.com/v1`）
/// 也可能不带；探测时统一在 base_url 后直接拼 `/responses` 等路径，
/// 与 CodexAdapter::build_url 的行为保持一致（origin-only 时自动补 /v1）。
fn build_endpoint_url(base_url: &str, endpoint: &str) -> String {
    let base = base_url.trim_end_matches('/');
    // base_url 以 /v1 结尾时，responses 应拼成 /v1/responses
    if base.ends_with("/v1") {
        format!("{base}{endpoint}")
    } else {
        format!("{base}/v1{endpoint}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Read;
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;

    /// 手写迷你 mock HTTP server：按 path 返回配置好的状态码。
    /// 返回 (base_url, shutdown_handle)。
    fn spawn_mock_server(
        responses_status: u16,
        chat_status: u16,
        anthropic_status: u16,
    ) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let base_url = format!("http://127.0.0.1:{port}");

        let requests = Arc::new(AtomicUsize::new(0));
        let requests_clone = Arc::clone(&requests);

        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let requests_clone = Arc::clone(&requests_clone);
                thread::spawn(move || {
                    // 读请求行（拿 path）
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let raw = String::from_utf8_lossy(&buf[..n]);
                    let path = raw
                        .lines()
                        .next()
                        .and_then(|l| l.split_whitespace().nth(1))
                        .unwrap_or("/");

                    requests_clone.fetch_add(1, Ordering::SeqCst);

                    let (status, body) = if path.ends_with("/responses") {
                        (responses_status, "{}")
                    } else if path.ends_with("/chat/completions") {
                        (chat_status, "{}")
                    } else if path.ends_with("/messages") {
                        (anthropic_status, "{}")
                    } else {
                        (404, "{}")
                    };

                    let reason = match status {
                        200 => "OK",
                        400 => "Bad Request",
                        404 => "Not Found",
                        _ => "Error",
                    };
                    let response = format!(
                        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                });
            }
        });

        (base_url, requests)
    }

    // 需要 io::Write
    use std::io::Write;

    #[tokio::test]
    async fn probe_detects_responses_when_only_responses_2xx() {
        let (base_url, _) = spawn_mock_server(200, 400, 404);
        let models = vec!["gpt-5.6-luna".to_string()];
        let results = ModelProbeService::probe_models(&base_url, "sk-test", &models)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].model, "gpt-5.6-luna");
        assert_eq!(results[0].api_format.as_deref(), Some("openai_responses"));
    }

    #[tokio::test]
    async fn probe_detects_chat_when_responses_4xx_and_chat_2xx() {
        let (base_url, _) = spawn_mock_server(400, 200, 404);
        let models = vec!["glm-5.2".to_string()];
        let results = ModelProbeService::probe_models(&base_url, "sk-test", &models)
            .await
            .unwrap();
        assert_eq!(results[0].api_format.as_deref(), Some("openai_chat"));
    }

    #[tokio::test]
    async fn probe_detects_anthropic_when_responses_and_chat_4xx() {
        let (base_url, _) = spawn_mock_server(400, 400, 200);
        let models = vec!["claude-sonnet".to_string()];
        let results = ModelProbeService::probe_models(&base_url, "sk-test", &models)
            .await
            .unwrap();
        assert_eq!(results[0].api_format.as_deref(), Some("anthropic"));
    }

    #[tokio::test]
    async fn probe_returns_none_when_all_interfaces_fail() {
        let (base_url, _) = spawn_mock_server(400, 404, 500);
        let models = vec!["unknown-model".to_string()];
        let results = ModelProbeService::probe_models(&base_url, "sk-test", &models)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].api_format.is_none());
    }

    #[tokio::test]
    async fn probe_empty_models_returns_empty() {
        let (base_url, _) = spawn_mock_server(200, 400, 404);
        let results = ModelProbeService::probe_models(&base_url, "sk-test", &[])
            .await
            .unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn probe_multiple_models_concurrently() {
        let (base_url, requests) = spawn_mock_server(200, 200, 200);
        let models = vec![
            "gpt-5.6-luna".to_string(),
            "grok-4.5".to_string(),
            "glm-5.2".to_string(),
            "kimi-k3".to_string(),
        ];
        let results = ModelProbeService::probe_models(&base_url, "sk-test", &models)
            .await
            .unwrap();
        assert_eq!(results.len(), 4);
        // 全部模型 responses 2xx → 都判 responses（第一个接口就成功）
        for r in &results {
            assert_eq!(r.api_format.as_deref(), Some("openai_responses"));
        }
        assert_eq!(requests.load(Ordering::SeqCst), 4);
    }

    #[test]
    fn build_endpoint_url_handles_v1_prefix() {
        assert_eq!(
            build_endpoint_url("https://api.example.com/v1", "/responses"),
            "https://api.example.com/v1/responses"
        );
        assert_eq!(
            build_endpoint_url("https://api.example.com", "/responses"),
            "https://api.example.com/v1/responses"
        );
        assert_eq!(
            build_endpoint_url("https://api.example.com/", "/responses"),
            "https://api.example.com/v1/responses"
        );
        assert_eq!(
            build_endpoint_url("https://api.example.com/custom", "/responses"),
            "https://api.example.com/custom/v1/responses"
        );
    }

    #[test]
    fn probe_result_serializes_camel_case() {
        let r = ModelProbeResult {
            model: "m1".to_string(),
            api_format: Some("openai_chat".to_string()),
        };
        let v = serde_json::to_value(&r).unwrap();
        assert_eq!(v["model"], json!("m1"));
        assert_eq!(v["apiFormat"], json!("openai_chat"));
        assert!(v.get("api_format").is_none());
    }
}
