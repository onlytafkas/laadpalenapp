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
import { updateSession } from "@/app/dashboard/actions";

type Station = {
  id: number;
  name: string;
  description: string | null;
};

interface EditSessionDialogProps {
  session: {
    id: number;
    stationId: number;
    startTime: Date;
    endTime: Date | null;
    station: Station;
  };
  stations: Station[];
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean; // If true, show the trigger button; if false, controlled externally
}

export function EditSessionDialog({ 
  session,
  stations,
  disabled = false,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  trigger = true
}: EditSessionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingAdjustment, setPendingAdjustment] = useState<{
    adjustedStartTime: string;
    adjustedEndTime: string;
    message: string;
  } | null>(null);

  // Use external control if provided, otherwise use internal state
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;

  const [stationId, setStationId] = useState(session.stationId);
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(session.startTime));
  
  // Calculate initial duration from session
  const initialDuration = useMemo(() => {
    if (!session.endTime) return "60";
    const start = new Date(session.startTime).getTime();
    const end = new Date(session.endTime).getTime();
    const minutes = Math.round((end - start) / (1000 * 60));
    // Map to closest preset
    if (minutes <= 30) return "30";
    if (minutes <= 60) return "60";
    if (minutes <= 120) return "120";
    return "180";
  }, [session.startTime, session.endTime]);
  
  const [duration, setDuration] = useState<string>(initialDuration);

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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      setStationId(session.stationId);
      setStartDate(new Date(session.startTime));
      
      const start = new Date(session.startTime).getTime();
      const end = session.endTime ? new Date(session.endTime).getTime() : new Date().getTime();
      const minutes = Math.round((end - start) / (1000 * 60));
      if (minutes <= 30) setDuration("30");
      else if (minutes <= 60) setDuration("60");
      else if (minutes <= 120) setDuration("120");
      else setDuration("180");
      
      setServerError(null);
      setPendingAdjustment(null);
      setHasUserInteracted(false);
    }
  };

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

    // If there's already a validation error, don't submit
    if (validationError) {
      setLoading(false);
      return;
    }

    const result = await updateSession({
      id: session.id,
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
      setOpen(false);
      setLoading(false);
    }
  };

  const handleConfirmAdjustment = async () => {
    if (!pendingAdjustment) return;
    setLoading(true);
    const adj = pendingAdjustment;
    setPendingAdjustment(null);

    const result = await updateSession({
      id: session.id,
      stationId,
      startTime: adj.adjustedStartTime,
      endTime: adj.adjustedEndTime,
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
      setOpen(false);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && (
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
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Charging Session</DialogTitle>
          <DialogDescription>
            Update the details of your charging session.
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
                {loading ? "Updating..." : "Confirm New Time"}
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-stationId">Station</Label>
            <Select
              value={stationId.toString()}
              onValueChange={(value) => setStationId(Number(value))}
              disabled={true}
            >
              <SelectTrigger id="edit-stationId" className="cursor-not-allowed opacity-60">
                <SelectValue />
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
              disabled={true}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-duration">Duration</Label>
            <Select
              value={duration}
              onValueChange={handleDurationChange}
              disabled={loading}
            >
              <SelectTrigger id="edit-duration">
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
              {loading ? "Updating..." : "Update Session"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
