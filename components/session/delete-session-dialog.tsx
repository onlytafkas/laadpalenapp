"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteSession } from "@/app/dashboard/actions";

interface DeleteSessionDialogProps {
  session: {
    id: number;
    stationId: number;
    startTime: Date;
    station: {
      id: number;
      name: string;
      description: string | null;
    };
  };
  disabled?: boolean;
}

export function DeleteSessionDialog({ session, disabled = false }: DeleteSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    const result = await deleteSession(session.id);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      // Success - close dialog
      setOpen(false);
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Charging Session</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this charging session? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="text-sm font-medium text-white">
              Station: {session.station.name}
            </div>
            <div className="text-sm text-zinc-400">
              Started: {new Date(session.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
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
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-500"
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete Session"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
