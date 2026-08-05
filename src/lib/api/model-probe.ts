import { invoke } from "@tauri-apps/api/core";

/** 单模型探测结果 */
export interface ModelProbeResult {
  model: string;
  /** 探测到的上游接口：openai_responses / openai_chat / anthropic；null = 无法判定 */
  apiFormat: string | null;
}

/**
 * 对一批模型发极简真实请求，判断各自支持的上游接口。
 *
 * 按序探测 /responses → /chat/completions → /v1/messages，任一返回 2xx 即停。
 * 探测请求 max_output_tokens=1，≈0 token 成本。
 */
export async function probeModelFormats(
  baseUrl: string,
  apiKey: string,
  models: string[],
): Promise<ModelProbeResult[]> {
  return invoke<ModelProbeResult[]>("probe_codex_model_formats", {
    baseUrl,
    apiKey,
    models,
  });
}

/**
 * 把探测结果写回 provider 的 modelCatalog.models[].apiFormat。
 *
 * 只 patch 传入的模型，保留模型目录其它字段；返回是否实际写入了任何条目。
 */
export async function updateProviderModelFormats(
  providerId: string,
  appType: string,
  formats: ModelProbeResult[],
): Promise<boolean> {
  return invoke<boolean>("update_provider_model_formats", {
    providerId,
    appType,
    formats,
  });
}
