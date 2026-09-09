import { layoutDayTimeline, type TimelineEventInput, type TimelineTaskInput } from '../day-timeline';

const CFG = {
  pxPerHour: 64,
  taskHeight: 56,
  taskGap: 6,
  minEventHeight: 28,
  gapThresholdHours: 2,
  gapBandPx: 44,
};

function ev(overrides: Partial<TimelineEventInput> & { id: number }): TimelineEventInput {
  return {
    start: new Date('2026-09-09T09:00:00'),
    end: new Date('2026-09-09T10:00:00'),
    allDay: false,
    ...overrides,
  };
}

function task(overrides: Partial<TimelineTaskInput> & { id: number }): TimelineTaskInput {
  return { due: new Date('2026-09-09T12:00:00'), ...overrides };
}

describe('layoutDayTimeline — axis', () => {
  it('spans from the first item to the last, on whole hours (no business-frame padding)', () => {
    const layout = layoutDayTimeline(
      [ev({ id: 1, start: new Date('2026-09-09T08:30:00'), end: new Date('2026-09-09T09:20:00') })],
      [task({ id: 1, due: new Date('2026-09-09T10:45:00') })],
      'merged',
      CFG
    );
    expect(layout.hours[0].hour).toBe(8);
    expect(layout.hours[layout.hours.length - 1].hour).toBe(12); // task row occupies past 11
    expect(layout.gaps).toEqual([]);
  });

  it('returns an empty layout when there is nothing to place', () => {
    const layout = layoutDayTimeline([], [], 'merged', CFG);
    expect(layout.height).toBe(0);
    expect(layout.hours).toEqual([]);
  });

  it('fullDay renders the whole 24h axis even with nothing on it (2026-09-09)', () => {
    const layout = layoutDayTimeline([], [], 'merged', {
      ...CFG,
      fullDay: true,
      gapThresholdHours: Infinity,
    });
    expect(layout.hours[0].hour).toBe(0);
    expect(layout.hours[layout.hours.length - 1].hour).toBe(24);
    expect(layout.gaps).toEqual([]);
    expect(layout.height).toBe(24 * CFG.pxPerHour);
  });
});

describe('layoutDayTimeline — gap compression', () => {
  it('collapses a long empty stretch into a fixed band', () => {
    const layout = layoutDayTimeline(
      [
        ev({ id: 1, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') }),
        ev({ id: 2, start: new Date('2026-09-09T16:00:00'), end: new Date('2026-09-09T17:00:00') }),
      ],
      [],
      'merged',
      CFG
    );
    expect(layout.gaps).toHaveLength(1);
    const gap = layout.gaps[0];
    expect(gap.hours).toBe(6); // 10:00 → 16:00
    expect(gap.height).toBe(CFG.gapBandPx);
    expect(gap.top).toBe(CFG.pxPerHour); // one hour of event first
    // Second event resumes right below the band.
    expect(layout.events[1].top).toBe(CFG.pxPerHour + CFG.gapBandPx);
    // Total: 1h event + band + 1h event.
    expect(layout.height).toBe(CFG.pxPerHour * 2 + CFG.gapBandPx);
  });

  it('keeps short lulls at true scale', () => {
    const layout = layoutDayTimeline(
      [
        ev({ id: 1, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') }),
        ev({ id: 2, start: new Date('2026-09-09T11:00:00'), end: new Date('2026-09-09T12:00:00') }),
      ],
      [],
      'merged',
      CFG
    );
    expect(layout.gaps).toEqual([]);
    expect(layout.events[1].top).toBe(2 * CFG.pxPerHour);
  });

  it('skips hour marks inside a compressed band but keeps its edges', () => {
    const layout = layoutDayTimeline(
      [
        ev({ id: 1, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') }),
        ev({ id: 2, start: new Date('2026-09-09T16:00:00'), end: new Date('2026-09-09T17:00:00') }),
      ],
      [],
      'merged',
      CFG
    );
    const hoursShown = layout.hours.map((h) => h.hour);
    expect(hoursShown).toContain(10);
    expect(hoursShown).toContain(16);
    expect(hoursShown).not.toContain(12);
    expect(hoursShown).not.toContain(14);
  });
});

describe('layoutDayTimeline — events', () => {
  it('sizes blocks by duration and splits overlaps into columns', () => {
    const layout = layoutDayTimeline(
      [
        ev({ id: 1, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') }),
        ev({ id: 2, start: new Date('2026-09-09T09:30:00'), end: new Date('2026-09-09T10:30:00') }),
      ],
      [],
      'merged',
      CFG
    );
    const [a, b] = layout.events;
    expect(a.height).toBe(CFG.pxPerHour);
    expect([a.col, b.col].sort()).toEqual([0, 1]);
    expect(a.cols).toBe(2);
  });

  it('gives endless events a half-hour block and enforces the height floor', () => {
    const layout = layoutDayTimeline(
      [
        ev({ id: 1, end: null }),
        ev({ id: 2, start: new Date('2026-09-09T11:00:00'), end: new Date('2026-09-09T11:05:00') }),
      ],
      [],
      'merged',
      CFG
    );
    expect(layout.events[0].height).toBe(CFG.pxPerHour / 2);
    expect(layout.events[1].height).toBe(CFG.minEventHeight);
  });

  it('separates all-day events out of the timeline', () => {
    const layout = layoutDayTimeline([ev({ id: 1, allDay: true }), ev({ id: 2 })], [], 'merged', CFG);
    expect(layout.allDayIds).toEqual([1]);
    expect(layout.events.map((e) => e.id)).toEqual([2]);
  });
});

describe('layoutDayTimeline — merged tasks', () => {
  it('keeps a task at its true time and shares width with a colliding event', () => {
    const layout = layoutDayTimeline(
      [ev({ id: 9, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') })],
      [task({ id: 1, due: new Date('2026-09-09T09:15:00') })],
      'merged',
      CFG
    );
    const eventBlock = layout.events[0];
    const t = layout.tasks[0];
    // The task renders AT 9:15 — never shoved below the event.
    expect(t.top).toBe(CFG.pxPerHour * 0.25); // axis starts at 9
    expect(t.narrow).toBe(true);
    expect(eventBlock.shared).toBe(true);
  });

  it('leaves non-colliding tasks and events at full width', () => {
    const layout = layoutDayTimeline(
      [ev({ id: 9, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') })],
      [task({ id: 1, due: new Date('2026-09-09T11:30:00') })],
      'merged',
      CFG
    );
    expect(layout.tasks[0].narrow).toBe(false);
    expect(layout.events[0].shared).toBe(false);
  });

  it('stacks near-simultaneous tasks without overlap', () => {
    const layout = layoutDayTimeline(
      [],
      [
        task({ id: 1, due: new Date('2026-09-09T09:00:00') }),
        task({ id: 2, due: new Date('2026-09-09T09:05:00') }),
      ],
      'merged',
      CFG
    );
    const [t1, t2] = layout.tasks;
    expect(t2.top).toBeGreaterThanOrEqual(t1.top + CFG.taskHeight + CFG.taskGap);
  });

  it('extends the height when pushed tasks run past the last hour', () => {
    const layout = layoutDayTimeline(
      [],
      [
        task({ id: 1, due: new Date('2026-09-09T23:50:00') }),
        task({ id: 2, due: new Date('2026-09-09T23:55:00') }),
        task({ id: 3, due: new Date('2026-09-09T23:59:00') }),
      ],
      'merged',
      CFG
    );
    const last = layout.tasks[layout.tasks.length - 1];
    expect(last.top + CFG.taskHeight).toBeLessThanOrEqual(layout.height);
  });
});

describe('layoutDayTimeline — eventsOnly (wide screens)', () => {
  it('ignores tasks entirely', () => {
    const layout = layoutDayTimeline(
      [ev({ id: 1 })],
      [task({ id: 1, due: new Date('2026-09-09T09:15:00') })],
      'eventsOnly',
      CFG
    );
    expect(layout.tasks).toEqual([]);
    expect(layout.events).toHaveLength(1);
    // Axis follows the events alone.
    expect(layout.hours[0].hour).toBe(9);
  });
});

describe('layoutDayTimeline — now line', () => {
  it('maps now through the compressed axis', () => {
    const layout = layoutDayTimeline(
      [
        ev({ id: 1, start: new Date('2026-09-09T09:00:00'), end: new Date('2026-09-09T10:00:00') }),
        ev({ id: 2, start: new Date('2026-09-09T16:00:00'), end: new Date('2026-09-09T17:00:00') }),
      ],
      [],
      'merged',
      CFG,
      16.5 // 4:30 PM — inside the second event, after the band
    );
    expect(layout.nowTop).toBe(CFG.pxPerHour + CFG.gapBandPx + CFG.pxPerHour / 2);
  });

  it('is null when now is outside the axis', () => {
    const layout = layoutDayTimeline([ev({ id: 1 })], [], 'merged', CFG, 22);
    expect(layout.nowTop).toBeNull();
  });
});
