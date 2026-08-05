import { describe, expect, it } from "vitest";
import { providerNeedsRouting } from "@/utils/providerCapabilities";
import type { Provider } from "@/types";

function makeCodexProvider(
  metaApiFormat: string | undefined,
  modelApiFormats: Array<{ model: string; apiFormat?: string }>,
): Provider {
  return {
    id: "test",
    name: "Test",
    settingsConfig: {
      config: `model_provider = "custom"\n\n[model_providers.custom]\nname = "test"\nwire_api = "responses"\n`,
      modelCatalog: { models: modelApiFormats },
    },
    websiteUrl: undefined,
    category: undefined,
    createdAt: undefined,
    sortIndex: undefined,
    notes: undefined,
    meta: metaApiFormat ? { apiFormat: metaApiFormat } : undefined,
    icon: undefined,
    iconColor: undefined,
    inFailoverQueue: false,
  } as Provider;
}

describe("providerNeedsRouting (codex)", () => {
  it("provider-level responses with no model overrides → direct (no routing)", () => {
    const provider = makeCodexProvider("openai_responses", [
      { model: "gpt-5.6-luna" },
      { model: "gpt-5.5" },
    ]);
    expect(providerNeedsRouting("codex", provider)).toBe(false);
  });

  it("provider-level chat → routing", () => {
    const provider = makeCodexProvider("openai_chat", [
      { model: "grok-4.5" },
    ]);
    expect(providerNeedsRouting("codex", provider)).toBe(true);
  });

  it("provider-level responses but a model declares chat → routing (mixed gateway)", () => {
    const provider = makeCodexProvider("openai_responses", [
      { model: "gpt-5.6-luna", apiFormat: "openai_responses" },
      { model: "grok-4.5", apiFormat: "openai_chat" },
      { model: "glm-5.2", apiFormat: "openai_chat" },
    ]);
    expect(providerNeedsRouting("codex", provider)).toBe(true);
  });

  it("provider-level responses but a model declares anthropic → routing", () => {
    const provider = makeCodexProvider("openai_responses", [
      { model: "claude-sonnet", apiFormat: "anthropic" },
    ]);
    expect(providerNeedsRouting("codex", provider)).toBe(true);
  });

  it("provider-level responses with only responses model overrides → no routing", () => {
    const provider = makeCodexProvider("openai_responses", [
      { model: "gpt-5.6-luna", apiFormat: "openai_responses" },
      { model: "deepseek-v4-flash", apiFormat: "openai_responses" },
    ]);
    expect(providerNeedsRouting("codex", provider)).toBe(false);
  });

  it("official provider never needs routing", () => {
    const provider = makeCodexProvider("openai_chat", [
      { model: "grok-4.5", apiFormat: "openai_chat" },
    ]);
    provider.category = "official";
    expect(providerNeedsRouting("codex", provider)).toBe(false);
  });

  it("empty model catalog falls back to provider-level decision", () => {
    const provider = makeCodexProvider("openai_responses", []);
    expect(providerNeedsRouting("codex", provider)).toBe(false);
  });
});
