import { describe, expect, it } from "vitest";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { providerPresets } from "@/config/claudeProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";
import { geminiProviderPresets } from "@/config/geminiProviderPresets";
import { grokBuildProviderPresets } from "@/config/grokBuildProviderPresets";
import { hermesProviderPresets } from "@/config/hermesProviderPresets";
import { openclawProviderPresets } from "@/config/openclawProviderPresets";
import { opencodeProviderPresets } from "@/config/opencodeProviderPresets";
import { icons } from "@/icons/extracted";
import {
  groupPresetRows,
  sortPresetRowsByName,
} from "@/components/providers/forms/presetGroups";

const PRESET_SETS = [
  ["claude", providerPresets],
  ["claudeDesktop", claudeDesktopProviderPresets],
  ["codex", codexProviderPresets],
  ["gemini", geminiProviderPresets],
  ["grokBuild", grokBuildProviderPresets],
  ["hermes", hermesProviderPresets],
  ["openclaw", openclawProviderPresets],
  ["opencode", opencodeProviderPresets],
] as const;

const t = (key: string) => key;

describe("Me-zai built-in presets", () => {
  it("registers a Codex preset with native Responses passthrough", () => {
    const preset = codexProviderPresets.find((item) => item.name === "Me-zai");
    expect(preset).toBeDefined();
    expect(preset?.apiFormat).toBe("openai_responses");
    expect(preset?.category).toBe("third_party");
    expect(preset?.config).toContain('base_url = "https://api.mezai.uk/v1"');
    expect(preset?.config).toContain('wire_api = "responses"');
    // 维护者本机现行配置：默认模型 gpt-6-sol + xhigh 推理档
    expect(preset?.config).toContain('model = "gpt-6-sol"');
    expect(preset?.config).toContain('model_reasoning_effort = "xhigh"');
    const catalog = preset?.modelCatalog ?? [];
    expect(catalog.length).toBeGreaterThanOrEqual(13);
    // 目录[0] 须与 config.toml 的 model 一致
    expect(catalog[0].model).toBe("gpt-6-sol");
    expect(catalog.some((m) => m.model === "mimo-v2.6-pro")).toBe(true);
  });

  it("registers a Claude preset pointing at the Me-zai gateway", () => {
    const preset = providerPresets.find((item) => item.name === "Me-zai");
    expect(preset).toBeDefined();
    const env = (preset?.settingsConfig as { env: Record<string, string> }).env;
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.mezai.uk");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("");
  });

  it("is present in every app's preset list", () => {
    for (const [app, presets] of PRESET_SETS) {
      const count = presets.filter((p) => p.name === "Me-zai").length;
      expect(count, `${app} 应恰好注册一个 Me-zai 预设`).toBe(1);
    }
  });

  it("carries no commercial markers (neutral built-in channel)", () => {
    for (const [, presets] of PRESET_SETS) {
      for (const preset of presets.filter((p) => p.name === "Me-zai")) {
        const anyPreset = preset as unknown as Record<string, unknown>;
        expect(anyPreset.isPartner).toBeFalsy();
        expect(anyPreset.primePartner).toBeFalsy();
        expect(anyPreset.partnerPromotionKey).toBeUndefined();
        expect(String(anyPreset.websiteUrl ?? "")).not.toContain("aff=");
      }
    }
  });

  it("pins Me-zai first in every app's preset grid (name sort)", () => {
    for (const [app, presets] of PRESET_SETS) {
      const entries = presets
        .filter((p) => !(p as { hidden?: boolean }).hidden)
        .map((preset, index) => ({ id: `${app}-${index}`, preset }));
      const rows = groupPresetRows(entries);
      const sorted = sortPresetRowsByName(
        rows.map((row) => ({ row, hits: [] as number[] })),
        t,
      );
      if (sorted.length === 0) {
        throw new Error(`${app}: rows 为空（entries=${entries.length}）`);
      }
      const firstLabel = sorted[0]?.row.versions[0]?.preset.name;
      expect(firstLabel, `${app} 置顶`).toBe("Me-zai");
    }
  });

  it("ships the mezai icon", () => {
    expect(icons.mezai).toBeDefined();
    expect(icons.mezai).toContain("<svg");
    for (const [, presets] of PRESET_SETS) {
      const preset = presets.find((p) => p.name === "Me-zai");
      expect(preset?.pinned).toBe(true);
      expect((preset as { icon?: string })?.icon).toBe("mezai");
    }
  });
});
