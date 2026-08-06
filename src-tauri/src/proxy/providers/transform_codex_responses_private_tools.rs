//! Strip ChatGPT-backend-private tool declarations from native Codex
//! `Responses` requests for third-party gateways that reject them.
//!
//! Codex 0.133+ emits `{"type":"web_search",…}` and
//! `{"type":"image_generation",…}` tool carriers that only the ChatGPT
//! backend understands. Third-party Responses gateways (e.g. new-api style
//! relays like Me-zai) intermittently reject them with
//! `400 Unknown parameter: 'tools[N].name'` — the same request can pass or
//! fail depending on which upstream backend the gateway load-balances to.
//!
//! cc-switch strips these two private tool types on the native Responses
//! passthrough, response-driven: the first 400 arms the strip for that
//! provider (cached in [`crate::proxy::forwarder::RequestForwarder`]), and
//! every later request is stripped up front so the rejection never happens
//! again.
//!
//! `namespace` tools are intentionally NOT stripped: gateways like Me-zai
//! accept them, and xAI has its own whitelist-based sanitizer that keeps
//! `web_search` / `image_generation` on purpose (xAI supports them).

use crate::proxy::error::ProxyError;
use serde_json::Value;

/// Tool `type` values that are private to the ChatGPT backend and rejected by
/// third-party Responses gateways. Codex encodes both as bare tool carriers
/// without a `name` field — exactly the shape the gateway errors on
/// (`tools[N].name` unknown parameter).
const CHATGPT_PRIVATE_TOOL_TYPES: &[&str] = &["web_search", "image_generation"];

/// Whether the request body carries any ChatGPT-private tool declarations.
pub(crate) fn body_has_chatgpt_private_tools(body: &Value) -> bool {
    body.get("tools")
        .and_then(Value::as_array)
        .is_some_and(|tools| {
            tools.iter().any(|tool| {
                tool.get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|t| CHATGPT_PRIVATE_TOOL_TYPES.contains(&t))
            })
        })
}

/// Strip ChatGPT-backend-private tools (`web_search`, `image_generation`) and
/// any `tool_choice` that references them, in place. Returns whether anything
/// changed. Deterministic and idempotent: running it twice on the same body
/// changes nothing the second time.
pub(crate) fn strip_chatgpt_private_tools(body: &mut Value) -> bool {
    if !body.is_object() {
        return false;
    }

    let mut changed = false;

    if let Some(tools) = body.get_mut("tools").and_then(Value::as_array_mut) {
        let before = tools.len();
        tools.retain(|tool| {
            !tool
                .get("type")
                .and_then(Value::as_str)
                .is_some_and(|t| CHATGPT_PRIVATE_TOOL_TYPES.contains(&t))
        });
        changed |= tools.len() != before;
    }

    if tool_choice_targets_private_tool(body) {
        if let Some(obj) = body.as_object_mut() {
            obj.remove("tool_choice");
        }
        changed = true;
    }

    changed
}

fn tool_choice_targets_private_tool(body: &Value) -> bool {
    let Some(choice) = body.get("tool_choice").and_then(Value::as_object) else {
        return false;
    };
    choice
        .get("type")
        .and_then(Value::as_str)
        .is_some_and(|t| CHATGPT_PRIVATE_TOOL_TYPES.contains(&t))
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
                {"type": "web_search", "external_web_access": true},
                {"type": "image_generation", "output_format": "png"},
            ],
            "tool_choice": {"type": "web_search", "max_results": 1},
        })
    }

    #[test]
    fn strips_private_tools_and_dangling_tool_choice() {
        let mut body = sample_body();
        assert!(body_has_chatgpt_private_tools(&body));
        assert!(strip_chatgpt_private_tools(&mut body));
        // 第二遍幂等
        assert!(!strip_chatgpt_private_tools(&mut body));

        let tools = body["tools"].as_array().unwrap();
        let types: Vec<&str> = tools
            .iter()
            .map(|t| t["type"].as_str().unwrap())
            .collect();
        assert_eq!(types, vec!["function", "namespace"]);
        assert!(body.get("tool_choice").is_none());
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
            "tools": [{"type": "web_search"}],
            "tool_choice": "auto",
        });
        assert!(strip_chatgpt_private_tools(&mut body));
        // 字符串 tool_choice 保留；tools 空数组保留（幂等）
        assert_eq!(body["tool_choice"], "auto");
        assert!(body["tools"].as_array().unwrap().is_empty());
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
