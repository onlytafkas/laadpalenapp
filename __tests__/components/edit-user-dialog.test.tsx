import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockUpdateUserAction } = vi.hoisted(() => ({ mockUpdateUserAction: vi.fn() }));

vi.mock("@/app/dashboard/actions", () => ({
  createStationAction: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteStationAction: vi.fn(),
  updateStationAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: mockUpdateUserAction,
  deactivateUserAction: vi.fn(),
  activateUserAction: vi.fn(),
}));

import { EditUserDialog } from "@/components/user/edit-user-dialog";

beforeEach(() => {
  vi.clearAllMocks();
});

const user = {
  userId: "user_xyz",
  carNumberPlate: "ABC-123",
  mobileNumber: "+15551234567",
  isActive: true,
  isAdmin: false,
};

describe("EditUserDialog", () => {
  it("shows the mobile number field with the current value", async () => {
    render(<EditUserDialog user={user} />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByLabelText(/mobile number/i)).toHaveValue("+15551234567");
  });

  it("calls updateUserAction with the edited mobile number", async () => {
    mockUpdateUserAction.mockResolvedValue({ success: true });
    render(<EditUserDialog user={user} />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.clear(screen.getByLabelText(/mobile number/i));
    await userEvent.type(screen.getByLabelText(/mobile number/i), "+15557654321");
    await userEvent.click(screen.getByRole("button", { name: /update user/i }));

    await waitFor(() => {
      expect(mockUpdateUserAction).toHaveBeenCalledWith({
        userId: "user_xyz",
        carNumberPlate: "ABC-123",
        mobileNumber: "+15557654321",
        isActive: true,
        isAdmin: false,
      });
    });
  });

  it("closes the dialog when Cancel is clicked", async () => {
    render(<EditUserDialog user={user} />);

    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("heading", { name: /edit user/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /edit user/i })).not.toBeInTheDocument();
    });
  });
});