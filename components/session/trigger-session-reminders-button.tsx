"use client";

import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { triggerSessionRemindersAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function TriggerSessionRemindersButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    setMessage(null);

    startTransition(() => {
      void (async () => {
        const result = await triggerSessionRemindersAction();

        if (result.error || !result.data) {
          setError(result.error ?? "Failed to trigger session reminders");
          return;
        }

        setMessage(
          `Triggered reminders: ${result.data.startReminders} start, ${result.data.endReminders} end.`
        );
      })();
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        className="gap-2 border-zinc-700 bg-zinc-900/50 text-zinc-100 hover:bg-zinc-800"
        onClick={handleClick}
        disabled={isPending}
      >
        <BellRing className="h-4 w-4" />
        {isPending ? "Running Reminder Cron..." : "Run Reminder Cron"}
      </Button>
      {(message || error) && (
        <p
          aria-live="polite"
          className={error ? "text-sm text-red-400" : "text-sm text-emerald-400"}
        >
          {error ?? message}
        </p>
      )}
    </div>
  );
}