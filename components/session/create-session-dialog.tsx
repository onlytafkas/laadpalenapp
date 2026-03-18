"use client";

import { useState, useMemo } from "react";
import { Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { createSession } from "@/app/dashboard/actions";

type Station = {
  id: number;
  name: string;
  description: string | null;
};

type CreateSessionDialogProps = {
  stations: Station[];
  hasUserInfo: boolean;
  isUserActive: boolean;
};

export function CreateSessionDialog({ stations, hasUserInfo, isUserActive }: CreateSessionDialogProps) {
  // Helper function to get default start time (5 minutes from now)
  const getDefaultStartTime = () => {
    const fiveMinutesFromNow = new Date();
    fiveMinutesFromNow.setMinutes(fiveMinutesFromNow.getMinutes() + 5);
    return fiveMinutesFromNow;
  };

  const [open, setOpen] = useState(false);
  const [stationId, setStationId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(getDefaultStartTime());
  const [duration, setDuration] = useState<string>("60"); // Default to 1 hour (in minutes)
  const [loading, setLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingAdjustment, setPendingAdjustment] = useState<{
    adjustedStartTime: string;
    adjustedEndTime: string;
    message: string;
  } | null>(null);

  // Calculate end date based on start date and duration
  const endDate = useMemo(() => {
    if (!startDate || !duration) return undefined;
    const end = new Date(startDate.getTime());
    end.setMinutes(end.getMinutes() + parseInt(duration));
    return end;
  }, [startDate, duration]);

  // Real-time validation (only after user interaction)
  const validationError = useMemo(() => {
    if (!hasUserInteracted) return null;
    
    const now = new Date();
    
    if (startDate && startDate < now) {
      return "Start date cannot be in the past";
    }
    
    if (!endDate) {
      return "End time is required";
    }
    
    if (endDate < now) {
      return "End date cannot be in the past";
    }
    
    if (startDate && endDate <= startDate) {
      return "End date must be after start date";
    }
    
    return null;
  }, [startDate, endDate, hasUserInteracted]);

  const error = serverError || validationError;

  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    setHasUserInteracted(true);
    setServerError(null); // Clear server error when user modifies input
  };

  const handleDurationChange = (value: string) => {
    setDuration(value);
    setHasUserInteracted(true);
    setServerError(null); // Clear server error when user modifies input
  };

  const handleStationChange = (value: string) => {
    setStationId(Number(value));
    setServerError(null); // Clear server error when station is selected
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

    if (!endDate) {
      setServerError("Please select a duration");
      setLoading(false);
      return;
    }

    if (!stationId) {
      setServerError("Please select a station");
      setLoading(false);
      return;
    }

    // If there's already a validation error, don't submit
    if (validationError) {
      setLoading(false);
      return;
    }

    const result = await createSession({
      stationId,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    });

    if ('needsConfirmation' in result && result.needsConfirmation) {
      setPendingAdjustment({
        adjustedStartTime: result.adjustedStartTime,
        adjustedEndTime: result.adjustedEndTime,
        message: result.message,
      });
      setLoading(false);
    } else if (result.error) {
      setServerError(result.error);
      setLoading(false);
    } else {
      resetAndClose();
    }
  };

  const handleConfirmAdjustment = async () => {
    if (!pendingAdjustment || !stationId) return;
    setLoading(true);
    const adj = pendingAdjustment;
    setPendingAdjustment(null);

    const result = await createSession({
      stationId,
      startTime: adj.adjustedStartTime,
      endTime: adj.adjustedEndTime,
    });

    if ('needsConfirmation' in result && result.needsConfirmation) {
      // Race condition: another booking appeared — ask again
      setPendingAdjustment({
        adjustedStartTime: result.adjustedStartTime,
        adjustedEndTime: result.adjustedEndTime,
        message: result.message,
      });
      setLoading(false);
    } else if (result.error) {
      setServerError(result.error);
      setLoading(false);
    } else {
      resetAndClose();
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setStationId(null);
    setStartDate(getDefaultStartTime());
    setDuration("60");
    setLoading(false);
    setHasUserInteracted(false);
    setPendingAdjustment(null);
    setServerError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && (!hasUserInfo || !isUserActive)) return;
    setOpen(newOpen);
    if (!newOpen) {
      setServerError(null);
      setPendingAdjustment(null);
      setHasUserInteracted(false);
    } else {
      setStartDate(getDefaultStartTime());
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <span className={`relative group inline-block${(!hasUserInfo || !isUserActive) ? " cursor-not-allowed" : ""}`}>
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-500"
            disabled={!hasUserInfo || !isUserActive}
            tabIndex={(!hasUserInfo || !isUserActive) ? -1 : undefined}
          >
            <Zap className="h-4 w-4" />
            Reserve Session
          </Button>
          {!hasUserInfo && (
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
              Your account is not registered in the system. Please contact an administrator to add your user information.
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
            </div>
          )}
          {hasUserInfo && !isUserActive && (
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
              Your account has been deactivated. Please contact an administrator to restore access.
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
            </div>
          )}
        </span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserve Charging Session</DialogTitle>
          <DialogDescription>
            Select a station to reserve a new charging session.
          </DialogDescription>
        </DialogHeader>
        {pendingAdjustment ? (
          <div className="space-y-4">
            <p className="text-sm text-amber-400">{pendingAdjustment.message}</p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPendingAdjustment(null)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500"
                onClick={handleConfirmAdjustment}
                disabled={loading}
              >
                {loading ? "Reserving..." : "Confirm New Time"}
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stationId">Station</Label>
            <Select
              value={stationId?.toString() ?? ""}
              onValueChange={handleStationChange}
              disabled={loading}
            >
              <SelectTrigger id="stationId">
                <SelectValue placeholder="Select a station" />
              </SelectTrigger>
              <SelectContent>
                {stations.map((station) => (
                  <SelectItem key={station.id} value={station.id.toString()}>
                    {station.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start Time</Label>
            <DateTimePicker
              date={startDate}
              setDate={handleStartDateChange}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <Select
              value={duration}
              onValueChange={handleDurationChange}
              disabled={loading}
            >
              <SelectTrigger id="duration">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
                <SelectItem value="180">3 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <DateTimePicker
              date={endDate}
              setDate={() => {}} // Read-only, calculated from start date + duration
              disabled={true}
            />
            <p className="text-xs text-zinc-500">Calculated from start time + duration</p>
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
              {loading ? "Reserving..." : "Reserve Session"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
