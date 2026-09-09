import { describe, expect, it } from "vitest";
import { providerPresets } from "@/config/claudeProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";
import { geminiProviderPresets } from "@/config/geminiProviderPresets";
import { grokBuildProviderPresets } from "@/config/grokBuildProviderPresets";
import { hermesProviderPresets } from "@/config/hermesProviderPresets";
import { openclawProviderPresets } from "@/config/openclawProviderPresets";
import { opencodeProviderPresets } from "@/config/opencodeProviderPresets";

const apps = {
  claude: providerPresets,
  codex: codexProviderPresets,
  desktop: claudeDesktopProviderPresets,
  gemini: geminiProviderPresets,
  grok: grokBuildProviderPresets,
  hermes: hermesProviderPresets,
  openclaw: openclawProviderPresets,
  opencode: opencodeProviderPresets,
};
// Pi retains the separate pre-existing roster shipped in Pro 3.20.3.
describe("Pro release preset policy", () => {
  for (const [app, presets] of Object.entries(apps)) {
    it(`${app} retains neutral entries without restoring removed commercial relays`, () => {
      expect(new Set(presets.map((p) => p.name)).size).toBe(presets.length);
      for (const preset of presets) {
        expect(preset.name).not.toMatch(
          /^(PackyCode|TeamoRouter|JieKou AI|PPIO|9527CODE|SoleAPI|AICodeWith|AICoding|SubRouter|FennoAI|RunAPI|Cubence|CrazyRouter)$/,
        );
        expect(
          "isPartner" in preset && preset.isPartner,
          preset.name,
        ).toBeFalsy();
        expect(
          "primePartner" in preset && preset.primePartner,
          preset.name,
        ).toBeFalsy();
        expect(
          "partnerPromotionKey" in preset && preset.partnerPromotionKey,
          preset.name,
        ).toBeFalsy();
        for (const key of ["websiteUrl", "apiKeyUrl"] as const) {
          const url =
            key in preset ? preset[key as keyof typeof preset] : undefined;
          if (typeof url === "string")
            expect(url, preset.name).not.toMatch(
              /[?&](aff|ref|invite|referral)=/i,
            );
        }
      }
    });
  }
  it("keeps the Me-zai native Responses card and upstream OAuth safety", () => {
    const mezai = codexProviderPresets.find((p) => p.name === "Me-zai");
    expect(mezai?.apiFormat).toBe("openai_responses");
    expect(mezai?.config).toContain("https://api.mezai.uk/v1");
    for (const p of codexProviderPresets.filter((p) => p.requiresOAuth))
      expect(p.config).toContain("requires_openai_auth = false");
    const glm = codexProviderPresets.find((p) => p.name === "Zhipu GLM");
    expect(glm?.apiFormat).toBe("openai_responses");
  });
});
