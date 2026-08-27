import { describe, expect, it } from "vitest";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { providerPresets } from "@/config/claudeProviderPresets";

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

  it("carries no commercial markers (neutral built-in channel)", () => {
    for (const preset of [
      ...codexProviderPresets.filter((p) => p.name === "Me-zai"),
      ...providerPresets.filter((p) => p.name === "Me-zai"),
    ]) {
      expect(preset.isPartner).toBeFalsy();
      expect(preset.primePartner).toBeFalsy();
      expect(preset.partnerPromotionKey).toBeUndefined();
      expect(preset.websiteUrl ?? "").not.toContain("aff=");
    }
  });
});
