import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsFormState } from "@/hooks/useSettings";
import { CodexAuthSettings } from "@/components/settings/CodexAuthSettings";

const { settingsApiMock, toastSuccessMock, toastErrorMock } = vi.hoisted(
  () => ({
    settingsApiMock: {
      hasCodexUnifyHistoryBackup: vi.fn(),
      restoreCodexUnifiedHistory: vi.fn(),
      resetCodexState: vi.fn(),
    },
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }),
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  settingsApi: settingsApiMock,
}));

vi.mock("@/components/ui/toggle-row", () => ({
  ToggleRow: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    confirmText,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    confirmText: string;
    onConfirm: (checked: boolean) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <span>{title}</span>
        <button type="button" onClick={() => onConfirm(false)}>
          {confirmText}
        </button>
      </div>
    ) : null,
}));

const settings = {
  preserveCodexOfficialAuthOnSwitch: true,
  unifyCodexSessionHistory: false,
} as SettingsFormState;

function renderSettings() {
  return render(<CodexAuthSettings settings={settings} onChange={vi.fn()} />);
}

function confirmReset() {
  fireEvent.click(screen.getByText("settings.resetCodexStateAction"));
  expect(
    screen.getByRole("dialog", { name: "confirm.resetCodexState.title" }),
  ).toBeInTheDocument();
  expect(settingsApiMock.resetCodexState).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("confirm.resetCodexState.confirm"));
}

describe("CodexAuthSettings reset state", () => {
  beforeEach(() => {
    settingsApiMock.resetCodexState.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("requires destructive confirmation and reports a removed auth file", async () => {
    settingsApiMock.resetCodexState.mockResolvedValue({
      takeoverDisabled: true,
      authRemoved: true,
      providerId: "codex-official",
    });
    renderSettings();

    confirmReset();

    await waitFor(() =>
      expect(settingsApiMock.resetCodexState).toHaveBeenCalledTimes(1),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "settings.resetCodexStateCompleted",
    );
  });

  it("shows an error toast when the reset fails", async () => {
    settingsApiMock.resetCodexState.mockRejectedValue(new Error("busy"));
    renderSettings();

    confirmReset();

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "settings.resetCodexStateFailed",
      ),
    );
  });

  it("disables the action and shows progress while reset is pending", async () => {
    let resolveReset!: (value: {
      takeoverDisabled: boolean;
      authRemoved: boolean;
      providerId: string;
    }) => void;
    settingsApiMock.resetCodexState.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        }),
    );
    renderSettings();

    confirmReset();

    const pendingButton = await screen.findByRole("button", {
      name: "settings.resetCodexStateRunning",
    });
    expect(pendingButton).toBeDisabled();

    resolveReset({
      takeoverDisabled: false,
      authRemoved: false,
      providerId: "codex-official",
    });
    await waitFor(() => expect(pendingButton).not.toBeDisabled());
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "settings.resetCodexStateCompletedNoAuth",
    );
  });
});
