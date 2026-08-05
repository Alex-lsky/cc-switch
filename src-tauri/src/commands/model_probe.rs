//! 模型上游接口自动探测命令
//!
//! 前端在新增 Codex provider 后（或手动点击"自动识别接口"）调用：
//! 1. `probe_codex_model_formats` — 对模型列表发极简真实请求，判断各自支持的接口
//! 2. `update_provider_model_formats` — 把探测结果写回 provider 的 modelCatalog

use crate::services::model_probe::{ModelProbeResult, ModelProbeService};
use serde_json::Value as JsonValue;
use tauri::State;

use crate::AppState;

/// 探测一批模型的上游接口（responses → chat → anthropic，任一 2xx 即停）
#[tauri::command(rename_all = "camelCase")]
pub async fn probe_codex_model_formats(
    base_url: String,
    api_key: String,
    models: Vec<String>,
) -> Result<Vec<ModelProbeResult>, String> {
    ModelProbeService::probe_models(&base_url, &api_key, &models)
        .await
        .map_err(|e| e.to_string())
}

/// 把探测结果写回 provider 的 `settings_config.modelCatalog.models[].apiFormat`。
///
/// 只 patch 传入的模型；保持 modelCatalog 现有字段（displayName、contextWindow 等）
/// 原样不动。写完后经 `save_provider` 持久化。
#[tauri::command(rename_all = "camelCase")]
pub fn update_provider_model_formats(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] provider_id: String,
    #[allow(non_snake_case)] app_type: String,
    formats: Vec<ModelProbeResult>,
) -> Result<bool, String> {
    if formats.is_empty() {
        return Ok(false);
    }

    let db = &state.db;
    let mut provider = db
        .get_provider_by_id(&provider_id, &app_type)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Provider {provider_id} not found"))?;

    // 定位 modelCatalog.models[]，按 model id 匹配写入 apiFormat
    let Some(models) = provider
        .settings_config
        .get_mut("modelCatalog")
        .and_then(|catalog| catalog.get_mut("models"))
        .and_then(|models| models.as_array_mut())
    else {
        return Err("modelCatalog.models missing in provider settings".to_string());
    };

    let mut updated = 0usize;
    for result in &formats {
        if let Some(api_format) = result.api_format.as_deref() {
            let Some(entry) = models
                .iter_mut()
                .find(|entry| entry.get("model").and_then(|v| v.as_str()) == Some(result.model.as_str()))
            else {
                continue;
            };
            entry["apiFormat"] = JsonValue::String(api_format.to_string());
            updated += 1;
        }
    }

    if updated == 0 {
        return Ok(false);
    }

    db.save_provider(&app_type, &provider)
        .map_err(|e| e.to_string())?;
    log::info!(
        "[ModelProbe] Updated {updated} model apiFormat entries for provider {provider_id}"
    );
    Ok(true)
}
