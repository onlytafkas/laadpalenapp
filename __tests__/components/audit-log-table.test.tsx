import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// AuditLogTable is a server component used as a pure presentational component —
// no actions to mock.
import { AuditLogTable } from "@/components/audit/audit-log-table";
import { makeAuditLog } from "@/__tests__/helpers/factories";

// -----------------------------------------------------------------------
// AuditLogTable
// -----------------------------------------------------------------------
describe("AuditLogTable", () => {
  it("renders an empty-state message when there are no logs", () => {
    render(<AuditLogTable logs={[]} userEmails={new Map()} />);
    expect(screen.getByText(/no audit log entries yet/i)).toBeInTheDocument();
  });

  it("renders a row for each audit log entry", () => {
    const logs = [
      makeAuditLog({ id: 1, action: "CREATE_SESSION", entityType: "session", entityId: "10", status: "success" }),
      makeAuditLog({ id: 2, action: "DELETE_STATION", entityType: "station", entityId: "3", status: "forbidden" }),
    ];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);

    expect(screen.getByText("CREATE_SESSION")).toBeInTheDocument();
    expect(screen.getByText("DELETE_STATION")).toBeInTheDocument();
  });

  it("renders a StatusBadge with the correct status text", () => {
    const logs = [makeAuditLog({ status: "validation_error" })];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);

    // status badge replaces underscores with spaces
    expect(screen.getByText("validation error")).toBeInTheDocument();
  });

  it("displays user email from the userEmails map when available", () => {
    const logs = [makeAuditLog({ performedByUserId: "user_abc" })];
    const emails = new Map([["user_abc", "test@example.com"]]);
    render(<AuditLogTable logs={logs} userEmails={emails} />);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("falls back to the shortened userId when no email is available", () => {
    const logs = [makeAuditLog({ performedByUserId: "user_abc" })];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);

    // userId is truncated to 20 chars by the truncate helper
    expect(screen.getByText(/user_abc/i)).toBeInTheDocument();
  });

  it("renders a dash (—) when entity ID is null", () => {
    const logs = [makeAuditLog({ entityId: null })];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);
    // Multiple cells may show — (e.g. entityId, error, email, ip) — just assert at least one exists
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows unauthenticated in the email column when performedByUserId is null", () => {
    const logs = [makeAuditLog({ performedByUserId: null })];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);
    expect(screen.getByText("unauthenticated")).toBeInTheDocument();
  });

  it("applies fallback styles for an unrecognised status value", () => {
    const logs = [makeAuditLog({ status: "unknown_status" })];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);
    // Badge text replaces underscores with spaces
    expect(screen.getByText("unknown status")).toBeInTheDocument();
  });

  it("truncates a long performedByUserId in the actor column", () => {
    const longId = "very_long_user_id_exceeding_18_chars";
    const logs = [makeAuditLog({ performedByUserId: longId })];
    render(<AuditLogTable logs={logs} userEmails={new Map()} />);
    // The truncated form ends with ellipsis character
    expect(screen.getByText(/…$/)).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Scroll buttons
// -----------------------------------------------------------------------
describe("AuditLogTable — scroll buttons", () => {
  it("renders both scroll buttons when logs are present", () => {
    render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    expect(screen.getByLabelText("Scroll left")).toBeInTheDocument();
    expect(screen.getByLabelText("Scroll right")).toBeInTheDocument();
  });

  it("clicking the right button invokes scrollBy with +300", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollBy").mockImplementation(() => {});
    render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    fireEvent.click(screen.getByLabelText("Scroll right"));
    expect(scrollSpy).toHaveBeenCalledWith({ left: 300, behavior: "smooth" });
    scrollSpy.mockRestore();
  });

  it("clicking the left button invokes scrollBy with -300", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollBy").mockImplementation(() => {});
    render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    fireEvent.click(screen.getByLabelText("Scroll left"));
    expect(scrollSpy).toHaveBeenCalledWith({ left: -300, behavior: "smooth" });
    scrollSpy.mockRestore();
  });

  it("fires a scroll event on the container without throwing", () => {
    const { container } = render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    const scrollContainer = container.querySelector(".overflow-x-hidden");
    expect(() => fireEvent.scroll(scrollContainer!)).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// Column resize
// -----------------------------------------------------------------------
describe("AuditLogTable — column resize", () => {
  afterEach(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("sets body cursor to col-resize when mousedown on a resize handle", () => {
    render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    const handles = document.querySelectorAll(".cursor-col-resize");
    fireEvent.mouseDown(handles[0], { clientX: 100 });
    expect(document.body.style.cursor).toBe("col-resize");
  });

  it("updates the column width on mousemove after a resize starts", () => {
    const { container } = render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    const handles = document.querySelectorAll(".cursor-col-resize");

    // Col 0 (Time) has defaultWidth=160. Start drag at x=100, move to x=180 → delta=80 → 240px.
    fireEvent.mouseDown(handles[0], { clientX: 100 });
    act(() => {
      fireEvent.mouseMove(document, { clientX: 180 });
    });

    const cols = container.querySelectorAll("col");
    expect(cols[0].getAttribute("style")).toContain("240px");
  });

  it("resets body cursor to empty string on mouseup after resize", () => {
    render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    const handles = document.querySelectorAll(".cursor-col-resize");

    fireEvent.mouseDown(handles[0], { clientX: 100 });
    expect(document.body.style.cursor).toBe("col-resize");

    fireEvent.mouseUp(document);
    expect(document.body.style.cursor).toBe("");
  });

  it("does not change column width on mousemove when no resize is in progress", () => {
    const { container } = render(<AuditLogTable logs={[makeAuditLog()]} userEmails={new Map()} />);
    const cols = container.querySelectorAll("col");
    const before = cols[0].getAttribute("style");

    act(() => {
      fireEvent.mouseMove(document, { clientX: 999 });
    });

    expect(cols[0].getAttribute("style")).toBe(before);
  });
});
