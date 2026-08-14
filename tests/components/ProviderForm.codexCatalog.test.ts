import { describe, expect, it } from "vitest";
import { normalizeCodexCatalogModelsForSave } from "@/components/providers/forms/ProviderForm";

describe("ProviderForm Codex catalog helpers", () => {
  it("normalizes catalog rows and removes empty or duplicate models", () => {
    expect(
      normalizeCodexCatalogModelsForSave([
        { model: " deepseek-v4-flash ", displayName: " DeepSeek " },
        { model: "deepseek-v4-flash", displayName: "Duplicate" },
        { model: "", displayName: "Empty" },
        { model: "kimi-k2", contextWindow: "128000 tokens" },
      ]),
    ).toEqual([
      { model: "deepseek-v4-flash", displayName: "DeepSeek" },
      { model: "kimi-k2", contextWindow: 128000 },
    ]);
  });

  it("preserves per-model apiFormat override and drops empty/invalid values", () => {
    expect(
      normalizeCodexCatalogModelsForSave([
        {
          model: "glm-5.2",
          displayName: "GLM-5.2",
          apiFormat: "openai_chat",
        },
        {
          model: "gpt-5.6-luna",
          apiFormat: "openai_responses",
        },
        {
          model: "claude-sonnet",
          apiFormat: "anthropic",
        },
        // Missing apiFormat must stay unset (inherit provider-level default)
        { model: "kimi-k3" },
        { model: "untagged-model" },
      ]),
    ).toEqual([
      { model: "glm-5.2", displayName: "GLM-5.2", apiFormat: "openai_chat" },
      { model: "gpt-5.6-luna", apiFormat: "openai_responses" },
      { model: "claude-sonnet", apiFormat: "anthropic" },
      { model: "kimi-k3" },
      { model: "untagged-model" },
    ]);
  });

  it("preserves native-profile overrides (parallel tool calls + input modalities + base instructions)", () => {
    expect(
      normalizeCodexCatalogModelsForSave([
        {
          model: "MiniMax-M3",
          displayName: "MiniMax-M3",
          contextWindow: 1000000,
          supportsParallelToolCalls: true,
          inputModalities: ["text", "image"],
          baseInstructions:
            "  You are Codex, a coding agent based on MiniMax-M3.  ",
        },
        // false must be preserved (not dropped as falsy); empty modalities dropped;
        // empty/whitespace baseInstructions dropped
        {
          model: "mimo-v2.5-pro",
          supportsParallelToolCalls: false,
          inputModalities: [],
          baseInstructions: "   ",
        },
      ]),
    ).toEqual([
      {
        model: "MiniMax-M3",
        displayName: "MiniMax-M3",
        contextWindow: 1000000,
        supportsParallelToolCalls: true,
        inputModalities: ["text", "image"],
        baseInstructions: "You are Codex, a coding agent based on MiniMax-M3.",
      },
      { model: "mimo-v2.5-pro", supportsParallelToolCalls: false },
    ]);
  });

  it("preserves per-model reasoning levels and default level across the save round-trip", () => {
    expect(
      normalizeCodexCatalogModelsForSave([
        {
          model: "gpt-5.6-luna",
          reasoningLevels: ["low", "medium", "high", "xhigh"],
          defaultReasoningLevel: "medium",
        },
        {
          model: "grok-4.5",
          // 去重 + 去空白
          reasoningLevels: ["low", " low ", "high", ""],
          defaultReasoningLevel: "high",
        },
        {
          model: "kimi-k3",
          reasoningLevels: ["low", "medium"],
          // 默认档不在档位列表里 → 丢弃（无法生效）
          defaultReasoningLevel: "xhigh",
        },
        {
          model: "untagged",
          reasoningLevels: [],
          defaultReasoningLevel: "  ",
        },
      ]),
    ).toEqual([
      {
        model: "gpt-5.6-luna",
        reasoningLevels: ["low", "medium", "high", "xhigh"],
        defaultReasoningLevel: "medium",
      },
      { model: "grok-4.5", reasoningLevels: ["low", "high"], defaultReasoningLevel: "high" },
      { model: "kimi-k3", reasoningLevels: ["low", "medium"] },
      { model: "untagged" },
    ]);
  });
});
