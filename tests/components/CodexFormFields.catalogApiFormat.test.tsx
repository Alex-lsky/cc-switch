import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { CodexFormFields } from "@/components/providers/forms/CodexFormFields";
import { Form } from "@/components/ui/form";
import type { CodexApiFormat } from "@/types";

// 回归测试：CodexFormFields 的模型目录"上游接口"列曾用 <SelectItem value="" />
// 表示"跟随默认"，Radix Select 禁止空字符串 Item value，渲染即抛错导致
// ErrorBoundary 崩溃（打开 Me-zai 配置页报"界面遇到了问题"）。
// 修复改为 __inherit__ sentinel。此测试渲染完整组件验证不再崩溃。

const catalogModels = [
  // 混合网关：responses 模型
  { model: "gpt-5.6-luna", displayName: "gpt-5.6-luna", apiFormat: "openai_responses" as CodexApiFormat },
  // chat 模型（探测写回的结果）
  { model: "grok-4.5", displayName: "grok-4.5", apiFormat: "openai_chat" as CodexApiFormat },
  // 未标注模型（留空 = 跟随 provider 级默认）→ 旧代码会在这里渲染 value="" 崩溃
  { model: "glm-5.2", displayName: "glm-5.2" },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  const form = useForm();
  return <Form {...form}>{children}</Form>;
}

function renderCodexFormFields() {
  return render(
    <Wrapper>
      <CodexFormFields
      appId="codex"
      providerId="mezai"
      codexApiKey="sk-test"
      onApiKeyChange={() => {}}
      category="aggregator"
      shouldShowApiKeyLink={false}
      websiteUrl=""
      shouldShowSpeedTest
      codexBaseUrl="https://api.mezai.uk/v1"
      onBaseUrlChange={() => {}}
      isFullUrl={false}
      onFullUrlChange={() => {}}
      isEndpointModalOpen={false}
      onEndpointModalToggle={() => {}}
      autoSelect
      onAutoSelectChange={() => {}}
      apiFormat="openai_responses"
      onApiFormatChange={() => {}}
      anthropicAuthField="ANTHROPIC_AUTH_TOKEN"
      onAnthropicAuthFieldChange={() => {}}
      impersonateClaudeCode={false}
      onImpersonateClaudeCodeChange={() => {}}
      maxOutputTokens=""
      onMaxOutputTokensChange={() => {}}
      promptCacheRouting="auto"
      onPromptCacheRoutingChange={() => {}}
      catalogModels={catalogModels}
      onCatalogModelsChange={() => {}}
      speedTestEndpoints={[]}
      customUserAgent=""
      onCustomUserAgentChange={() => {}}
      localProxyHeadersOverride=""
      onLocalProxyHeadersOverrideChange={() => {}}
      localProxyBodyOverride=""
      onLocalProxyBodyOverrideChange={() => {}}
      />
      </Wrapper>,
  );
}

describe("CodexFormFields model-catalog upstream API column", () => {
  it("renders the provider config without crashing (regression: empty SelectItem value)", () => {
    expect(() => renderCodexFormFields()).not.toThrow();
  });

  it("shows the per-model upstream API selects with the inherit option", () => {
    renderCodexFormFields();
    // 模型映射标题 + 至少一个"跟随默认"选项存在（glm-5.2 未标注）
    const inheritOption = screen.queryAllByText(/跟随默认/);
    expect(inheritOption.length).toBeGreaterThan(0);
    // 未标注模型的行应有"上游接口"选择器
    const apiSelects = screen.queryAllByRole("combobox");
    expect(apiSelects.length).toBeGreaterThan(0);
  });
});
