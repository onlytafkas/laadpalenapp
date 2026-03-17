"use client";

import { useState, useMemo } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { updateSession } from "@/app/dashboard/actions";

interface EditSessionDialogProps {
  session: {
    id: number;
    stationId: string;
    startTime: Date;
    endTime: Date | null;
  };
  disabled?: boolean;
}

export function EditSessionDialog({ session, disabled = false }: EditSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [stationId, setStationId] = useState(session.stationId);
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(session.startTime));
  const [endDate, setEndDate] = useState<Date | undefined>(session.endTime ? new Date(session.endTime) : undefined);

  // Real-time validation (only after user interaction)
  const validationError = useMemo(() => {
    if (!hasUserInteracted) return null;
    
    const now = new Date();
    
    if (startDate && startDate < now) {
      return "Start date cannot be in the past";
    }
    
    if (endDate) {
      if (endDate < now) {
        return "End date cannot be in the past";
      }
      if (startDate && endDate <= startDate) {
        return "End date must be after start date";
      }
    }
    
    return null;
  }, [startDate, endDate, hasUserInteracted]);

  const error = serverError || validationError;

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Reset form to current session values when opening
      setStationId(session.stationId);
      setStartDate(new Date(session.startTime));
      setEndDate(session.endTime ? new Date(session.endTime) : undefined);
      setServerError(null);
      setHasUserInteracted(false);
    }
  };

  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    setHasUserInteracted(true);
  };

  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
    setHasUserInteracted(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setServerError(null);

    if (!startDate) {
      setServerError("Please select a start date and time");
      setLoading(false);
      return;
    }

    // If there's already a validation error, don't submit
    if (validationError) {
      setLoading(false);
      return;
    }

    const result = await updateSession({
      id: session.id,
      stationId,
      startTime: startDate.toISOString(),
      endTime: endDate?.toISOString(),
    });

    if (result.error) {
      setServerError(result.error);
      setLoading(false);
    } else {
      // Success - close dialog
      setOpen(false);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Charging Session</DialogTitle>
          <DialogDescription>
            Update the end time of your charging session.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-stationId">Station ID</Label>
            <Input
              id="edit-stationId"
              placeholder="e.g., STATION-001"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              required
              disabled={true}
              className="cursor-not-allowed opacity-60"
            />
          </div>
          <div className="space-y-2">
            <Label>Start Time</Label>
            <DateTimePicker
              date={startDate}
              setDate={handleStartDateChange}
              disabled={true}
            />
          </div>
          <div className="space-y-2">
            <Label>End Time (optional)</Label>
            <DateTimePicker
              date={endDate}
              setDate={handleEndDateChange}
              disabled={loading}
            />
            <p className="text-xs text-zinc-500">Leave empty for active session</p>
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500"
              disabled={loading || error !== null}
            >
              {loading ? "Updating..." : "Update Session"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
