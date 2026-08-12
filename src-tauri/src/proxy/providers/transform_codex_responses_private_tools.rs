//! Strip ChatGPT-backend-private tool *carrier fields* from native Codex
//! `Responses` requests for third-party gateways that reject them.
//!
//! Codex Desktop 0.147+ emits `{"type":"web_search","name":"web_search",…}`
//! and `{"type":"image_generation","name":"image_generation",…}` tool
//! carriers. The ChatGPT backend only accepts the bare carrier shape without
//! the top-level `name` field, and third-party Responses gateways (e.g.
//! new-api style relays like Me-zai) reject the `name` with
//! `400 Unknown parameter: 'tools[N].name'` — the same request can pass or
//! fail depending on which upstream backend the gateway load-balances to.
//!
//! cc-switch normalizes these two private tool types on the native Responses
//! passthrough, response-driven: the first 400 arms the strip for that
//! provider (cached in [`crate::proxy::forwarder::RequestForwarder`]), and
//! every later request is stripped up front so the rejection never happens
//! again.
//!
//! Only the top-level `name` field is removed — the carriers themselves are
//! preserved, so web search / image generation keep working. `namespace`
//! tools are intentionally untouched: gateways like Me-zai accept them, and
//! xAI has its own whitelist-based sanitizer that keeps `web_search` /
//! `image_generation` on purpose (xAI supports them).

use crate::proxy::error::ProxyError;
use serde_json::Value;

/// Tool `type` values that are private to the ChatGPT backend and rejected by
/// third-party Responses gateways when the carrier carries a top-level `name`
/// field (`tools[N].name` unknown parameter).
const CHATGPT_PRIVATE_TOOL_TYPES: &[&str] = &["web_search", "image_generation"];

/// Whether the request body carries any ChatGPT-private tool declarations.
pub(crate) fn body_has_chatgpt_private_tools(body: &Value) -> bool {
    body.get("tools")
        .and_then(Value::as_array)
        .is_some_and(|tools| tools.iter().any(is_chatgpt_private_tool))
}

fn is_chatgpt_private_tool(tool: &Value) -> bool {
    tool.get("type")
        .and_then(Value::as_str)
        .is_some_and(|t| CHATGPT_PRIVATE_TOOL_TYPES.contains(&t))
}

/// Remove the top-level `name` field from ChatGPT-private tool carriers
/// (`web_search`, `image_generation`) and from any `tool_choice` that
/// references them, in place. The carriers themselves are preserved so web
/// search / image generation keep working. Returns whether anything changed.
/// Deterministic and idempotent: running it twice on the same body changes
/// nothing the second time.
pub(crate) fn strip_chatgpt_private_tools(body: &mut Value) -> bool {
    if !body.is_object() {
        return false;
    }

    let mut changed = false;

    if let Some(tools) = body.get_mut("tools").and_then(Value::as_array_mut) {
        for tool in tools.iter_mut() {
            if is_chatgpt_private_tool(tool) && tool.get("name").is_some() {
                if let Some(obj) = tool.as_object_mut() {
                    obj.remove("name");
                }
                changed = true;
            }
        }
    }

    if let Some(choice) = body.get_mut("tool_choice").and_then(Value::as_object_mut) {
        if choice
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(|t| CHATGPT_PRIVATE_TOOL_TYPES.contains(&t))
            && choice.get("name").is_some()
        {
            choice.remove("name");
            changed = true;
        }
    }

    changed
}

/// Whether an upstream error looks like a rejection of Codex's
/// ChatGPT-private tool carriers: a 400/422 whose message names a `tools[N]`
/// field as an unknown parameter. Mirrors the strict-gateway errors observed
/// in the wild (`Unknown parameter: 'tools[22].name'`).
pub(crate) fn is_chatgpt_private_tools_rejection(error: &ProxyError) -> bool {
    let ProxyError::UpstreamError { status, body } = error else {
        return false;
    };
    if !matches!(*status, 400 | 422) {
        return false;
    }
    let Some(body) = body.as_deref() else {
        return false;
    };
    let message = crate::proxy::media_sanitizer::extract_error_text(body);
    message.contains("Unknown parameter") && message.contains("tools[")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_body() -> Value {
        json!({
            "model": "gpt-5.6-luna",
            "input": [{"type": "message", "role": "user", "content": "hi"}],
            "tools": [
                {"type": "function", "name": "exec_command", "parameters": {}},
                {"type": "namespace", "name": "multi_agent_v1", "tools": []},
                {"type": "web_search", "name": "web_search", "external_web_access": true},
                {"type": "image_generation", "name": "image_generation", "output_format": "png"},
            ],
            "tool_choice": {"type": "web_search", "name": "web_search", "max_results": 1},
        })
    }

    #[test]
    fn strips_private_tool_names_keeps_carriers() {
        let mut body = sample_body();
        assert!(body_has_chatgpt_private_tools(&body));
        assert!(strip_chatgpt_private_tools(&mut body));
        // 第二遍幂等
        assert!(!strip_chatgpt_private_tools(&mut body));

        // 工具载体本身保留（数量不变），仅私有工具的 name 被移除
        let tools = body["tools"].as_array().unwrap();
        let types: Vec<&str> = tools
            .iter()
            .map(|t| t["type"].as_str().unwrap())
            .collect();
        assert_eq!(types, vec!["function", "namespace", "web_search", "image_generation"]);

        // 私有工具：name 删除，其它字段保留
        let web_search = &tools[2];
        assert_eq!(web_search["type"], "web_search");
        assert!(web_search.get("name").is_none());
        assert_eq!(web_search["external_web_access"], true);
        let image_generation = &tools[3];
        assert_eq!(image_generation["type"], "image_generation");
        assert!(image_generation.get("name").is_none());
        assert_eq!(image_generation["output_format"], "png");

        // 公共工具：name 必须保留
        assert_eq!(tools[0]["name"], "exec_command");
        assert_eq!(tools[1]["name"], "multi_agent_v1");

        // tool_choice 保留（引用仍有效），仅去掉 name
        let choice = body["tool_choice"].as_object().unwrap();
        assert_eq!(choice["type"], "web_search");
        assert!(choice.get("name").is_none());
        assert_eq!(choice["max_results"], 1);
    }

    #[test]
    fn keeps_public_tool_names() {
        let mut body = json!({
            "tools": [
                {"type": "function", "name": "exec_command", "parameters": {}},
                {"type": "namespace", "name": "codex_app", "tools": []},
            ],
            "tool_choice": "auto",
        });
        assert!(!body_has_chatgpt_private_tools(&body));
        assert!(!strip_chatgpt_private_tools(&mut body));
        assert_eq!(body["tools"][0]["name"], "exec_command");
        assert_eq!(body["tools"][1]["name"], "codex_app");
        assert_eq!(body["tool_choice"], "auto");
    }

    #[test]
    fn no_private_tools_is_noop() {
        let mut body = json!({
            "tools": [{"type": "function", "name": "f", "parameters": {}}],
            "tool_choice": "auto",
        });
        assert!(!body_has_chatgpt_private_tools(&body));
        assert!(!strip_chatgpt_private_tools(&mut body));
        assert_eq!(body["tools"].as_array().unwrap().len(), 1);
        assert_eq!(body["tool_choice"], "auto");
    }

    #[test]
    fn keeps_string_tool_choice() {
        let mut body = json!({
            "tools": [{"type": "web_search", "name": "web_search"}],
            "tool_choice": "auto",
        });
        assert!(strip_chatgpt_private_tools(&mut body));
        // 字符串 tool_choice 保留；私有工具保留但 name 移除（幂等）
        assert_eq!(body["tool_choice"], "auto");
        let tools = body["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["type"], "web_search");
        assert!(tools[0].get("name").is_none());
        assert!(!strip_chatgpt_private_tools(&mut body));
    }

    #[test]
    fn detects_private_tools_rejection() {
        let err = ProxyError::UpstreamError {
            status: 400,
            body: Some(
                "{\"error\":{\"message\":\"Unknown parameter: 'tools[22].name'.\",\"param\":\"tools[22].name\"}}"
                    .to_string(),
            ),
        };
        assert!(is_chatgpt_private_tools_rejection(&err));
    }

    #[test]
    fn ignores_other_errors() {
        // 非 tools 的 400
        let err = ProxyError::UpstreamError {
            status: 400,
            body: Some("{\"error\":{\"message\":\"Bad model\"}}".to_string()),
        };
        assert!(!is_chatgpt_private_tools_rejection(&err));

        // 500 不触发
        let err = ProxyError::UpstreamError {
            status: 500,
            body: Some("{\"error\":{\"message\":\"Unknown parameter: 'tools[0].name'\"}}".to_string()),
        };
        assert!(!is_chatgpt_private_tools_rejection(&err));

        // 非 UpstreamError
        let err = ProxyError::Timeout("x".to_string());
        assert!(!is_chatgpt_private_tools_rejection(&err));
    }
}

