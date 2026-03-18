import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// -----------------------------------------------------------------------
// Mock server actions before importing component
// Use vi.hoisted so variables are available inside the vi.mock factory.
// -----------------------------------------------------------------------
const { mockDeactivateUserAction, mockActivateUserAction } = vi.hoisted(() => ({
  mockDeactivateUserAction: vi.fn(),
  mockActivateUserAction: vi.fn(),
}));

vi.mock("@/app/dashboard/actions", () => ({
  createStationAction: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteStationAction: vi.fn(),
  updateStationAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  deactivateUserAction: mockDeactivateUserAction,
  activateUserAction: mockActivateUserAction,
}));

import { ToggleUserStatusDialog } from "@/components/user/toggle-user-status-dialog";

const activeUser = { userId: "user_abc", isActive: true };
const inactiveUser = { userId: "user_abc", isActive: false };

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------
// ToggleUserStatusDialog
// -----------------------------------------------------------------------
describe("ToggleUserStatusDialog — active user (deactivate flow)", () => {
  it("renders a deactivate button for an active user", () => {
    render(<ToggleUserStatusDialog user={activeUser} />);
    expect(screen.getByRole("button", { name: /deactivate/i })).toBeInTheDocument();
  });

  it("opens a confirmation dialog when trigger is clicked", async () => {
    render(<ToggleUserStatusDialog user={activeUser} />);
    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls deactivateUserAction when confirmed for an active user", async () => {
    mockDeactivateUserAction.mockResolvedValue({ success: true });
    render(<ToggleUserStatusDialog user={activeUser} />);

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    // Click the confirm button inside the dialog (last button matching)
    const confirmButtons = screen.getAllByRole("button", { name: /deactivate/i, hidden: true });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockDeactivateUserAction).toHaveBeenCalledWith("user_abc");
    });
  });

  it("displays an error when deactivation fails", async () => {
    mockDeactivateUserAction.mockResolvedValue({ error: "Cannot deactivate last admin" });
    render(<ToggleUserStatusDialog user={activeUser} />);

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    // Click the confirm button inside the dialog (last button matching)
    const confirmButtons = screen.getAllByRole("button", { name: /deactivate/i, hidden: true });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/cannot deactivate last admin/i)).toBeInTheDocument();
    });
  });

  it("closes the dialog when Cancel is clicked", async () => {
    render(<ToggleUserStatusDialog user={activeUser} />);

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ToggleUserStatusDialog — inactive user (activate flow)", () => {
  it("renders an activate button for an inactive user", () => {
    render(<ToggleUserStatusDialog user={inactiveUser} />);
    expect(screen.getByRole("button", { name: /activate/i })).toBeInTheDocument();
  });

  it("calls activateUserAction when confirmed for an inactive user", async () => {
    mockActivateUserAction.mockResolvedValue({ success: true });
    render(<ToggleUserStatusDialog user={inactiveUser} />);

    await userEvent.click(screen.getByRole("button", { name: /activate/i }));

    const confirmButtons = screen.getAllByRole("button", { name: /activate/i, hidden: true });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockActivateUserAction).toHaveBeenCalledWith("user_abc");
    });
  });
});
