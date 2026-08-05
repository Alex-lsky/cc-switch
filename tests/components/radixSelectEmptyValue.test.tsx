import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as SelectPrimitive from "@radix-ui/react-select";

// 回归测试：Radix Select.Item 的 value 不能是空字符串。
// 曾在 CodexFormFields 模型目录"上游接口"列用了 <SelectItem value="" />，
// 打开配置页即触发 "must have a value prop that is not an empty string"，
// 导致 ErrorBoundary 崩溃（"界面遇到了问题"）。修复改为 sentinel 值。
describe("Radix Select empty-value guard (upstream API format column regression)", () => {
  it("empty-string SelectItem value throws during render", () => {
    // 捕获 React 渲染错误（Radix 用 invariant 抛错）
    let caught: Error | null = null;
    try {
      render(
        <SelectPrimitive.Root>
          <SelectPrimitive.Trigger>
            <SelectPrimitive.Value placeholder="select" />
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content>
              <SelectPrimitive.Viewport>
                <SelectPrimitive.Item value="">
                  inherit
                </SelectPrimitive.Item>
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>,
      );
      screen.getByRole("option");
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toContain("not an empty string");
  });

  it("sentinel non-empty value renders without throwing", () => {
    expect(() =>
      render(
        <SelectPrimitive.Root>
          <SelectPrimitive.Trigger>
            <SelectPrimitive.Value placeholder="select" />
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content>
              <SelectPrimitive.Viewport>
                <SelectPrimitive.Item value="__inherit__">
                  inherit
                </SelectPrimitive.Item>
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>,
      ),
    ).not.toThrow();
  });
});
