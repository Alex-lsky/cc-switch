import { describe, expect, it } from "vitest";
import { OPENCODE_PRESET_MODEL_VARIANTS } from "@/config/opencodeProviderPresets";

describe("OpenCode preset model variants", () => {
  it("keeps Google OpenCode preset model ids unique", () => {
    const googleModels = OPENCODE_PRESET_MODEL_VARIANTS["@ai-sdk/google"];
    const ids = googleModels.map((model) => model.id);
    const geminiFlashModels = googleModels.filter(
      (model) => model.id === "gemini-3.6-flash",
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(geminiFlashModels).toHaveLength(1);
    expect(geminiFlashModels[0]).toMatchObject({
      name: "Gemini 3.6 Flash",
      variants: {
        minimal: expect.any(Object),
        low: expect.any(Object),
        medium: expect.any(Object),
        high: expect.any(Object),
      },
    });
  });
});
