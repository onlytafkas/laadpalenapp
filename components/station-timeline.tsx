"use client";

import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { EditSessionDialog } from "@/components/edit-session-dialog";

type Station = {
  id: number;
  name: string;
  description: string | null;
};

type Session = {
  id: number;
  userId: string;
  stationId: number;
  startTime: Date;
  endTime: Date | null;
  station: Station;
};

type StationTimelineProps = {
  sessions: Session[];
  stations: Station[];
  userCarPlates: Map<string, string>;
  currentUserId: string;
  isAdmin?: boolean;
};

export function StationTimeline({ sessions, stations, userCarPlates, currentUserId, isAdmin = false }: StationTimelineProps) {
  const [now, setNow] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Re-check scroll button state after layout changes
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

  // Initialize client-side time after mount to avoid hydration mismatch
  useEffect(() => {
    setNow(Date.now());
    setIsMounted(true);
    
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 10000); // Update every 10 seconds for more responsive state changes

    return () => clearInterval(interval);
  }, []);

  const timelineData = useMemo(() => {
    // Get unique station names
    const stationNames = Array.from(new Set(sessions.map((s) => s.station.name))).sort();
    
    if (stationNames.length === 0 || sessions.length === 0 || now === null) {
      return { stationNames: [], sessions: [], timeRange: { start: new Date(), end: new Date() }, duration: 0, latestCompletedSessionId: null };
    }

    // Find the latest completed session
    const completedSessions = sessions.filter(s => s.endTime && new Date(s.endTime).getTime() <= now);
    const latestCompleted = completedSessions.length > 0
      ? completedSessions.reduce((latest, current) => 
          new Date(current.endTime!).getTime() > new Date(latest.endTime!).getTime() ? current : latest
        )
      : null;

    // Show 3 days total (yesterday, today, tomorrow) but fit 12 hours on screen width
    const threeDaysMs = 72 * 60 * 60 * 1000; // 72 hours in milliseconds
    const timeStart = new Date(now - threeDaysMs / 2);
    const timeEnd = new Date(now + threeDaysMs / 2);
    const duration = timeEnd.getTime() - timeStart.getTime();

    return {
      stationNames,
      sessions,
      timeRange: { start: timeStart, end: timeEnd },
      duration,
      latestCompletedSessionId: latestCompleted?.id || null,
    };
  }, [sessions, now]);

  const { stationNames, timeRange, duration, latestCompletedSessionId } = timelineData;

  // Scroll to center current time — only once on initial mount
  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (scrollContainerRef.current && now !== null) {
      const container = scrollContainerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      
      const currentTimePosition = (now - timeRange.start.getTime()) / duration;
      const scrollPosition = (scrollWidth * currentTimePosition) - (clientWidth / 2);
      container.scrollLeft = Math.max(0, scrollPosition);
      updateScrollButtons();
      hasScrolledRef.current = true;
    }
  }, [sessions, now, timeRange, duration, updateScrollButtons]);

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers = [];
    // Start from the first 3-hour interval after timeRange.start
    const firstHour = new Date(timeRange.start);
    firstHour.setMinutes(0, 0, 0);
    // Round up to next 3-hour interval (0, 3, 6, 9, 12, 15, 18, 21)
    const currentHourNum = firstHour.getHours();
    const nextInterval = Math.ceil((currentHourNum + 1) / 3) * 3;
    firstHour.setHours(nextInterval);
    
    let currentHour = firstHour;
    while (currentHour <= timeRange.end) {
      const position = ((currentHour.getTime() - timeRange.start.getTime()) / duration) * 100;
      if (position >= 0 && position <= 100) {
        markers.push({
          position,
          label: currentHour.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
        });
      }
      currentHour = new Date(currentHour.getTime() + 3 * 60 * 60 * 1000); // Add 3 hours
    }
    return markers;
  }, [timeRange, duration]);

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur">
        <div className="text-center py-12">
          <p className="text-zinc-400 text-lg">
            No sessions to display in timeline
          </p>
        </div>
      </div>
    );
  }

  const getPosition = (time: Date) => {
    const offset = time.getTime() - timeRange.start.getTime();
    return (offset / duration) * 100;
  };

  const getWidth = (startTime: Date, endTime: Date | null) => {
    if (now === null) return 0;
    const end = endTime ? endTime.getTime() : now;
    const width = ((end - startTime.getTime()) / duration) * 100;
    return Math.max(width, 0.5); // Minimum width for visibility
  };

  // Show loading state until client-side hydration is complete
  if (!isMounted || now === null) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
        <h2 className="mb-6 text-xl font-semibold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-zinc-400" />
          Station Occupation
        </h2>
        <div className="text-center py-12">
          <p className="text-zinc-400 text-lg">Loading timeline...</p>
        </div>
      </div>
    );
  }

  const currentPosition = getPosition(new Date(now));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur">
      <h2 className="mb-6 text-xl font-semibold text-white flex items-center gap-2">
        <Clock className="h-5 w-5 text-zinc-400" />
        Station Occupation
      </h2>

      <div className="relative">
        <div className="flex">
          {/* Fixed left column for station names */}
          <div className="w-32 shrink-0">
            {/* Empty space for time markers */}
            <div className="h-8 mb-4" />
            {/* Station names */}
            <div className="space-y-4">
              {stationNames.map((stationName) => {
                const station = stations.find((s) => s.name === stationName);
                return (
                  <div key={stationName} className="h-12 flex items-center pt-3">
                    <div 
                      className="truncate text-sm font-medium text-white cursor-help"
                      title={station?.description || stationName}
                    >
                      {stationName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="relative flex-1 min-w-0">
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
              className="overflow-x-hidden"
            >
            <div className="relative min-w-1200">
              {/* Single current time indicator spanning all rows including time markers */}
              {currentPosition >= 0 && currentPosition <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-10 pointer-events-none"
                  style={{ left: `${currentPosition}%` }}
                />
              )}

              {/* Time markers */}
              <div className="relative h-8 border-b border-zinc-800 mb-4">
                {timeMarkers.map((marker, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 text-xs text-zinc-500 whitespace-nowrap"
                    style={{ left: `${marker.position}%`, transform: "translateX(-50%)" }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>

              {/* Timeline rows */}
              <div className="space-y-4">
                {stationNames.map((stationName) => {
                  const stationSessions = sessions.filter(
                    (s) => s.station.name === stationName
                  );

                  return (
                    <div key={stationName} className="relative h-12 rounded-lg border border-zinc-800 bg-zinc-900/30">
                      
                      {stationSessions.map((session) => {
                        const startPos = getPosition(session.startTime);
                        const width = getWidth(session.startTime, session.endTime);
                        const isActive =
                          session.startTime.getTime() <= now &&
                          (!session.endTime || session.endTime.getTime() > now);
                        const isOwnSession = session.userId === currentUserId;
                        const isFuture = session.startTime.getTime() > now;
                        const isStartInPast = new Date(session.startTime) < new Date();
                        const isLatestCompleted = session.id === latestCompletedSessionId;
                        const carPlate = userCarPlates.get(session.userId);
                        
                        // Show car plate badge: on active/future always; on completed only for the latest one
                        const showCarPlate = carPlate && (isActive || isFuture || isLatestCompleted) && (isAdmin || isOwnSession);

                        // Other users' sessions (non-admin): coloured block with hover tooltip but no car plate
                        if (!isOwnSession && !isAdmin) {
                          const otherClass = isActive
                            ? "bg-emerald-500/80 border border-emerald-400/50 opacity-60"
                            : isFuture
                            ? "bg-blue-500/80 border border-blue-400/50 opacity-60"
                            : "bg-zinc-700/50 border border-zinc-600/40 opacity-60";
                          return (
                            <div
                              key={session.id}
                              className={`absolute top-1 bottom-1 rounded cursor-default group ${otherClass}`}
                              style={{ left: `${startPos}%`, width: `${width}%` }}
                            >
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg whitespace-nowrap">
                                  <div className="font-medium text-white mb-1">
                                    {session.station.name}
                                  </div>
                                  <div className="text-zinc-400">
                                    Start: {session.startTime.toLocaleString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false,
                                    })}
                                  </div>
                                  {session.endTime ? (
                                    <div className="text-zinc-400">
                                      End: {session.endTime.toLocaleString(undefined, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: false,
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-emerald-400">Ongoing</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const handleClick = () => {
                          // Only allow editing if session start is not in the past
                          if (!isStartInPast) {
                            setSelectedSession(session);
                          }
                        };

                        return (
                          <div
                            key={session.id}
                            onClick={handleClick}
                            className={`absolute top-1 bottom-1 rounded transition-all hover:z-20 hover:scale-105 group ${
                              isStartInPast ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                            } ${
                              isActive
                                ? "bg-emerald-500/80 border border-emerald-400/50"
                                : isFuture
                                ? "bg-blue-500/80 border border-blue-400/50"
                                : "bg-zinc-700/40 border border-zinc-600/30"
                            }`}
                            style={{
                              left: `${startPos}%`,
                              width: `${width}%`,
                            }}
                          >
                            {/* Display car plate badge for active, future, and latest completed session */}
                            {showCarPlate && (
                              <div className="absolute inset-0 flex items-center justify-center px-1">
                                <span className="text-xs font-medium text-white bg-black/30 px-1.5 py-0.5 rounded truncate max-w-full">
                                  {carPlate}
                                </span>
                              </div>
                            )}
                            
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg whitespace-nowrap">
                                <div className="font-medium text-white mb-1">
                                  {session.station.name}
                                </div>
                                {carPlate && (
                                  <div className="text-blue-400 mb-1">
                                    Car: {carPlate}
                                  </div>
                                )}
                                <div className="text-zinc-400">
                                  Start: {session.startTime.toLocaleString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false,
                                  })}
                                </div>
                                {session.endTime ? (
                                  <div className="text-zinc-400">
                                    End: {session.endTime.toLocaleString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false,
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-emerald-400">Ongoing</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-6 rounded bg-emerald-500/80 border border-emerald-400/50" />
            <span className="text-zinc-400">Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-6 rounded bg-blue-500/80 border border-blue-400/50" />
            <span className="text-zinc-400">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-6 rounded bg-zinc-600 border border-zinc-500" />
            <span className="text-zinc-400">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-emerald-400" />
            <span className="text-zinc-400">Current Time</span>
          </div>
        </div>
      </div>

      {/* Edit Session Dialog */}
      {selectedSession && (
        <EditSessionDialog 
          session={selectedSession}
          stations={stations}
          open={!!selectedSession}
          onOpenChange={(open) => {
            if (!open) setSelectedSession(null);
          }}
          trigger={false}
        />
      )}
    </div>
  );
}
