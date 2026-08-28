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
import { sortPresetEntries } from "@/components/providers/forms/ProviderPresetSelector";
import { PresetSortMode } from "@/components/providers/forms/ProviderPresetSelector";

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

describe("Me-zai built-in presets", () => {
  it("registers a Codex preset with native Responses passthrough", () => {
    const preset = codexProviderPresets.find((item) => item.name === "Me-zai");
    expect(preset).toBeDefined();
    expect(preset?.apiFormat).toBe("openai_responses");
    expect(preset?.category).toBe("third_party");
    expect(preset?.config).toContain('base_url = "https://api.mezai.uk/v1"');
    expect(preset?.config).toContain('wire_api = "responses"');
    expect(preset?.auth).toEqual({ OPENAI_API_KEY: "" });
    const catalog = preset?.modelCatalog ?? [];
    expect(catalog.length).toBeGreaterThanOrEqual(12);
    expect(catalog.some((m) => m.model === "gpt-5.5")).toBe(true);
  });

  it("registers a Claude preset pointing at the Me-zai gateway", () => {
    const preset = providerPresets.find((item) => item.name === "Me-zai");
    expect(preset).toBeDefined();
    expect(preset?.category).toBe("third_party");
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

  it("pins Me-zai first in every app's preset grid (both sort modes)", () => {
    for (const [app, presets] of PRESET_SETS) {
      const entries = presets.map((preset, index) => ({
        id: `${app}-${index}`,
        preset,
      }));
      const t = (key: string) => key;
      for (const sortMode of [
        PresetSortMode.Original,
        PresetSortMode.NameAsc,
      ]) {
        const sorted = sortPresetEntries(entries, sortMode, t);
        expect(sorted[0]?.preset.name, `${app} ${sortMode} 置顶`).toBe(
          "Me-zai",
        );
      }
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
