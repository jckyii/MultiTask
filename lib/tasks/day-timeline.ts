// Pure layout engine for the day page's timeline (developer design
// 2026-07-22, v2): on WIDE screens the timeline carries EVENTS ONLY (tasks
// live beside it as normal cards); on PHONES events and tasks share one
// full-width lane. Long empty stretches collapse into a fixed-height band
// ("N hr") instead of rendering hours of dead space — the piecewise axis is
// what keeps a sparse day compact without lying about durations. All
// geometry is computed here so it's unit-testable; the screen renders
// rectangles.

export type TimelineEventInput = {
  id: number;
  start: Date;
  end: Date | null;
  allDay: boolean;
};

export type TimelineTaskInput = {
  id: number;
  due: Date;
};

export type TimelineMode = 'merged' | 'eventsOnly';

export type TimelineConfig = {
  pxPerHour: number;
  /** Fixed height of a task row — tasks stay uniform and neat. */
  taskHeight: number;
  /** Vertical gap when a task row is pushed below a colliding block. */
  taskGap: number;
  /** Floor for very short events so their title stays readable. */
  minEventHeight: number;
  /** Empty stretches at least this long compress into a band. */
  gapThresholdHours: number;
  /** Rendered height of a compressed band. */
  gapBandPx: number;
  /** Span the full 00:00–24:00 day (developer request 2026-08-15) — the
   *  leading/trailing empty stretches then compress like interior gaps. */
  fullDay?: boolean;
};

export type TimelineLayout = {
  height: number;
  hours: { hour: number; top: number; label: string }[];
  /** Compressed empty stretches — render as a small "N hr" band. */
  gaps: { top: number; height: number; hours: number }[];
  /** `shared`: squeezed left because a task row runs alongside (merged mode). */
  events: { id: number; top: number; height: number; col: number; cols: number; shared: boolean }[];
  /** `narrow`: right-aligned beside an event instead of full width. */
  tasks: { id: number; top: number; narrow: boolean }[];
  /** All-day events don't belong on an hour axis — strip above the timeline. */
  allDayIds: number[];
  /** Y of the current time, when provided and inside the axis. */
  nowTop: number | null;
};

const DEFAULT_EVENT_MINUTES = 30; // endless events get a visual half-hour

const EMPTY: TimelineLayout = {
  height: 0,
  hours: [],
  gaps: [],
  events: [],
  tasks: [],
  allDayIds: [],
  nowTop: null,
};

function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

export function hourLabel(hour: number): string {
  const h = hour % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function layoutDayTimeline(
  events: TimelineEventInput[],
  tasks: TimelineTaskInput[],
  mode: TimelineMode,
  config: TimelineConfig,
  nowHour?: number | null
): TimelineLayout {
  const allDayIds = events.filter((e) => e.allDay).map((e) => e.id);
  const timed = events
    .filter((e) => !e.allDay)
    .map((e) => {
      const startH = hourOf(e.start);
      const endH = e.end && e.end > e.start ? hourOf(e.end) : startH + DEFAULT_EVENT_MINUTES / 60;
      return { id: e.id, startH, endH };
    })
    .sort((a, b) => a.startH - b.startH || a.endH - b.endH || a.id - b.id);
  const dated =
    mode === 'merged'
      ? tasks.map((t) => ({ id: t.id, dueH: hourOf(t.due) })).sort((a, b) => a.dueH - b.dueH || a.id - b.id)
      : [];

  // fullDay axes render even with nothing on them (developer 2026-09-09:
  // an empty day still shows all 24 hour lines) — the sentinels below are
  // enough to build the axis. Non-fullDay callers keep the empty layout.
  if (timed.length === 0 && dated.length === 0 && !config.fullDay) return { ...EMPTY, allDayIds };

  // Busy coverage. A task row occupies real pixels, so for axis/gap purposes
  // it "uses" the hours its row will cover.
  const taskBusyHours = config.taskHeight / config.pxPerHour;
  const busy: { s: number; e: number }[] = [
    ...timed.map((e) => ({ s: e.startH, e: e.endH })),
    ...dated.map((t) => ({ s: t.dueH, e: Math.min(24, t.dueH + taskBusyHours) })),
    // Zero-width sentinels pin the axis to the whole day, turning the
    // leading/trailing empty runs into compressible interior gaps.
    ...(config.fullDay ? [{ s: 0, e: 0 }, { s: 24, e: 24 }] : []),
  ].sort((a, b) => a.s - b.s);
  const merged: { s: number; e: number }[] = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.s <= last.e) last.e = Math.max(last.e, b.e);
    else merged.push({ ...b });
  }

  const axisStartH = Math.floor(merged[0].s);
  const axisEndH = Math.max(Math.min(24, Math.ceil(merged[merged.length - 1].e)), axisStartH + 1);

  // Interior free stretches (snapped to whole hours) that are long enough
  // become compressed segments.
  const compressed: { s: number; e: number }[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const freeStart = Math.ceil(merged[i].e);
    const freeEnd = Math.floor(merged[i + 1].s);
    if (freeEnd - freeStart >= config.gapThresholdHours) {
      compressed.push({ s: freeStart, e: freeEnd });
    }
  }

  // Piecewise y(t): normal segments at pxPerHour, compressed at gapBandPx.
  type Segment = { s: number; e: number; topPx: number; pxPerHour: number; heightPx: number };
  const segments: Segment[] = [];
  let cursorH = axisStartH;
  let cursorPx = 0;
  const pushSegment = (s: number, e: number, isGap: boolean) => {
    if (e <= s) return;
    const heightPx = isGap ? config.gapBandPx : (e - s) * config.pxPerHour;
    segments.push({ s, e, topPx: cursorPx, pxPerHour: isGap ? config.gapBandPx / (e - s) : config.pxPerHour, heightPx });
    cursorPx += heightPx;
  };
  for (const gap of compressed) {
    pushSegment(cursorH, gap.s, false);
    pushSegment(gap.s, gap.e, true);
    cursorH = gap.e;
  }
  pushSegment(cursorH, axisEndH, false);
  let height = cursorPx;

  const yOf = (hour: number): number => {
    const clamped = Math.min(Math.max(hour, axisStartH), axisEndH);
    for (const seg of segments) {
      if (clamped <= seg.e) return seg.topPx + (clamped - seg.s) * seg.pxPerHour;
    }
    return height;
  };

  const gaps = compressed.map((g) => ({
    top: yOf(g.s),
    height: config.gapBandPx,
    hours: g.e - g.s,
  }));

  // Overlapping events split into side-by-side columns (classic day-view
  // algorithm): greedy column assignment inside each overlap cluster; every
  // member of a cluster shares the cluster's column count.
  type Placed = { id: number; startH: number; endH: number; col: number; cluster: number };
  const placed: Placed[] = [];
  const columnEnds: number[] = [];
  let cluster = 0;
  let clusterEnd = -Infinity;
  const clusterCols = new Map<number, number>();
  for (const e of timed) {
    if (e.startH >= clusterEnd) {
      cluster += 1;
      columnEnds.length = 0;
      clusterEnd = -Infinity;
    }
    let col = columnEnds.findIndex((end) => end <= e.startH);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(e.endH);
    } else {
      columnEnds[col] = e.endH;
    }
    clusterEnd = Math.max(clusterEnd, e.endH);
    clusterCols.set(cluster, Math.max(clusterCols.get(cluster) ?? 1, columnEnds.length));
    placed.push({ id: e.id, startH: e.startH, endH: e.endH, col, cluster });
  }
  const eventBlocks = placed.map((e) => ({
    id: e.id,
    top: yOf(e.startH),
    height: Math.max(config.minEventHeight, yOf(e.endH) - yOf(e.startH)),
    col: e.col,
    cols: clusterCols.get(e.cluster) ?? 1,
    shared: false,
  }));

  // Merged mode: a task stays AT ITS TIME (pushing it below events cascaded
  // a 9 AM task past a busy morning — misleading). It only stacks below
  // earlier tasks; when its row runs alongside an event block, the two share
  // the width instead (task `narrow` right, event `shared` left).
  const taskBlocks: { id: number; top: number; narrow: boolean }[] = [];
  let prevBottom = -Infinity;
  for (const t of dated) {
    const top = Math.max(yOf(t.dueH), prevBottom);
    taskBlocks.push({ id: t.id, top, narrow: false });
    prevBottom = top + config.taskHeight + config.taskGap;
  }
  for (const t of taskBlocks) {
    for (const e of eventBlocks) {
      if (t.top < e.top + e.height && t.top + config.taskHeight > e.top) {
        t.narrow = true;
        e.shared = true;
      }
    }
  }
  if (taskBlocks.length > 0) {
    const lastBottom = taskBlocks[taskBlocks.length - 1].top + config.taskHeight;
    height = Math.max(height, lastBottom);
  }

  // Hour marks: whole hours outside compressed interiors (band edges kept —
  // they label where the gap starts and where time resumes).
  const hours: TimelineLayout['hours'] = [];
  for (let h = axisStartH; h <= axisEndH; h++) {
    const insideGap = compressed.some((g) => h > g.s && h < g.e);
    if (!insideGap) hours.push({ hour: h, top: yOf(h), label: hourLabel(h) });
  }

  const nowTop =
    nowHour != null && nowHour >= axisStartH && nowHour <= axisEndH ? yOf(nowHour) : null;

  return { height, hours, gaps, events: eventBlocks, tasks: taskBlocks, allDayIds, nowTop };
}
