/**
 * Codex 预设供应商配置模板
 */
import { ProviderCategory } from "../types";
import type {
  CodexApiFormat,
  CodexCatalogModel,
  CodexChatReasoning,
  PromptCacheRoutingMode,
} from "../types";
import type { PresetTheme } from "./claudeProviderPresets";

export interface CodexProviderPreset {
  name: string;
  nameKey?: string; // i18n key for localized display name
  websiteUrl: string;
  // 第三方供应商可提供单独的获取 API Key 链接
  apiKeyUrl?: string;
  auth: Record<string, any>; // 将写入 ~/.codex/auth.json
  config: string; // 将写入 ~/.codex/config.toml（TOML 字符串）
  isOfficial?: boolean; // 标识是否为官方预设
  isPartner?: boolean; // 标识是否为商业合作伙伴
  primePartner?: boolean; // 置顶合作伙伴（顶级）：徽章显示为心形
  partnerPromotionKey?: string; // 合作伙伴促销信息的 i18n key
  category?: ProviderCategory; // 新增：分类
  isCustomTemplate?: boolean; // 标识是否为自定义模板
  // 新增：请求地址候选列表（用于地址管理/测速）
  endpointCandidates?: string[];
  // 新增：视觉主题配置
  theme?: PresetTheme;
  // 图标配置
  icon?: string; // 图标名称
  iconColor?: string; // 图标颜色
  // Codex API 格式
  apiFormat?: CodexApiFormat;
  // 托管账号预设：目前仅 xAI OAuth（Grok 订阅经本地代理注入 token 直连 api.x.ai）
  providerType?: "xai_oauth";
  // OAuth 预设：隐藏 API Key 输入，保存前要求已登录托管账号
  requiresOAuth?: boolean;
  // Codex Chat 本地路由模式下的模型目录
  modelCatalog?: CodexCatalogModel[];
  // Codex Responses -> Chat Completions reasoning capability defaults
  codexChatReasoning?: CodexChatReasoning;
  // Session-based prompt-cache routing override for Chat Completions upstreams
  promptCacheRouting?: PromptCacheRoutingMode;
}

/**
 * 生成第三方供应商的 auth.json
 */
export function generateThirdPartyAuth(apiKey: string): Record<string, any> {
  return {
    OPENAI_API_KEY: apiKey || "",
  };
}

/**
 * 生成第三方供应商的 config.toml
 */
export function generateThirdPartyConfig(
  providerName: string,
  baseUrl: string,
  modelName = "gpt-5.6-sol",
): string {
  const tomlString = (value: string) => JSON.stringify(value);

  return `model_provider = "custom"
model = ${tomlString(modelName)}
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = ${tomlString(providerName)}
base_url = ${tomlString(baseUrl)}
wire_api = "responses"
requires_openai_auth = true`;
}

function modelCatalog(
  models: Array<
    | string
    | {
        model: string;
        displayName?: string;
        contextWindow?: number;
        // Native Responses (direct) overrides for the generated
        // model-catalogs.json. Omitted input modalities are inferred by the
        // backend: confirmed text-only models stay text-only; everything else
        // defaults to text+image.
        supportsParallelToolCalls?: boolean;
        inputModalities?: string[];
        // Vendor's OFFICIAL base_instructions; omit to inherit the neutral
        // template default. Required by Codex, so the backend always emits one.
        baseInstructions?: string;
      }
  >,
): CodexCatalogModel[] {
  return models.map((entry) =>
    typeof entry === "string"
      ? { model: entry }
      : {
          model: entry.model,
          displayName: entry.displayName,
          contextWindow: entry.contextWindow,
          supportsParallelToolCalls: entry.supportsParallelToolCalls,
          inputModalities: entry.inputModalities,
          baseInstructions: entry.baseInstructions,
        },
  );
}

export const codexProviderPresets: CodexProviderPreset[] = [
  {
    name: "OpenAI Official",
    websiteUrl: "https://chatgpt.com/codex",
    isOfficial: true,
    category: "official",
    auth: {},
    config: ``,
    theme: {
      icon: "codex",
      backgroundColor: "#1F2937", // gray-800
      textColor: "#FFFFFF",
    },
    icon: "openai",
    iconColor: "#00A67E",
  },
  // ===== 主流厂商预设（文件顺序不影响展示，按显示名排序） =====
  {
    name: "Kimi",
    websiteUrl: "https://platform.kimi.com",
    apiKeyUrl: "https://platform.kimi.com/console/api-keys",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "kimi",
      "https://api.moonshot.cn/v1",
      "kimi-k2.7-code",
    ),
    endpointCandidates: ["https://api.moonshot.cn/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "kimi-k2.7-code",
        displayName: "Kimi K2.7 Code",
        contextWindow: 262144,
      },
      {
        model: "kimi-k3",
        displayName: "Kimi K3",
        contextWindow: 1048576,
      },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "cn_official",
    icon: "kimi",
    iconColor: "#6366F1",
  },
  {
    name: "Kimi For Coding",
    websiteUrl: "https://www.kimi.com/code/",
    apiKeyUrl: "https://www.kimi.com/code/",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "kimi_coding",
      "https://api.kimi.com/coding/v1",
      "kimi-for-coding",
    ),
    endpointCandidates: ["https://api.kimi.com/coding/v1"],
    apiFormat: "openai_chat",
    promptCacheRouting: "enabled",
    modelCatalog: modelCatalog([
      {
        model: "kimi-for-coding",
        displayName: "Kimi For Coding",
        contextWindow: 262144,
      },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "cn_official",
    icon: "kimi",
    iconColor: "#6366F1",
  },
  {
    name: "火山Agentplan",
    websiteUrl: "https://www.volcengine.com/activity/codingplan",
    apiKeyUrl: "https://www.volcengine.com/activity/codingplan",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "ark_agentplan",
      "https://ark.cn-beijing.volces.com/api/coding/v3",
      "ark-code-latest",
    ),
    // ⚠️ 计费红线（官方 warning）：Coding Plan 必须走 /api/coding/v3；
    // 填按量端点 /api/v3 不消耗套餐额度、按量另计费，绝不能混入候选
    endpointCandidates: ["https://ark.cn-beijing.volces.com/api/coding/v3"],
    // 官方 Codex 文档（volcengine.com/docs/82379/2556056，2026-07 更新）：
    // Coding Plan /api/coding/v3 已支持 Responses API（wire_api=responses），无需路由接管转换
    apiFormat: "openai_responses",
    modelCatalog: modelCatalog([
      {
        model: "ark-code-latest",
        displayName: "Ark Code Latest",
        contextWindow: 256000,
      },
    ]),
    category: "cn_official",
    icon: "huoshan",
    iconColor: "#3370FF",
  },
  {
    name: "BytePlus",
    websiteUrl: "https://www.byteplus.com/en/product/modelark",
    apiKeyUrl: "https://www.byteplus.com/en/product/modelark",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "byteplus",
      "https://ark.ap-southeast.bytepluses.com/api/coding/v3",
      "ark-code-latest",
    ),
    endpointCandidates: [
      "https://ark.ap-southeast.bytepluses.com/api/coding/v3",
    ],
    // 国内站 coding/v3 已切原生 Responses（见 火山Agentplan），但 BytePlus
    // 国际站（bytepluses.com）文档未单独核实，暂保持 Chat 路由
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "ark-code-latest",
        displayName: "Ark Code Latest",
        contextWindow: 256000,
      },
    ]),
    category: "cn_official",
    icon: "byteplus",
    iconColor: "#3370FF",
  },
  {
    name: "DouBaoSeed",
    websiteUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    apiKeyUrl:
      "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "doubaoseed",
      "https://ark.cn-beijing.volces.com/api/v3",
      "doubao-seed-2-1-pro-260628",
    ),
    endpointCandidates: ["https://ark.cn-beijing.volces.com/api/v3"],
    // 火山方舟主数据面 /api/v3 原生支持 Responses API（/api/v3/responses），无需路由接管转换
    apiFormat: "openai_responses",
    // 无官方 catalog：合成 MiMo 式（shell_command 编辑、不发 freeform apply_patch），
    // 让 Codex 直连显示模型并避免 custom 工具被网关拒绝
    modelCatalog: modelCatalog([
      {
        model: "doubao-seed-2-1-pro-260628",
        displayName: "Doubao Seed 2.1 Pro",
        contextWindow: 262144,
      },
    ]),
    category: "cn_official",
    icon: "doubao",
    iconColor: "#3370FF",
  },
  {
    name: "SiliconFlow",
    websiteUrl: "https://siliconflow.cn",
    apiKeyUrl: "https://cloud.siliconflow.cn/i/YflgU2Ve",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "siliconflow",
      "https://api.siliconflow.cn/v1",
      "Pro/MiniMaxAI/MiniMax-M2.7",
    ),
    endpointCandidates: ["https://api.siliconflow.cn/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "Pro/MiniMaxAI/MiniMax-M2.7",
        displayName: "Pro / MiniMax M2.7",
        contextWindow: 200000,
      },
    ]),
    category: "aggregator",
    icon: "siliconflow",
    iconColor: "#6E29F6",
  },
  {
    name: "SiliconFlow en",
    websiteUrl: "https://siliconflow.com",
    apiKeyUrl: "https://cloud.siliconflow.cn/i/YflgU2Ve",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "siliconflow_en",
      "https://api.siliconflow.com/v1",
      "MiniMaxAI/MiniMax-M2.7",
    ),
    endpointCandidates: ["https://api.siliconflow.com/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "MiniMaxAI/MiniMax-M2.7",
        displayName: "MiniMax M2.7",
        contextWindow: 200000,
      },
    ]),
    category: "aggregator",
    icon: "siliconflow",
    iconColor: "#000000",
  },
  {
    name: "Compshare",
    nameKey: "providerForm.presets.ucloud",
    websiteUrl: "https://www.compshare.cn",
    apiKeyUrl: "https://www.compshare.cn/coding-plan",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "compshare",
      "https://api.modelverse.cn/v1",
      "gpt-5.6-sol",
    ),
    endpointCandidates: ["https://api.modelverse.cn/v1"],
    category: "aggregator",
    icon: "ucloud",
    iconColor: "#000000",
  },
  {
    name: "Compshare Coding Plan",
    nameKey: "providerForm.presets.ucloudCoding",
    websiteUrl: "https://www.compshare.cn",
    apiKeyUrl: "https://www.compshare.cn/coding-plan",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "compshare_coding",
      "https://cp.compshare.cn/v1",
      "gpt-5.6-sol",
    ),
    endpointCandidates: ["https://cp.compshare.cn/v1"],
    category: "aggregator",
    icon: "ucloud",
    iconColor: "#000000",
  },
  {
    name: "Qiniu",
    nameKey: "providerForm.presets.qiniu",
    websiteUrl: "https://s.qiniu.com/nMvAvy",
    apiKeyUrl: "https://s.qiniu.com/nMvAvy",
    category: "aggregator",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "qiniu",
      "https://api.qnaigc.com/bypass/openai/v1",
      "gpt-5.6-sol",
    ),
    endpointCandidates: [
      "https://api.qnaigc.com/bypass/openai/v1",
      "https://api.modelink.ai/bypass/openai/v1",
    ],
    icon: "qiniu",
  },
  // ===== 其他预设 =====
  {
    name: "Azure OpenAI",
    websiteUrl:
      "https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/codex",
    category: "third_party",
    isOfficial: true,
    auth: generateThirdPartyAuth(""),
    config: `model_provider = "custom"
model = "gpt-5.6-sol"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "Azure OpenAI"
base_url = "https://YOUR_RESOURCE_NAME.openai.azure.com/openai"
env_key = "OPENAI_API_KEY"
query_params = { "api-version" = "2025-04-01-preview" }
wire_api = "responses"
requires_openai_auth = true`,
    endpointCandidates: ["https://YOUR_RESOURCE_NAME.openai.azure.com/openai"],
    theme: {
      icon: "codex",
      backgroundColor: "#0078D4",
      textColor: "#FFFFFF",
    },
    icon: "azure",
    iconColor: "#0078D4",
  },
  {
    name: "DeepSeek",
    websiteUrl: "https://platform.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "deepseek",
      "https://api.deepseek.com",
      "deepseek-v4-flash",
    ),
    endpointCandidates: ["https://api.deepseek.com"],
    // DeepSeek 官方 Codex 文档（api-docs.deepseek.com → agent_integrations/codex）：
    // deepseek-v4-flash 原生 Responses（wire_api=responses 对自家 base_url），无需路由接管转换。
    // 后端按 deepseek.com host 直接镜像官方 models.json（freeform apply_patch +
    // GPT-5 harness + low/high/max 思考档，需 codex >= 0.144.0），这里只保留行清单与展示名。
    apiFormat: "openai_responses",
    modelCatalog: modelCatalog([
      {
        model: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        contextWindow: 1048576,
      },
      // 官方预计 2026-08 初开通 pro 的 Codex 集成（官方 models.json 已含该条目），
      // 在那之前切到 pro 会上游报错
      {
        model: "deepseek-v4-pro",
        displayName: "DeepSeek V4 Pro",
        contextWindow: 1048576,
      },
    ]),
    category: "cn_official",
    icon: "deepseek",
    iconColor: "#1E88E5",
  },
  {
    name: "Zhipu GLM",
    websiteUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://www.bigmodel.cn/claude-code?ic=RRVJPB5SII",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "zhipu_glm",
      "https://open.bigmodel.cn/api/coding/paas/v4",
      "glm-5.2",
    ),
    endpointCandidates: ["https://open.bigmodel.cn/api/coding/paas/v4"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      { model: "glm-5.2", displayName: "GLM-5.2", contextWindow: 200000 },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "cn_official",
    icon: "zhipu",
    iconColor: "#0F62FE",
  },
  {
    name: "Zhipu GLM en",
    websiteUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/subscribe?ic=8JVLJQFSKB",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "zhipu_glm_en",
      "https://api.z.ai/api/coding/paas/v4",
      "glm-5.2",
    ),
    endpointCandidates: ["https://api.z.ai/api/coding/paas/v4"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      { model: "glm-5.2", displayName: "GLM-5.2", contextWindow: 200000 },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "cn_official",
    icon: "zhipu",
    iconColor: "#0F62FE",
  },
  {
    name: "Baidu Qianfan Coding Plan",
    websiteUrl: "https://cloud.baidu.com/product/qianfan_modelbuilder",
    apiKeyUrl:
      "https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "qianfan_coding",
      "https://qianfan.baidubce.com/v2/coding",
      "qianfan-code-latest",
    ),
    endpointCandidates: ["https://qianfan.baidubce.com/v2/coding"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "qianfan-code-latest",
        displayName: "Qianfan Code Latest",
        contextWindow: 131072,
      },
    ]),
    category: "cn_official",
    icon: "baidu",
    iconColor: "#2932E1",
  },
  {
    name: "Bailian",
    websiteUrl: "https://bailian.console.aliyun.com",
    apiKeyUrl: "https://bailian.console.aliyun.com/#/api-key",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "bailian",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "qwen3-coder-plus",
    ),
    endpointCandidates: ["https://dashscope.aliyuncs.com/compatible-mode/v1"],
    // 阿里百炼 DashScope 原生支持 OpenAI Responses API（/compatible-mode/v1/responses，同一 base_url），无需路由接管转换
    apiFormat: "openai_responses",
    // 无官方 catalog：合成 MiMo 式（shell_command 编辑、不发 freeform apply_patch）
    modelCatalog: modelCatalog([
      {
        model: "qwen3-coder-plus",
        displayName: "Qwen3 Coder Plus",
        contextWindow: 1048576,
      },
    ]),
    category: "cn_official",
    icon: "bailian",
    iconColor: "#624AFF",
  },
  {
    name: "Tencent Hunyuan",
    websiteUrl: "https://cloud.tencent.com/product/tokenhub",
    apiKeyUrl: "https://console.cloud.tencent.com/tokenhub/apikey",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "hy3_tokenhub",
      "https://tokenhub.tencentmaas.com/v1",
      "hy3",
    ),
    // 官方备用域名 tencentmaas.cn（文档 1823/130078）；国际站 tokenhub-intl
    // 属不同地域，API Key 不跨站通用，不作候选
    endpointCandidates: [
      "https://tokenhub.tencentmaas.com/v1",
      "https://tokenhub.tencentmaas.cn/v1",
    ],
    // 腾讯 TokenHub 官方 Codex 文档（cloud.tencent.com/document/product/1823/133532）：
    // hy3 原生 Responses（wire_api=responses；官方硬性要求的
    // disable_response_storage=true 已由 generateThirdPartyConfig 输出）。
    // ⚠️ 须用 TokenHub API Key（创建时范围需勾选 Hy3）；Coding Plan / Token Plan
    // 订阅 Key 只能走各自 chat 端点，对本预设的 /v1 不通。
    // hy3 在带 tools 的请求里会把 reasoning_effort=low 服务端自动升为 high
    // （Codex 恒带 tools），默认 high 即真实行为。
    apiFormat: "openai_responses",
    // 无官方 catalog：合成 MiMo 式（shell_command 编辑、不发 freeform apply_patch）
    modelCatalog: modelCatalog([
      {
        model: "hy3",
        displayName: "Hy3",
        contextWindow: 256000,
        // hy3 不在官方多模态理解模型名单（1823/130988），纯文本
        inputModalities: ["text"],
      },
      {
        model: "hy3-preview",
        displayName: "Hy3 Preview",
        contextWindow: 256000,
        inputModalities: ["text"],
      },
    ]),
    category: "cn_official",
    icon: "hunyuan",
    iconColor: "#0055E9",
  },
  {
    name: "StepFun",
    websiteUrl: "https://platform.stepfun.com/step-plan",
    apiKeyUrl: "https://platform.stepfun.com/interface-key",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "stepfun",
      "https://api.stepfun.com/step_plan/v1",
      "step-3.7-flash",
    ),
    endpointCandidates: ["https://api.stepfun.com/step_plan/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "step-3.7-flash",
        displayName: "Step 3.7 Flash",
        contextWindow: 262144,
      },
      {
        model: "step-3.5-flash-2603",
        displayName: "Step 3.5 Flash 2603",
        contextWindow: 262144,
      },
      {
        model: "step-3.5-flash",
        displayName: "Step 3.5 Flash",
        contextWindow: 262144,
      },
    ]),
    category: "cn_official",
    icon: "stepfun",
    iconColor: "#16D6D2",
  },
  {
    name: "StepFun en",
    websiteUrl: "https://platform.stepfun.ai/step-plan",
    apiKeyUrl: "https://platform.stepfun.ai/interface-key",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "stepfun_en",
      "https://api.stepfun.ai/step_plan/v1",
      "step-3.7-flash",
    ),
    endpointCandidates: ["https://api.stepfun.ai/step_plan/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "step-3.7-flash",
        displayName: "Step 3.7 Flash",
        contextWindow: 262144,
      },
      {
        model: "step-3.5-flash-2603",
        displayName: "Step 3.5 Flash 2603",
        contextWindow: 262144,
      },
      {
        model: "step-3.5-flash",
        displayName: "Step 3.5 Flash",
        contextWindow: 262144,
      },
    ]),
    category: "cn_official",
    icon: "stepfun",
    iconColor: "#16D6D2",
  },
  {
    name: "ModelScope",
    websiteUrl: "https://modelscope.cn",
    apiKeyUrl: "https://modelscope.cn/my/myaccesstoken",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "modelscope",
      "https://api-inference.modelscope.cn/v1",
      "ZhipuAI/GLM-5.1",
    ),
    endpointCandidates: ["https://api-inference.modelscope.cn/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "ZhipuAI/GLM-5.1",
        displayName: "ZhipuAI / GLM-5.1",
        contextWindow: 200000,
      },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "aggregator",
    icon: "modelscope",
    iconColor: "#624AFF",
  },
  {
    name: "Longcat",
    websiteUrl: "https://longcat.chat/platform",
    apiKeyUrl: "https://longcat.chat/platform/api_keys",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "longcat",
      "https://api.longcat.chat/openai/v1",
      "LongCat-2.0",
    ),
    endpointCandidates: ["https://api.longcat.chat/openai/v1"],
    // 美团 LongCat 官方 Codex 文档用 wire_api=responses 对自家 base_url，原生 Responses，无需路由接管转换
    apiFormat: "openai_responses",
    // 无官方 catalog：合成 MiMo 式（shell_command 编辑、不发 freeform apply_patch）。
    // 注：LongCat 的 /responses 工具类型契约文档化程度最低，建议真机冒烟一次
    modelCatalog: modelCatalog([
      {
        model: "LongCat-2.0",
        displayName: "LongCat 2.0",
        contextWindow: 1048576,
      },
    ]),
    category: "cn_official",
    icon: "longcat",
    iconColor: "#29E154",
  },
  {
    name: "MiniMax",
    websiteUrl: "https://platform.minimaxi.com",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "minimax",
      "https://api.minimaxi.com/v1",
      "MiniMax-M3",
    ),
    endpointCandidates: ["https://api.minimaxi.com/v1"],
    // MiniMax 官方 API 参考已列 /v1/responses 为正式端点（CN/intl 双区，POST /v1/responses），原生 Responses，无需路由接管转换
    apiFormat: "openai_responses",
    // 官方 Codex catalog（platform.minimaxi.com/docs/token-plan/codex-cli）：
    // shell_command 编辑、并行工具、文本+图像，不声明 freeform apply_patch
    modelCatalog: modelCatalog([
      {
        model: "MiniMax-M3",
        displayName: "MiniMax-M3",
        contextWindow: 1000000,
        supportsParallelToolCalls: true,
        inputModalities: ["text", "image"],
        baseInstructions:
          "You are Codex, a coding agent based on MiniMax-M3. You and the user share the same workspace and collaborate to achieve the user's goals.",
      },
    ]),
    category: "cn_official",
    theme: {
      backgroundColor: "#f64551",
      textColor: "#FFFFFF",
    },
    icon: "minimax",
    iconColor: "#FF6B6B",
  },
  {
    name: "MiniMax en",
    websiteUrl: "https://platform.minimax.io",
    apiKeyUrl: "https://platform.minimax.io/subscribe/coding-plan",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "minimax_en",
      "https://api.minimax.io/v1",
      "MiniMax-M3",
    ),
    endpointCandidates: ["https://api.minimax.io/v1"],
    // MiniMax 官方 API 参考已列 /v1/responses 为正式端点（CN/intl 双区，POST /v1/responses），原生 Responses，无需路由接管转换
    apiFormat: "openai_responses",
    // 官方 Codex catalog（platform.minimax.io/docs/token-plan/codex）：
    // shell_command 编辑、并行工具、文本+图像，不声明 freeform apply_patch
    modelCatalog: modelCatalog([
      {
        model: "MiniMax-M3",
        displayName: "MiniMax-M3",
        contextWindow: 1000000,
        supportsParallelToolCalls: true,
        inputModalities: ["text", "image"],
        baseInstructions:
          "You are Codex, a coding agent based on MiniMax-M3. You and the user share the same workspace and collaborate to achieve the user's goals.",
      },
    ]),
    category: "cn_official",
    theme: {
      backgroundColor: "#f64551",
      textColor: "#FFFFFF",
    },
    icon: "minimax",
    iconColor: "#FF6B6B",
  },
  {
    name: "BaiLing",
    websiteUrl: "https://alipaytbox.yuque.com/sxs0ba/ling/get_started",
    apiKeyUrl: "https://ling.tbox.cn/open",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "bailing",
      "https://api.tbox.cn/api/llm/v1",
      "Ling-2.6-1T",
    ),
    endpointCandidates: ["https://api.tbox.cn/api/llm/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "Ling-2.6-1T",
        displayName: "Ling-2.6-1T",
        contextWindow: 262144,
      },
    ]),
    category: "cn_official",
  },
  {
    name: "Xiaomi MiMo",
    websiteUrl: "https://platform.xiaomimimo.com",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "xiaomi_mimo",
      "https://api.xiaomimimo.com/v1",
      "mimo-v2.5-pro",
    ),
    endpointCandidates: ["https://api.xiaomimimo.com/v1"],
    // 小米 MiMo 官方 Codex 文档已声明原生支持 Responses API（wire_api=responses 对自家 base_url），无需路由接管转换
    apiFormat: "openai_responses",
    // 官方 Codex catalog（mimo.mi.com/.../codex-configuration）：
    // shell_command 编辑、不声明 freeform apply_patch
    modelCatalog: modelCatalog([
      {
        model: "mimo-v2.5-pro",
        displayName: "MiMo V2.5 Pro",
        contextWindow: 1048576,
        inputModalities: ["text"],
        baseInstructions:
          "You are MiMo, an AI assistant developed by Xiaomi. Today's date: {date} {week}. Your knowledge cutoff date is December 2024.",
      },
      {
        model: "mimo-v2.5",
        displayName: "MiMo V2.5",
        contextWindow: 1048576,
        inputModalities: ["text", "image"],
        baseInstructions:
          "You are MiMo, an AI assistant developed by Xiaomi. Today's date: {date} {week}. Your knowledge cutoff date is December 2024.",
      },
    ]),
    category: "cn_official",
    icon: "xiaomimimo",
    iconColor: "#000000",
  },
  {
    name: "Xiaomi MiMo Token Plan (China)",
    websiteUrl: "https://platform.xiaomimimo.com/#/token-plan",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/plan-manage",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "xiaomi_mimo_token_plan",
      "https://token-plan-cn.xiaomimimo.com/v1",
      "mimo-v2.5-pro",
    ),
    endpointCandidates: ["https://token-plan-cn.xiaomimimo.com/v1"],
    // 小米 MiMo 官方 Codex 文档已声明原生支持 Responses API（wire_api=responses 对自家 base_url），无需路由接管转换
    apiFormat: "openai_responses",
    // 官方 Codex catalog（mimo.mi.com/.../codex-configuration）：
    // shell_command 编辑、不声明 freeform apply_patch
    modelCatalog: modelCatalog([
      {
        model: "mimo-v2.5-pro",
        displayName: "MiMo V2.5 Pro",
        contextWindow: 1048576,
        inputModalities: ["text"],
        baseInstructions:
          "You are MiMo, an AI assistant developed by Xiaomi. Today's date: {date} {week}. Your knowledge cutoff date is December 2024.",
      },
      {
        model: "mimo-v2.5",
        displayName: "MiMo V2.5",
        contextWindow: 1048576,
        inputModalities: ["text", "image"],
        baseInstructions:
          "You are MiMo, an AI assistant developed by Xiaomi. Today's date: {date} {week}. Your knowledge cutoff date is December 2024.",
      },
    ]),
    category: "cn_official",
    icon: "xiaomimimo",
    iconColor: "#000000",
  },
  {
    name: "Novita AI",
    websiteUrl: "https://novita.ai",
    apiKeyUrl: "https://novita.ai",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "novita",
      "https://api.novita.ai/openai/v1",
      "zai-org/glm-5.1",
    ),
    endpointCandidates: ["https://api.novita.ai/openai/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "zai-org/glm-5.1",
        displayName: "GLM-5.1",
        contextWindow: 202800,
      },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "aggregator",
    icon: "novita",
    iconColor: "#000000",
  },
  {
    name: "xAI (Grok)",
    websiteUrl: "https://x.ai/api",
    apiKeyUrl: "https://console.x.ai",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig("xai", "https://api.x.ai/v1", "grok-4.5"),
    endpointCandidates: ["https://api.x.ai/v1"],
    // xAI 官方以 /v1/responses 为一等端点（docs.x.ai api-reference）：Codex 硬依赖的
    // store:false / include=["reasoning.encrypted_content"] / reasoning effort 均支持，
    // 原生 Responses，无需路由接管转换
    apiFormat: "openai_responses",
    modelCatalog: modelCatalog([
      {
        model: "grok-4.5",
        displayName: "Grok 4.5",
        contextWindow: 500000,
        supportsParallelToolCalls: true,
        inputModalities: ["text", "image"],
      },
    ]),
    category: "third_party",
    icon: "xai",
    iconColor: "#000000",
  },
  {
    name: "xAI (Grok) OAuth",
    websiteUrl: "https://x.ai/grok",
    auth: generateThirdPartyAuth(""),
    // 托管 OAuth：真实 token 由本地代理按请求注入，CodexAdapter 硬定向
    // api.x.ai；这里的 base_url / 空 auth 只是配置快照，转发时不生效。
    config: generateThirdPartyConfig("xai", "https://api.x.ai/v1", "grok-4.5"),
    apiFormat: "openai_responses",
    providerType: "xai_oauth",
    requiresOAuth: true,
    modelCatalog: modelCatalog([
      {
        model: "grok-4.5",
        displayName: "Grok 4.5",
        contextWindow: 500000,
        supportsParallelToolCalls: true,
        inputModalities: ["text", "image"],
      },
    ]),
    category: "third_party",
    icon: "xai",
    iconColor: "#000000",
  },
  {
    name: "Nvidia",
    websiteUrl: "https://build.nvidia.com",
    apiKeyUrl: "https://build.nvidia.com/settings/api-keys",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "nvidia",
      "https://integrate.api.nvidia.com/v1",
      "moonshotai/kimi-k2.5",
    ),
    endpointCandidates: ["https://integrate.api.nvidia.com/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      {
        model: "moonshotai/kimi-k2.5",
        displayName: "Kimi K2.5",
        contextWindow: 262144,
      },
    ]),
    codexChatReasoning: {
      supportsThinking: true,
      supportsEffort: false,
      thinkingParam: "thinking",
      effortParam: "none",
      outputFormat: "reasoning_content",
    },
    category: "aggregator",
    icon: "nvidia",
    iconColor: "#000000",
  },
  {
    name: "OpenCode Go",
    websiteUrl: "https://opencode.ai/go",
    apiKeyUrl: "https://opencode.ai/go",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "opencode_go",
      "https://opencode.ai/zen/go/v1",
      "glm-5.2",
    ),
    endpointCandidates: ["https://opencode.ai/zen/go/v1"],
    apiFormat: "openai_chat",
    modelCatalog: modelCatalog([
      { model: "glm-5.2", displayName: "GLM 5.2", contextWindow: 204800 },
      { model: "glm-5.1", displayName: "GLM 5.1", contextWindow: 204800 },
      {
        model: "kimi-k2.7-code",
        displayName: "Kimi K2.7 Code",
        contextWindow: 262144,
      },
      { model: "deepseek-v4-pro", displayName: "DeepSeek V4 Pro" },
      { model: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash" },
      {
        model: "mimo-v2.5-pro",
        displayName: "MiMo V2.5 Pro",
        contextWindow: 1048576,
      },
    ]),
    category: "third_party",
    icon: "opencode",
    iconColor: "#211E1E",
  },
  {
    name: "OpenRouter",
    websiteUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "openrouter",
      "https://openrouter.ai/api/v1",
      "gpt-5.6-sol",
    ),
    category: "aggregator",
    icon: "openrouter",
    iconColor: "#6566F1",
  },
  {
    name: "Me-zai",
    websiteUrl: "https://api.mezai.uk",
    auth: generateThirdPartyAuth(""),
    config: generateThirdPartyConfig(
      "Me-zai",
      "https://api.mezai.uk/v1",
      "gpt-5.5",
    ),
    endpointCandidates: ["https://api.mezai.uk/v1"],
    // Me-zai 上游为 new-api 统一中转：原生 /v1/responses 直通（ChatGPT/Codex
    // 协议），模型目录与生产环境一致；gpt-5.5/5.6 系列按 ChatGPT 后端能力
    // 声明 xhigh，1M 上下文模型按中转实际配置。
    apiFormat: "openai_responses",
    modelCatalog: modelCatalog([
      { model: "gpt-5.5", displayName: "GPT-5.5", contextWindow: 272000 },
      {
        model: "gpt-5.6-luna",
        displayName: "GPT-5.6 Luna",
        contextWindow: 272000,
      },
      {
        model: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        contextWindow: 272000,
      },
      {
        model: "gpt-5.6-terra",
        displayName: "GPT-5.6 Terra",
        contextWindow: 272000,
      },
      { model: "grok-4.5", displayName: "Grok 4.5", contextWindow: 400000 },
      {
        model: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        contextWindow: 1000000,
      },
      { model: "kimi-k3", displayName: "Kimi K3", contextWindow: 1000000 },
      {
        model: "Gemini 3.7 Flash",
        displayName: "Gemini 3.7 Flash",
        contextWindow: 1000000,
      },
      { model: "glm-5.3", displayName: "GLM-5.3", contextWindow: 1000000 },
      {
        model: "muse-spark-1.2-contributor",
        displayName: "Muse Spark 1.2 Contributor",
        contextWindow: 1000000,
      },
      {
        model: "claude-opus-4-6",
        displayName: "Claude Opus 4.6",
        contextWindow: 1000000,
      },
      {
        model: "glm-5.3-flash",
        displayName: "GLM-5.3 Flash",
        contextWindow: 1000000,
      },
    ]),
    category: "third_party",
  },
];
