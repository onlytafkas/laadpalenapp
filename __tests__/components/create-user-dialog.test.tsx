import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockCreateUserAction } = vi.hoisted(() => ({ mockCreateUserAction: vi.fn() }));

vi.mock("@/app/dashboard/actions", () => ({
  createStationAction: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteStationAction: vi.fn(),
  updateStationAction: vi.fn(),
  createUserAction: mockCreateUserAction,
  updateUserAction: vi.fn(),
  deactivateUserAction: vi.fn(),
  activateUserAction: vi.fn(),
}));

import { CreateUserDialog } from "@/components/user/create-user-dialog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateUserDialog", () => {
  it("opens the dialog and shows the mobile number field", async () => {
    render(<CreateUserDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add user/i }));

    expect(screen.getByLabelText(/user id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/car number plate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
  });

  it("calls createUserAction with user id, car number plate, and mobile number", async () => {
    mockCreateUserAction.mockResolvedValue({ success: true });
    render(<CreateUserDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add user/i }));
    await userEvent.type(screen.getByLabelText(/user id/i), "user_xyz");
    await userEvent.type(screen.getByLabelText(/car number plate/i), "ABC-123");
    await userEvent.type(screen.getByLabelText(/mobile number/i), "+15551234567");
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(mockCreateUserAction).toHaveBeenCalledWith({
        userId: "user_xyz",
        carNumberPlate: "ABC-123",
        mobileNumber: "+15551234567",
      });
    });
  });

  it("renders an action error", async () => {
    mockCreateUserAction.mockResolvedValue({ error: "Mobile number is required" });
    render(<CreateUserDialog />);

    await userEvent.click(screen.getByRole("button", { name: /add user/i }));
    await userEvent.type(screen.getByLabelText(/user id/i), "user_xyz");
    await userEvent.type(screen.getByLabelText(/car number plate/i), "ABC-123");
    await userEvent.type(screen.getByLabelText(/mobile number/i), "+15551234567");
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText(/mobile number is required/i)).toBeInTheDocument();
    });
  });
});