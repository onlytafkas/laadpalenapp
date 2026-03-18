"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteStationAction } from "@/app/dashboard/actions";

type Station = {
  id: number;
  name: string;
  description: string | null;
};

interface DeleteStationDialogProps {
  station: Station;
  disabled?: boolean;
}

export function DeleteStationDialog({ station, disabled }: DeleteStationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    const result = await deleteStationAction(station.id);

    if (result.error) {
      setError(result.error);
      setIsDeleting(false);
    } else {
      setOpen(false);
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>Delete Station</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this station? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="font-medium text-white mb-1">{station.name}</div>
            {station.description && (
              <div className="text-sm text-zinc-400">{station.description}</div>
            )}
          </div>
          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mt-4">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Station"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
