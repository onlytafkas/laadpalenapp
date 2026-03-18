import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
