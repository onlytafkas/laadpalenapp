import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockTriggerSessionRemindersAction } = vi.hoisted(() => ({
  mockTriggerSessionRemindersAction: vi.fn(),
}));

vi.mock("@/app/dashboard/actions", () => ({
  triggerSessionRemindersAction: mockTriggerSessionRemindersAction,
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  createStationAction: vi.fn(),
  updateStationAction: vi.fn(),
  deleteStationAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  deactivateUserAction: vi.fn(),
  activateUserAction: vi.fn(),
}));

import { TriggerSessionRemindersButton } from "@/components/session/trigger-session-reminders-button";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TriggerSessionRemindersButton", () => {
  it("renders the trigger button", () => {
    render(<TriggerSessionRemindersButton />);

    expect(screen.getByRole("button", { name: /run reminder cron/i })).toBeInTheDocument();
  });

  it("calls the action and shows the counts on success", async () => {
    mockTriggerSessionRemindersAction.mockResolvedValue({
      success: true,
      data: { startReminders: 2, endReminders: 1 },
    });

    render(<TriggerSessionRemindersButton />);

    await userEvent.click(screen.getByRole("button", { name: /run reminder cron/i }));

    await waitFor(() => {
      expect(mockTriggerSessionRemindersAction).toHaveBeenCalled();
    });
    expect(screen.getByText(/triggered reminders: 2 start, 1 end/i)).toBeInTheDocument();
  });

  it("shows the error returned by the action", async () => {
    mockTriggerSessionRemindersAction.mockResolvedValue({
      error: "Failed to trigger session reminders",
    });

    render(<TriggerSessionRemindersButton />);

    await userEvent.click(screen.getByRole("button", { name: /run reminder cron/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to trigger session reminders/i)).toBeInTheDocument();
    });
  });
});