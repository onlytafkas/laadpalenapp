"use client";

import { useState } from "react";
import { Ban, CheckCircle } from "lucide-react";
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
import { deactivateUserAction, activateUserAction } from "@/app/dashboard/actions";

interface User {
  userId: string;
  isActive: boolean;
}

interface ToggleUserStatusDialogProps {
  user: User;
  userEmail?: string;
}

export function ToggleUserStatusDialog({ user, userEmail }: ToggleUserStatusDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setIsSubmitting(true);
    setError(null);

    const result = user.isActive 
      ? await deactivateUserAction(user.userId)
      : await activateUserAction(user.userId);

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
    } else {
      setOpen(false);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className={user.isActive ? "text-orange-400 hover:text-orange-300" : "text-emerald-400 hover:text-emerald-300"}
        >
          {user.isActive ? (
            <Ban className="h-3 w-3" />
          ) : (
            <CheckCircle className="h-3 w-3" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>
            {user.isActive ? "Deactivate" : "Activate"} User
          </DialogTitle>
          <DialogDescription>
            {user.isActive 
              ? "Are you sure you want to deactivate this user? They will not be able to create new sessions."
              : "Are you sure you want to activate this user? They will be able to create new sessions."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
            <div className="text-sm font-medium text-white mb-1">{userEmail || 'No email available'}</div>
            <div className="text-xs text-zinc-400">User ID: {user.userId}</div>
          </div>
          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mt-3">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleToggle}
            disabled={isSubmitting}
            className={user.isActive ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700"}
          >
            {isSubmitting ? "Processing..." : user.isActive ? "Deactivate" : "Activate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
