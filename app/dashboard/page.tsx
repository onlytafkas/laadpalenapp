import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Zap, BarChart3, MapPin, Activity, Clock } from "lucide-react";
import { getUserLoadingSessions } from "@/data/loading-sessions";
import { CreateSessionDialog } from "@/components/create-session-dialog";
import { EditSessionDialog } from "@/components/edit-session-dialog";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { StationTimeline } from "@/components/station-timeline";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const sessions = await getUserLoadingSessions(userId);
  const now = new Date();
  const completedSessions = sessions.filter((s) => s.endTime && new Date(s.endTime) <= now);
  const activeSessions = sessions.filter((s) => new Date(s.startTime) <= now && (!s.endTime || new Date(s.endTime) > now));
  const futureSessions = sessions.filter((s) => new Date(s.startTime) > now);

  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Header */}
        <div className="mb-12 flex items-start justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">
              Dashboard
            </h1>
            <p className="text-lg text-zinc-400">
              Monitor and manage your charging stations
            </p>
          </div>
          <CreateSessionDialog />
        </div>

        {/* Stats Grid */}
        <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Zap className="h-4 w-4" />
              Total Sessions
            </div>
            <div className="text-3xl font-bold text-white">{sessions.length}</div>
            <p className="mt-1 text-sm text-zinc-400">All time</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Activity className="h-4 w-4" />
              Active Sessions
            </div>
            <div className="text-3xl font-bold text-white">{activeSessions.length}</div>
            <p className="mt-1 text-sm text-emerald-400">Currently charging</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <MapPin className="h-4 w-4" />
              Completed
            </div>
            <div className="text-3xl font-bold text-white">{completedSessions.length}</div>
            <p className="mt-1 text-sm text-zinc-400">Sessions finished</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <BarChart3 className="h-4 w-4" />
              Unique Stations
            </div>
            <div className="text-3xl font-bold text-white">
              {new Set(sessions.map((s) => s.stationId)).size}
            </div>
            <p className="mt-1 text-sm text-zinc-400">Different locations</p>
          </div>
        </div>

        {/* Station Timeline Visualization */}
        {sessions.length > 0 && (
          <div className="mb-12">
            <StationTimeline sessions={sessions} />
          </div>
        )}

        {/* Main Content Area */}
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur">
            <div className="text-center py-12">
              <p className="text-zinc-400 text-lg">
                No charging sessions yet. Click &ldquo;Reserve Session&rdquo; to begin your first charging session.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Completed Sessions Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-semibold text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-zinc-400" />
                Completed Sessions
              </h2>
              
              {completedSessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-zinc-500">No completed sessions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedSessions.map((session) => {
                    return (
                    <div
                      key={session.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-colors hover:border-zinc-700"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-zinc-800 p-1.5">
                            <Clock className="h-4 w-4 text-zinc-400" />
                          </div>
                          <div className="font-medium text-white">
                            {session.stationId}
                          </div>
                        </div>
                        <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                          Completed
                        </span>
                      </div>
                      <div className="ml-8 space-y-1 text-sm">
                        <div className="text-zinc-400">
                          Started: {new Date(session.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        {session.endTime && (
                          <div className="text-zinc-500">
                            Ended: {new Date(session.endTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Sessions Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-semibold text-white flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-400" />
                Active Sessions
              </h2>
              
              {activeSessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-zinc-500">No active sessions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeSessions.map((session) => {
                    return (
                    <div
                      key={session.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-colors hover:border-zinc-700"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-emerald-500/10 p-1.5">
                            <Zap className="h-4 w-4 text-emerald-400" />
                          </div>
                          <div className="font-medium text-white">
                            {session.stationId}
                          </div>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          Active
                        </span>
                      </div>
                      <div className="ml-8 text-sm text-zinc-400 mb-3">
                        Started: {new Date(session.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      <div className="ml-8 flex gap-2">
                        <EditSessionDialog session={session} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Future Sessions Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-semibold text-white flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-400" />
                Future Sessions
              </h2>
              
              {futureSessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-zinc-500">No future sessions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {futureSessions.map((session) => {
                    const isStartInPast = new Date(session.startTime) < new Date();
                    return (
                    <div
                      key={session.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 transition-colors hover:border-zinc-700"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-blue-500/10 p-1.5">
                            <MapPin className="h-4 w-4 text-blue-400" />
                          </div>
                          <div className="font-medium text-white">
                            {session.stationId}
                          </div>
                        </div>
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                          Scheduled
                        </span>
                      </div>
                      <div className="ml-8 space-y-1 text-sm mb-3">
                        <div className="text-zinc-400">
                          Starts: {new Date(session.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                        {session.endTime && (
                          <div className="text-zinc-500">
                            Ends: {new Date(session.endTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        )}
                      </div>
                      <div className="ml-8 flex gap-2">
                        <EditSessionDialog session={session} disabled={isStartInPast} />
                        <DeleteSessionDialog session={session} disabled={isStartInPast} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
