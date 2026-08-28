import type { ProviderCategory } from "@/types";

/**
 * Gemini 预设供应商的视觉主题配置
 */
export interface GeminiPresetTheme {
  /** 图标类型：'gemini' | 'generic' */
  icon?: "gemini" | "generic";
  /** 背景色（选中状态），支持 hex 颜色 */
  backgroundColor?: string;
  /** 文字色（选中状态），支持 hex 颜色 */
  textColor?: string;
}

export interface GeminiProviderPreset {
  /** 置顶预设：在预设网格中始终排在最前（本地内置渠道用） */
  pinned?: boolean;
  name: string;
  nameKey?: string; // i18n key for localized display name
  websiteUrl: string;
  apiKeyUrl?: string;
  settingsConfig: object;
  baseURL?: string;
  model?: string;
  description?: string;
  category?: ProviderCategory;
  isPartner?: boolean;
  primePartner?: boolean; // 置顶合作伙伴（顶级）：徽章显示为心形
  partnerPromotionKey?: string;
  endpointCandidates?: string[];
  theme?: GeminiPresetTheme;
  // 图标配置
  icon?: string; // 图标名称
  iconColor?: string; // 图标颜色
}

export const geminiProviderPresets: GeminiProviderPreset[] = [
  {
    name: "Google Official",
    websiteUrl: "https://ai.google.dev/",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    settingsConfig: {
      env: {},
    },
    description: "Google 官方 Gemini API (OAuth)",
    category: "official",
    theme: {
      icon: "gemini",
      backgroundColor: "#4285F4",
      textColor: "#FFFFFF",
    },
    icon: "gemini",
    iconColor: "#4285F4",
  },
  // ===== 主流厂商预设（文件顺序不影响展示，按显示名排序） =====
  {
    name: "Qiniu",
    nameKey: "providerForm.presets.qiniu",
    websiteUrl: "https://s.qiniu.com/nMvAvy",
    apiKeyUrl: "https://s.qiniu.com/nMvAvy",
    settingsConfig: {
      env: {
        GOOGLE_GEMINI_BASE_URL: "https://api.qnaigc.com/bypass/vertex",
        GEMINI_MODEL: "gemini-3.6-flash",
      },
    },
    baseURL: "https://api.qnaigc.com/bypass/vertex",
    model: "gemini-3.6-flash",
    description: "Qiniu",
    category: "aggregator",
    endpointCandidates: [
      "https://api.qnaigc.com/bypass/vertex",
      "https://api.modelink.ai/bypass/vertex",
    ],
    icon: "qiniu",
  },
  // ===== 其他预设 =====
  {
    name: "OpenRouter",
    websiteUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    settingsConfig: {
      env: {
        GOOGLE_GEMINI_BASE_URL: "https://openrouter.ai/api",
        GEMINI_MODEL: "gemini-3.6-flash",
      },
    },
    baseURL: "https://openrouter.ai/api",
    model: "gemini-3.6-flash",
    description: "OpenRouter",
    category: "aggregator",
    icon: "openrouter",
    iconColor: "#6566F1",
  },
  {
    name: "自定义",
    websiteUrl: "",
    settingsConfig: {
      env: {
        GOOGLE_GEMINI_BASE_URL: "",
        GEMINI_MODEL: "gemini-3.6-flash",
      },
    },
    model: "gemini-3.6-flash",
    description: "自定义 Gemini API 端点",
    category: "custom",
  },
  {
    name: "Me-zai",
    websiteUrl: "https://api.mezai.uk",
    settingsConfig: {
      env: {
        GOOGLE_GEMINI_BASE_URL: "https://api.mezai.uk",
        GEMINI_MODEL: "gemini-3.6-flash-high",
      },
    },
    baseURL: "https://api.mezai.uk",
    model: "gemini-3.6-flash-high",
    description: "Me-zai 统一中转（Gemini 兼容协议）",
    category: "third_party",
    pinned: true,
    icon: "mezai",
    iconColor: "#6366F1",
  },
];

export function getGeminiPresetByName(
  name: string,
): GeminiProviderPreset | undefined {
  return geminiProviderPresets.find((preset) => preset.name === name);
}

export function getGeminiPresetByUrl(
  url: string,
): GeminiProviderPreset | undefined {
  if (!url) return undefined;
  return geminiProviderPresets.find(
    (preset) =>
      preset.baseURL &&
      url.toLowerCase().includes(preset.baseURL.toLowerCase()),
  );
}
