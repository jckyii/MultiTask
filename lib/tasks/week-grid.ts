// Week-grid layout engine (developer spec 2026-08-18: Google-Calendar-style
// week — 7 day columns, blocks positioned by time). Pure math, no React.
//
// Unlike the day timeline, the week grid uses a UNIFORM shared time axis:
// every column spans the same 00:00-24:00 at the same scale, because
// per-column gap compression would misalign the hour lines between days.
// Overlapping blocks within a column split the column's width side by side
// (classic interval-lane assignment), which is how Google Calendar reads.
import type { TaskStatus } from '@/lib/tasks/status';

export type WeekGridEventInput = {
  id: number;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  color: string | null;
};

export type WeekGridTaskInput = {
  id: number;
  title: string;
  due: Date;
  status: TaskStatus;
};

export type WeekGridConfig = {
  pxPerHour: number;
  /** Fixed height of a task block (tasks are moments, not ranges). */
  taskBlockPx: number;
  /** Floor for very short events so a title line still fits. */
  minEventPx: number;
};

export type WeekGridBlock = {
  kind: 'task' | 'event';
  id: number;
  title: string;
  top: number;
  height: number;
  /** Horizontal share within the column: x = leftFrac, w = widthFrac (0..1). */
  leftFrac: number;
  widthFrac: number;
  /** Events only. */
  color: string | null;
  /** Tasks only. */
  status: TaskStatus | null;
};

export type WeekGridColumn = {
  /** All-day events, rendered in the strip above the timed grid. */
  allDay: WeekGridEventInput[];
  blocks: WeekGridBlock[];
};

export const WEEK_GRID_HOURS = 24;

export function weekGridHeight(cfg: WeekGridConfig): number {
  return WEEK_GRID_HOURS * cfg.pxPerHour;
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

type Span = { start: number; end: number; block: WeekGridBlock };

/** Assign overlapping spans to side-by-side lanes (greedy, by start time),
 *  then give every span in an overlap cluster the cluster's lane count so
 *  widths line up the way Google Calendar draws them. */
function assignLanes(spans: Span[]): void {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  // Build overlap clusters: a cluster ends when nothing open reaches further.
  let cluster: Span[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    for (const s of cluster) {
      let lane = laneEnds.findIndex((end) => end <= s.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(s.end);
      } else {
        laneEnds[lane] = s.end;
      }
      s.block.leftFrac = lane;
    }
    const lanes = laneEnds.length;
    for (const s of cluster) {
      s.block.leftFrac = s.block.leftFrac / lanes;
      s.block.widthFrac = 1 / lanes;
    }
    cluster = [];
  };
  for (const s of sorted) {
    if (cluster.length && s.start >= clusterEnd) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.end);
  }
  flush();
}

export function layoutWeekColumn(
  tasks: WeekGridTaskInput[],
  events: WeekGridEventInput[],
  cfg: WeekGridConfig
): WeekGridColumn {
  const pxPerMinute = cfg.pxPerHour / 60;
  const totalHeight = weekGridHeight(cfg);
  const allDay = events.filter((e) => e.allDay);
  const spans: Span[] = [];

  for (const e of events) {
    if (e.allDay) continue;
    const startMin = minutesOfDay(e.start);
    const endMin = e.end ? Math.max(minutesOfDay(e.end), startMin + 15) : startMin + 30;
    const top = startMin * pxPerMinute;
    const height = Math.max(cfg.minEventPx, (endMin - startMin) * pxPerMinute);
    spans.push({
      start: top,
      end: Math.min(totalHeight, top + height),
      block: {
        kind: 'event',
        id: e.id,
        title: e.title,
        top,
        height: Math.min(height, totalHeight - top),
        leftFrac: 0,
        widthFrac: 1,
        color: e.color,
        status: null,
      },
    });
  }

  for (const t of tasks) {
    // A task is a moment: a fixed-height block anchored at its due time,
    // clamped so 11:59 PM stays fully on the sheet.
    const top = Math.min(minutesOfDay(t.due) * pxPerMinute, totalHeight - cfg.taskBlockPx);
    spans.push({
      start: top,
      end: top + cfg.taskBlockPx,
      block: {
        kind: 'task',
        id: t.id,
        title: t.title,
        top,
        height: cfg.taskBlockPx,
        leftFrac: 0,
        widthFrac: 1,
        color: null,
        status: t.status,
      },
    });
  }

  assignLanes(spans);
  const blocks = spans.map((s) => s.block).sort((a, b) => a.top - b.top);
  return { allDay, blocks };
}
