import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCodexConfigState } from "@/components/providers/forms/hooks/useCodexConfigState";
import { normalizeCodexCatalogModelsForSave } from "@/components/providers/forms/ProviderForm";

// 回归测试：编辑供应商保存一次就把所有模型的推理强度档位
// （reasoningLevels/defaultReasoningLevel）和按模型 apiFormat 抹掉，
// 导致 Codex"推理强度"选择器退化成只剩"高"。loader 必须把这些
// 字段读进 state，保存序列化必须原样保留。
describe("useCodexConfigState modelCatalog round-trip", () => {
  const settingsConfig = {
    auth: { OPENAI_API_KEY: "sk-test" },
    config: 'model = "gpt-5.6-luna"\nmodel_provider = "custom"\n',
    modelCatalog: {
      models: [
        {
          model: "gpt-5.6-luna",
          displayName: "Luna",
          contextWindow: 400000,
          apiFormat: "openai_responses",
          reasoningLevels: ["low", "medium", "high", "xhigh"],
          defaultReasoningLevel: "medium",
        },
        {
          model: "grok-4.5",
          // snake_case 兜底（live 反解形状）
          reasoning_levels: ["low", "medium", "high"],
          default_reasoning_level: "high",
        },
        {
          model: "gemini-3.7-flash",
          apiFormat: "openai_chat",
          reasoningLevels: [],
          defaultReasoningLevel: "",
        },
      ],
    },
  };

  it("loads reasoning levels + per-model apiFormat and survives save normalization", async () => {
    // initialData 必须是稳定引用：hook 的加载 effect 以 [initialData] 为依赖，
    // 内联字面量会每次渲染新建对象造成无限重渲染。
    const initialData = { settingsConfig };
    const { result } = renderHook(() => useCodexConfigState({ initialData }));

    // useEffect 加载是异步的
    await act(async () => {});

    const models = result.current.codexCatalogModels;
    expect(models).toHaveLength(3);

    const [luna, grok, gemini] = models;

    expect(luna.apiFormat).toBe("openai_responses");
    expect(luna.reasoningLevels).toEqual(["low", "medium", "high", "xhigh"]);
    expect(luna.defaultReasoningLevel).toBe("medium");

    // snake_case 兼容读取
    expect(grok.reasoningLevels).toEqual(["low", "medium", "high"]);
    expect(grok.defaultReasoningLevel).toBe("high");

    // 空档位不落地为字段（交给后端家族推导）
    expect(gemini.apiFormat).toBe("openai_chat");
    expect(gemini.reasoningLevels).toBeUndefined();
    expect(gemini.defaultReasoningLevel).toBeUndefined();

    // 模拟"用户加了一个新模型行后保存"
    const saved = normalizeCodexCatalogModelsForSave([
      ...models,
      { model: "new-model" },
    ]);
    expect(saved[0]).toMatchObject({
      model: "gpt-5.6-luna",
      apiFormat: "openai_responses",
      reasoningLevels: ["low", "medium", "high", "xhigh"],
      defaultReasoningLevel: "medium",
    });
    expect(saved[1]).toMatchObject({
      model: "grok-4.5",
      reasoningLevels: ["low", "medium", "high"],
      defaultReasoningLevel: "high",
    });
    expect(saved[2]).toMatchObject({
      model: "gemini-3.7-flash",
      apiFormat: "openai_chat",
    });
    expect(saved[3]).toEqual({ model: "new-model" });
  });
});
