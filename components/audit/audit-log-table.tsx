"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAllAuditLogs } from "@/data/audit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditLog = Awaited<ReturnType<typeof getAllAuditLogs>>[number];

interface AuditLogTableProps {
  logs: AuditLog[];
  userEmails: Map<string, string>;
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    unauthorized: "bg-red-500/10 text-red-400 border-red-500/20",
    forbidden: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    not_found: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    validation_error: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
    confirmation_required: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  const cls = classes[status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function truncate(val: string | null | undefined, len = 20) {
  if (!val) return "—";
  return val.length > len ? `${val.slice(0, len)}…` : val;
}

export function AuditLogTable({ logs, userEmails }: AuditLogTableProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateScrollButtons());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollButtons]);

  const scrollBy = useCallback((amount: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400 text-lg">No audit log entries yet.</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-zinc-800">
      {/* Left arrow */}
      <button
        onClick={() => scrollBy(-300)}
        className={`absolute left-1 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 shadow-md hover:bg-zinc-700 transition-opacity ${!canScrollLeft ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Right arrow */}
      <button
        onClick={() => scrollBy(300)}
        className={`absolute right-1 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 shadow-md hover:bg-zinc-700 transition-opacity ${!canScrollRight ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        aria-label="Scroll right"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div
        ref={scrollContainerRef}
        onScroll={updateScrollButtons}
        className="overflow-x-hidden rounded-lg [&_[data-slot='table-container']]:overflow-x-visible"
      >
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400 w-40">Time</TableHead>
            <TableHead className="text-zinc-400">Action</TableHead>
            <TableHead className="text-zinc-400">Entity</TableHead>
            <TableHead className="text-zinc-400">Entity ID</TableHead>
            <TableHead className="text-zinc-400">Actor</TableHead>
            <TableHead className="text-zinc-400">Email</TableHead>
            <TableHead className="text-zinc-400">Status</TableHead>
            <TableHead className="text-zinc-400">Error</TableHead>
            <TableHead className="text-zinc-400 hidden lg:table-cell">IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow
              key={log.id}
              className="border-zinc-800 hover:bg-zinc-900/50"
            >
              <TableCell className="text-zinc-400 text-xs whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "medium",
                })}
              </TableCell>
              <TableCell className="font-mono text-xs text-zinc-300 whitespace-nowrap">
                {log.action}
              </TableCell>
              <TableCell className="text-zinc-400 capitalize text-sm">
                {log.entityType}
              </TableCell>
              <TableCell className="font-mono text-xs text-zinc-500">
                {log.entityId ?? "—"}
              </TableCell>
              <TableCell
                className="font-mono text-xs text-zinc-500"
                title={log.performedByUserId ?? "unauthenticated"}
              >
                {truncate(log.performedByUserId, 18)}
              </TableCell>
              <TableCell className="text-xs text-zinc-400">
                {log.performedByUserId
                  ? (userEmails.get(log.performedByUserId) ?? "—")
                  : "unauthenticated"}
              </TableCell>
              <TableCell>
                <StatusBadge status={log.status} />
              </TableCell>
              <TableCell
                className="text-xs text-zinc-500 max-w-48 truncate"
                title={log.errorMessage ?? ""}
              >
                {log.errorMessage ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-zinc-600 hidden lg:table-cell">
                {log.ipAddress ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </div>
  );
}
