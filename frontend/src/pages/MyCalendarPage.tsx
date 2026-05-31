import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Topbar, Page } from '@/components/layout/AppLayout';
import { Pill } from '@/components/ui/pill';
import { Button } from '@/components/ui/button';
import { Calendar, Video, ClipboardList, ChevronLeft, ChevronRight, RefreshCw, Cloud, X } from 'lucide-react';
import { todayISO } from '@/lib/utils';

interface Event {
  id: string;
  kind: 'demo' | 'session' | 'google';
  title: string;
  date: string;
  timeIst: string;
  clientId?: string;
  clientName?: string;
  trainerId?: string;
  trainerName?: string;
  status?: string;
  outcome?: string | null;
  link?: string | null;
  htmlLink?: string;
  source?: 'mits' | 'google';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d: Date): string {
  // Build YYYY-MM-DD from LOCAL date parts. toISOString() shifts to UTC,
  // which for IST (+5:30) turns "May 31 12:00am local" into "May 30 18:30 UTC"
  // → wrong date label on the grid. Use local getters to keep alignment.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function firstOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}
function lastOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

export function MyCalendarPage() {
  const today = todayISO();
  const now = new Date();
  const [view, setView] = useState<'month' | 'list'>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Range for query: from = 1st of month visible, to = last day of next month so spill-over weeks load
  const monthStart = firstOfMonth(year, month);
  const monthEnd = lastOfMonth(year, month);
  // Grid covers from Sunday of week containing monthStart to Saturday of week containing monthEnd
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const from = ymd(gridStart);
  const to = ymd(gridEnd);

  const { data: mits, isLoading } = useQuery({
    queryKey: ['my-calendar', from, to],
    queryFn: () => api.get(`/calendar/mine`, { params: { from, to } }).then((r) => r.data as { events: Event[] }),
  });

  const { data: google, refetch: refetchGoogle, isFetching: googleLoading } = useQuery({
    queryKey: ['my-calendar-google', from, to],
    queryFn: () => api.get(`/calendar/google`, { params: { from, to } }).then((r) => r.data as { connected: boolean; events: Event[]; error?: string }),
    retry: false,
  });

  const events = useMemo(() => {
    const mitsEvents = (mits?.events || []).map((e) => ({ ...e, source: 'mits' as const }));
    const gEvents = (google?.connected ? google.events : []).map((e) => ({ ...e, source: 'google' as const }));
    return [...mitsEvents, ...gEvents];
  }, [mits, google]);

  // Group by date
  const byDay = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    // Sort each day's events by time
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.timeIst || '').localeCompare(b.timeIst || ''));
    }
    return m;
  }, [events]);

  // Build month grid (6 rows × 7 cols)
  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  function navigateMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    else if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
    setSelectedDay(null);
  }
  function goToToday() {
    const n = new Date();
    setYear(n.getFullYear()); setMonth(n.getMonth());
    setSelectedDay(today);
  }

  const monthTitle = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const counts = {
    total: events.length,
    demos: events.filter((e) => e.kind === 'demo').length,
    sessions: events.filter((e) => e.kind === 'session').length,
    google: events.filter((e) => e.source === 'google').length,
  };
  const selectedEvents = selectedDay ? (byDay.get(selectedDay) || []) : [];

  return (
    <>
      <Topbar
        title="My calendar"
        subtitle={`${monthTitle} · ${counts.total} events${counts.demos ? ` · ${counts.demos} demos` : ''}${counts.sessions ? ` · ${counts.sessions} sessions` : ''}${counts.google ? ` · ${counts.google} Google` : ''}`}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" onClick={() => navigateMonth(-1)} title="Previous month"><ChevronLeft size={14}/></Button>
            <Button size="sm" onClick={goToToday}>Today</Button>
            <Button size="sm" onClick={() => navigateMonth(1)} title="Next month"><ChevronRight size={14}/></Button>
            <Button size="sm" onClick={() => setView(view === 'month' ? 'list' : 'month')}>
              {view === 'month' ? 'List view' : 'Month view'}
            </Button>
            <Button size="sm" onClick={() => refetchGoogle()} disabled={googleLoading} title="Refresh Google sync">
              <RefreshCw size={12} className={googleLoading ? 'animate-spin' : ''}/> {google?.connected ? 'Sync Google' : 'Connect Google'}
            </Button>
          </div>
        }
      />
      <Page>
        {!google?.connected && (
          <div className="callout">
            <Cloud size={14} className="inline mr-1"/>
            Google Calendar sync is <strong>not connected</strong> for your account.
            {google?.error
              ? <> — {google.error}</>
              : <> Sign in via Google (with Calendar permission) on the login page, or admin needs to set <code>GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI</code> in the backend.</>
            }
          </div>
        )}

        {view === 'month' && (
          <div className="card" style={{ padding: 0 }}>
            <div className="grid grid-cols-7 border-b border-brand-border">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-brand-textMuted text-center">
                  {d}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-brand-border last:border-b-0" style={{ minHeight: 100 }}>
                {week.map((d) => {
                  const dISO = ymd(d);
                  const inMonth = d.getMonth() === month;
                  const isToday = dISO === today;
                  const isSelected = dISO === selectedDay;
                  const dayEvents = byDay.get(dISO) || [];
                  return (
                    <div
                      key={dISO}
                      onClick={() => setSelectedDay(dISO)}
                      className="border-r border-brand-border last:border-r-0 p-1.5 cursor-pointer hover:bg-bg-input transition-colors overflow-hidden"
                      style={{
                        background: isSelected ? 'rgba(245, 158, 11, 0.08)' : isToday ? 'rgba(245, 158, 11, 0.04)' : undefined,
                        opacity: inMonth ? 1 : 0.35,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-block text-xs font-semibold ${isToday ? 'bg-brand-amber text-[#1A1B1E] rounded-full w-5 h-5 leading-5 text-center' : ''}`}
                        >
                          {d.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[9px] muted">{dayEvents.length}</span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className="text-[10px] px-1 py-0.5 rounded truncate"
                            style={{
                              background:
                                e.source === 'google' ? 'rgba(66, 133, 244, 0.18)' :
                                e.kind === 'demo' ? 'rgba(59, 130, 246, 0.18)' :
                                'rgba(245, 158, 11, 0.18)',
                              color:
                                e.source === 'google' ? '#9DBEF5' :
                                e.kind === 'demo' ? '#9EC0F8' :
                                '#FBC56B',
                            }}
                            title={e.title}
                          >
                            {e.timeIst && <span className="mono">{e.timeIst} </span>}
                            {e.title.length > 22 ? e.title.slice(0, 22) + '…' : e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[9px] muted">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-3">
            {[...byDay.keys()].sort().map((day) => {
              const dayEvents = byDay.get(day)!;
              const isToday = day === today;
              return (
                <div key={day} className="card" style={isToday ? { borderColor: '#F59E0B' } : undefined}>
                  <div className="card-h">
                    <span style={isToday ? { color: '#F59E0B' } : undefined}>
                      {new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {isToday && ' · today'}
                    </span>
                    <span className="muted text-xs">{dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}</span>
                  </div>
                  <div className="space-y-2">
                    {dayEvents.map((e) => <EventRow key={e.id} e={e}/>)}
                  </div>
                </div>
              );
            })}
            {events.length === 0 && !isLoading && (
              <div className="text-center py-12 muted">
                <Calendar size={32} className="inline-block mb-2 opacity-50"/>
                <div>Nothing scheduled this month.</div>
              </div>
            )}
          </div>
        )}

        {/* Day detail panel — only in month view */}
        {view === 'month' && selectedDay && (
          <div className="card mt-3">
            <div className="card-h">
              <span>
                {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <button onClick={() => setSelectedDay(null)} className="text-brand-textMuted hover:text-brand-text">
                <X size={14}/>
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <div className="muted text-sm">Nothing scheduled.</div>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((e) => <EventRow key={e.id} e={e}/>)}
              </div>
            )}
          </div>
        )}
      </Page>
    </>
  );
}

function EventRow({ e }: { e: Event }) {
  const icon = e.source === 'google'
    ? <Cloud size={16} className="text-brand-blue"/>
    : e.kind === 'demo'
    ? <Video size={16} className="text-brand-blue"/>
    : <ClipboardList size={16} className="text-brand-amber"/>;
  return (
    <div className="bg-bg-input rounded p-3 flex items-start gap-3">
      <div className="pt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {e.timeIst && <span className="mono text-sm font-semibold">{e.timeIst}{e.source !== 'google' && ' IST'}</span>}
          <span className="text-sm">{e.title}</span>
          {e.source === 'google' && <Pill color="grey">Google</Pill>}
          {e.status && e.source !== 'google' && (
            <Pill color={
              e.status === 'Done' ? 'green' :
              e.status === 'Cancelled' ? 'red' :
              e.status === 'Scheduled' || e.status === 'Rescheduled' ? 'amber' : 'grey'
            }>{e.status}</Pill>
          )}
          {e.outcome && (
            <Pill color={e.outcome === 'Positive' ? 'green' : e.outcome === 'Negative' ? 'red' : 'amber'}>
              {e.outcome}
            </Pill>
          )}
        </div>
        <div className="text-xs muted mt-1">
          {e.clientName && (
            <>
              <strong>Client:</strong>{' '}
              {e.clientId
                ? <Link to={`/clients/${e.clientId}`} className="text-brand-blue hover:underline">{e.clientName}</Link>
                : e.clientName}
            </>
          )}
          {e.trainerName && (
            <>
              {' · '}
              <strong>Trainer:</strong>{' '}
              {e.trainerId
                ? <Link to={`/trainers/${e.trainerId}`} className="text-brand-blue hover:underline">{e.trainerName}</Link>
                : e.trainerName}
            </>
          )}
          {e.htmlLink && (
            <>
              {' · '}
              <a href={e.htmlLink} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">Open in Google</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
