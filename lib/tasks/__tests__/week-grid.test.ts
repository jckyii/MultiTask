import { layoutWeekColumn, weekGridHeight, type WeekGridConfig } from '../week-grid';

const CFG: WeekGridConfig = { pxPerHour: 60, taskBlockPx: 20, minEventPx: 16 };

function event(id: number, startH: number, startM: number, endH: number | null, endM = 0, allDay = false) {
  return {
    id,
    title: `E${id}`,
    start: new Date(2026, 7, 26, startH, startM),
    end: endH == null ? null : new Date(2026, 7, 26, endH, endM),
    allDay,
    color: null,
  };
}

function task(id: number, h: number, m: number) {
  return { id, title: `T${id}`, due: new Date(2026, 7, 26, h, m), status: 'ongoing' as const };
}

describe('layoutWeekColumn', () => {
  it('positions events by start time and duration at pxPerHour scale', () => {
    const { blocks } = layoutWeekColumn([], [event(1, 9, 0, 10, 30)], CFG);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].top).toBe(9 * 60);
    expect(blocks[0].height).toBe(90);
    expect(blocks[0].widthFrac).toBe(1);
  });

  it('separates all-day events from the timed grid', () => {
    const col = layoutWeekColumn([], [event(1, 0, 0, null, 0, true), event(2, 9, 0, 10, 0)], CFG);
    expect(col.allDay).toHaveLength(1);
    expect(col.blocks).toHaveLength(1);
  });

  it('splits overlapping blocks into side-by-side lanes of equal width', () => {
    const { blocks } = layoutWeekColumn(
      [],
      [event(1, 9, 0, 11, 0), event(2, 10, 0, 12, 0)],
      CFG
    );
    expect(blocks[0].widthFrac).toBeCloseTo(0.5);
    expect(blocks[1].widthFrac).toBeCloseTo(0.5);
    expect(blocks[0].leftFrac).not.toBeCloseTo(blocks[1].leftFrac);
  });

  it('keeps non-overlapping blocks full width', () => {
    const { blocks } = layoutWeekColumn([], [event(1, 9, 0, 10, 0), event(2, 10, 0, 11, 0)], CFG);
    expect(blocks[0].widthFrac).toBe(1);
    expect(blocks[1].widthFrac).toBe(1);
  });

  it('gives endless events a 30-minute block and short ones the readable floor', () => {
    const { blocks } = layoutWeekColumn([], [event(1, 9, 0, null), event(2, 12, 0, 12, 5)], CFG);
    expect(blocks[0].height).toBe(30);
    expect(blocks[1].height).toBe(CFG.minEventPx);
  });

  it('anchors tasks at their due time with fixed height, clamped inside the day', () => {
    const { blocks } = layoutWeekColumn([task(1, 23, 59)], [], CFG);
    expect(blocks[0].height).toBe(CFG.taskBlockPx);
    expect(blocks[0].top + blocks[0].height).toBeLessThanOrEqual(weekGridHeight(CFG));
  });

  it('lanes a task against an event it collides with', () => {
    const { blocks } = layoutWeekColumn([task(1, 9, 15)], [event(2, 9, 0, 10, 0)], CFG);
    expect(blocks[0].widthFrac).toBeCloseTo(0.5);
    expect(blocks[1].widthFrac).toBeCloseTo(0.5);
  });
});
