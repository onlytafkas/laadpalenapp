import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// -----------------------------------------------------------------------
// Mock server action + next/navigation before importing component
// Use vi.hoisted so variables are available inside the vi.mock factory.
// -----------------------------------------------------------------------
const { mockCreateStationAction } = vi.hoisted(() => ({ mockCreateStationAction: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({
  createStationAction: mockCreateStationAction,
  // Other actions not used by this component
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteStationAction: vi.fn(),
  updateStationAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  deactivateUserAction: vi.fn(),
  activateUserAction: vi.fn(),
}));

import { CreateStationDialog } from "@/components/station/create-station-dialog";

beforeEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------
// CreateStationDialog
// -----------------------------------------------------------------------
describe("CreateStationDialog", () => {
  it("renders the trigger button", () => {
    render(<CreateStationDialog />);
    expect(screen.getByRole("button", { name: /add station/i })).toBeInTheDocument();
  });

  it("opens the dialog when the trigger button is clicked", async () => {
    render(<CreateStationDialog />);
    await userEvent.click(screen.getByRole("button", { name: /add station/i }));
    expect(screen.getByRole("heading", { name: /add new station/i })).toBeInTheDocument();
  });

  it("shows the station name and description fields after opening", async () => {
    render(<CreateStationDialog />);
    await userEvent.click(screen.getByRole("button", { name: /add station/i }));
    expect(screen.getByLabelText(/station name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("calls createStationAction with form values on submit", async () => {
    mockCreateStationAction.mockResolvedValue({ success: true });
    render(<CreateStationDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add station/i }));
    await userEvent.type(screen.getByLabelText(/station name/i), "Test Station");
    await userEvent.type(screen.getByLabelText(/description/i), "A fast charger");
    await userEvent.click(screen.getByRole("button", { name: /create station/i }));

    await waitFor(() => {
      expect(mockCreateStationAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test Station", description: "A fast charger" })
      );
    });
  });

  it("displays an error message when the action returns an error", async () => {
    mockCreateStationAction.mockResolvedValue({ error: "Station name already exists" });
    render(<CreateStationDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add station/i }));
    await userEvent.type(screen.getByLabelText(/station name/i), "Duplicate");

    // Click the submit button inside the dialog form
    const buttons = screen.getAllByRole("button");
    const submitButton = buttons.find((b) => b.getAttribute("type") === "submit");
    if (submitButton) await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/station name already exists/i)).toBeInTheDocument();
    });
  });

  it("closes and resets the form after a successful submission", async () => {
    mockCreateStationAction.mockResolvedValue({ success: true });
    render(<CreateStationDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add station/i }));
    await userEvent.type(screen.getByLabelText(/station name/i), "New Station");

    const buttons = screen.getAllByRole("button");
    const submitButton = buttons.find((b) => b.getAttribute("type") === "submit");
    if (submitButton) await userEvent.click(submitButton);

    await waitFor(() => {
      // Dialog should close — heading should no longer be visible
      expect(screen.queryByRole("heading", { name: /add new station/i })).not.toBeInTheDocument();
    });
  });

  it("closes the dialog when Cancel is clicked", async () => {
    render(<CreateStationDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add station/i }));
    expect(screen.getByRole("heading", { name: /add new station/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /add new station/i })).not.toBeInTheDocument();
    });
  });
});
