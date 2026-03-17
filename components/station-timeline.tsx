"use client";

import { Clock } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";

type Session = {
  id: number;
  userId: string;
  stationId: string;
  startTime: Date;
  endTime: Date | null;
};

type StationTimelineProps = {
  sessions: Session[];
};

export function StationTimeline({ sessions }: StationTimelineProps) {
  const [now, setNow] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Initialize client-side time after mount to avoid hydration mismatch
  useEffect(() => {
    setNow(Date.now());
    setIsMounted(true);
    
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const timelineData = useMemo(() => {
    // Get unique stations
    const stations = Array.from(new Set(sessions.map((s) => s.stationId))).sort();
    
    if (stations.length === 0 || sessions.length === 0 || now === null) {
      return { stations: [], sessions: [], timeRange: { start: new Date(), end: new Date() }, duration: 0 };
    }

    // Show 3 days total (yesterday, today, tomorrow) but fit 12 hours on screen width
    const threeDaysMs = 72 * 60 * 60 * 1000; // 72 hours in milliseconds
    const timeStart = new Date(now - threeDaysMs / 2);
    const timeEnd = new Date(now + threeDaysMs / 2);
    const duration = timeEnd.getTime() - timeStart.getTime();

    return {
      stations,
      sessions,
      timeRange: { start: timeStart, end: timeEnd },
      duration,
    };
  }, [sessions, now]);

  const { stations, timeRange, duration } = timelineData;

  // Scroll to center current time
  useEffect(() => {
    if (scrollContainerRef.current && now !== null) {
      const container = scrollContainerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      
      // Calculate current time position as percentage of total duration
      const currentTimePosition = (now - timeRange.start.getTime()) / duration;
      
      // Calculate scroll position to center current time
      const scrollPosition = (scrollWidth * currentTimePosition) - (clientWidth / 2);
      container.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [sessions, now, timeRange, duration]);

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
          Station Timeline
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
        Station Timeline
      </h2>

      <div className="relative">
        <div className="flex">
          {/* Fixed left column for station names */}
          <div className="w-32 shrink-0">
            {/* Empty space for time markers */}
            <div className="h-8 mb-4" />
            {/* Station names */}
            <div className="space-y-4">
              {stations.map((stationId) => (
                <div key={stationId} className="h-12 flex items-center pt-3">
                  <div className="truncate text-sm font-medium text-white">
                    {stationId}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable content */}
          <div ref={scrollContainerRef} className="flex-1 overflow-x-auto">
            <div className="min-w-1200">
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
                {stations.map((stationId) => {
                  const stationSessions = sessions.filter(
                    (s) => s.stationId === stationId
                  );

                  return (
                    <div key={stationId} className="relative h-12 rounded-lg border border-zinc-800 bg-zinc-900/30">
                      {/* Current time indicator */}
                      {currentPosition >= 0 && currentPosition <= 100 && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-10"
                          style={{ left: `${currentPosition}%` }}
                        >
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400" />
                        </div>
                      )}
                      
                      {stationSessions.map((session) => {
                        const startPos = getPosition(session.startTime);
                        const width = getWidth(session.startTime, session.endTime);
                        const isActive =
                          session.startTime.getTime() <= now &&
                          (!session.endTime || session.endTime.getTime() > now);
                        const isFuture = session.startTime.getTime() > now;

                        return (
                          <div
                            key={session.id}
                            className={`absolute top-1 bottom-1 rounded transition-all hover:z-20 hover:scale-105 group cursor-pointer ${
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
                            title={`${session.stationId}: ${session.startTime.toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })} - ${
                              session.endTime
                                ? session.endTime.toLocaleString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })
                                : "Ongoing"
                            }`}
                          >
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30">
                              <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg whitespace-nowrap">
                                <div className="font-medium text-white mb-1">
                                  {session.stationId}
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
                      })}
                    </div>
                  );
                })}
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
            <div className="h-3 w-6 rounded bg-zinc-700/40 border border-zinc-600/30" />
            <span className="text-zinc-400">Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-emerald-400" />
            <span className="text-zinc-400">Current Time</span>
          </div>
        </div>
      </div>
    </div>
  );
}
