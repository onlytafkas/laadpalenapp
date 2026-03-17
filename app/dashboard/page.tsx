import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Zap, BarChart3, MapPin, Activity, Clock, Building2, Users } from "lucide-react";
import { getUserLoadingSessions, getAllLoadingSessions } from "@/data/loading-sessions";
import { getAllStations } from "@/data/stations";
import { getAllUsers, getUserInfo } from "@/data/usersinfo";
import { clerkClient } from "@clerk/nextjs/server";
import { CreateSessionDialog } from "@/components/create-session-dialog";
import { EditSessionDialog } from "@/components/edit-session-dialog";
import { DeleteSessionDialog } from "@/components/delete-session-dialog";
import { CreateStationDialog } from "@/components/create-station-dialog";
import { EditStationDialog } from "@/components/edit-station-dialog";
import { DeleteStationDialog } from "@/components/delete-station-dialog";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { EditUserDialog } from "@/components/edit-user-dialog";
import { ToggleUserStatusDialog } from "@/components/toggle-user-status-dialog";
import { StationTimeline } from "@/components/station-timeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoRefresh } from "@/components/auto-refresh";

// Force dynamic rendering and refresh data every minute
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const [sessions, stations, currentUserInfo] = await Promise.all([
    getUserLoadingSessions(userId),
    getAllStations(),
    getUserInfo(userId),
  ]);

  const isAdmin = currentUserInfo?.isAdmin ?? false;

  let users: Awaited<ReturnType<typeof getAllUsers>> = [];

  // All users need allSessions for the timeline (other users' blocks show as anonymous for non-admins)
  const allSessionsPromise = getAllLoadingSessions();
  const adminDataPromise = isAdmin ? getAllUsers() : Promise.resolve([]);

  const [allSessions, adminUsers] = await Promise.all([allSessionsPromise, adminDataPromise]);

  if (isAdmin) {
    users = adminUsers;
  }
  
  // Fetch Clerk user emails and car plates
  const userEmails = new Map<string, string>();
  const userCarPlates = new Map<string, string>();

  if (isAdmin) {
    const clerk = await clerkClient();
    for (const user of users) {
      try {
        const clerkUser = await clerk.users.getUser(user.userId);
        const email = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress 
                      || clerkUser.emailAddresses[0]?.emailAddress 
                      || 'No email';
        userEmails.set(user.userId, email);
        userCarPlates.set(user.userId, user.carNumberPlate);
      } catch (error) {
        console.error(`Failed to fetch email for user ${user.userId}:`, error);
        userEmails.set(user.userId, 'Email not found');
        userCarPlates.set(user.userId, user.carNumberPlate);
      }
    }
  } else if (currentUserInfo) {
    userCarPlates.set(userId, currentUserInfo.carNumberPlate);
  }
  const now = new Date();
  // Admin sees stats and sessions for all users; regular users see only their own
  const displaySessions = isAdmin ? allSessions : sessions;
  const completedSessions = displaySessions.filter((s) => s.endTime && new Date(s.endTime) <= now);
  const activeSessions = displaySessions.filter((s) => new Date(s.startTime) <= now && (!s.endTime || new Date(s.endTime) > now));
  const futureSessions = displaySessions.filter((s) => new Date(s.startTime) > now);

  // Stats cards always show data for all users
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const allTodaySessions = allSessions.filter((s) => new Date(s.startTime) >= todayStart && new Date(s.startTime) < todayEnd);
  const allActiveSessions = allSessions.filter((s) => new Date(s.startTime) <= now && (!s.endTime || new Date(s.endTime) > now));
  const allCompletedSessions = allSessions.filter((s) => s.endTime && new Date(s.endTime) <= now && new Date(s.endTime) >= todayStart);
  const allUniqueStations = new Set(allSessions.map((s) => s.station.name)).size;
  
  // Find the latest completed session
  const latestCompletedSession = completedSessions.length > 0
    ? completedSessions.reduce((latest, current) => 
        new Date(current.endTime!).getTime() > new Date(latest.endTime!).getTime() ? current : latest
      )
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      {/* Auto-refresh component to reload data every minute */}
      <AutoRefresh intervalMs={60000} />
      
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
          <CreateSessionDialog stations={stations} hasUserInfo={!!currentUserInfo} />
        </div>

        {/* Stats Grid */}
        <div className="mb-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Zap className="h-4 w-4" />
              Total Sessions
            </div>
            <div className="text-3xl font-bold text-white">{allTodaySessions.length}</div>
            <p className="mt-1 text-sm text-zinc-400">Today</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Activity className="h-4 w-4" />
              Active Sessions
            </div>
            <div className="text-3xl font-bold text-white">{allActiveSessions.length}</div>
            <p className="mt-1 text-sm text-emerald-400">Currently charging</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <MapPin className="h-4 w-4" />
              Completed
            </div>
            <div className="text-3xl font-bold text-white">{allCompletedSessions.length}</div>
            <p className="mt-1 text-sm text-zinc-400">Finished today</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <BarChart3 className="h-4 w-4" />
              Unique Stations
            </div>
            <div className="text-3xl font-bold text-white">
              {allUniqueStations}
            </div>
            <p className="mt-1 text-sm text-zinc-400">Different locations</p>
          </div>
        </div>

        {/* Tabs for Timeline and Sessions */}
        {!isAdmin && displaySessions.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur">
            <div className="text-center py-12">
              <p className="text-zinc-400 text-lg">
                No charging sessions yet. Click &ldquo;Reserve Session&rdquo; to begin your first charging session.
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="mb-8">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              {isAdmin && <TabsTrigger value="stations">Stations</TabsTrigger>}
              {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
            </TabsList>
            
            <TabsContent value="timeline" className="mt-0">
              <StationTimeline sessions={allSessions} stations={stations} userCarPlates={userCarPlates} currentUserId={userId} isAdmin={isAdmin} />
            </TabsContent>
            
            <TabsContent value="sessions" className="mt-0">
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
                    const carPlate = userCarPlates.get(session.userId);
                    const isLatest = latestCompletedSession?.id === session.id;
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
                            {session.station.name}
                          </div>
                          {carPlate && isLatest && (
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                              {carPlate}
                            </span>
                          )}
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
                    const carPlate = userCarPlates.get(session.userId);
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
                            {session.station.name}
                          </div>
                          {carPlate && (
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                              {carPlate}
                            </span>
                          )}
                        </div>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          Active
                        </span>
                      </div>
                      <div className="ml-8 text-sm text-zinc-400 mb-3">
                        Started: {new Date(session.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      <div className="ml-8 flex gap-2">
                        <EditSessionDialog session={session} stations={stations} />
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
                    const carPlate = userCarPlates.get(session.userId);
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
                            {session.station.name}
                          </div>
                          {carPlate && (
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                              {carPlate}
                            </span>
                          )}
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
                        <EditSessionDialog session={session} stations={stations} disabled={isStartInPast} />
                        <DeleteSessionDialog session={session} disabled={isStartInPast} />
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
            </TabsContent>

            <TabsContent value="stations" className="mt-0">
              {isAdmin && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-zinc-400" />
                    Manage Stations
                  </h2>
                  <CreateStationDialog />
                </div>
                
                {stations.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-zinc-400 text-lg">
                      No stations available. Click &ldquo;Add Station&rdquo; to create your first charging station.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {stations.map((station) => {
                      const stationSessions = allSessions.filter((s) => s.stationId === station.id);
                      const hasSessions = stationSessions.length > 0;
                      
                      return (
                        <div
                          key={station.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 transition-colors hover:border-zinc-700"
                        >
                          <div className="mb-3">
                            <div className="font-medium text-white mb-1">
                              {station.name}
                            </div>
                            {station.description && (
                              <div className="text-sm text-zinc-400">
                                {station.description}
                              </div>
                            )}
                          </div>
                          <div className="mb-3 text-xs text-zinc-500">
                            {hasSessions ? (
                              <span className="text-emerald-400">
                                {stationSessions.length} reservation{stationSessions.length !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span>No reservations</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <EditStationDialog station={station} />
                            <DeleteStationDialog station={station} disabled={hasSessions} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="mt-0">
              {isAdmin && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-zinc-400" />
                    Manage Users
                  </h2>
                  <CreateUserDialog />
                </div>
                
                {users.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-zinc-400 text-lg">
                      No users available. Click &ldquo;Add User&rdquo; to create your first user.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {users
                      .sort((a, b) => {
                        const emailA = userEmails.get(a.userId) || '';
                        const emailB = userEmails.get(b.userId) || '';
                        return emailA.localeCompare(emailB);
                      })
                      .map((user) => {
                        const userSessions = allSessions.filter((s) => s.userId === user.userId);
                        const hasSessions = userSessions.length > 0;
                        const userEmail = userEmails.get(user.userId);
                        
                        return (
                          <div
                            key={user.userId}
                            className={`rounded-lg border bg-zinc-900/30 p-4 transition-colors hover:border-zinc-700 ${
                              user.isActive ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'
                            }`}
                          >
                            <div className="mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="font-medium text-white">
                                  {userEmail}
                                </div>
                                {!user.isActive && (
                                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-zinc-400">
                                {user.carNumberPlate}
                              </div>
                              <div className="text-xs text-zinc-500 mt-1">
                                ID: {user.userId}
                              </div>
                            </div>
                            <div className="mb-3 text-xs text-zinc-500">
                              {hasSessions ? (
                                <span className="text-emerald-400">
                                  {userSessions.length} session{userSessions.length !== 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span>No sessions</span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <EditUserDialog user={user} />
                              <ToggleUserStatusDialog user={user} userEmail={userEmail} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
