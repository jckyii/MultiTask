// The day page's timeline. Two variants (developer design 2026-07-22 v2):
//   - 'eventsOnly' (wide screens): the left pane — events as duration-sized
//     blocks on the hour axis; tasks live BESIDE the timeline as normal cards.
//   - 'merged' (phones): one full-width lane — event blocks and uniform task
//     rows interleaved by time, with a one-tap complete circle per task.
// Long empty stretches arrive from the engine as compressed "N hr" bands.
// Geometry comes entirely from the tested layout engine
// (lib/tasks/day-timeline.ts); this file renders rectangles and wires presses.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { CalendarEvent } from '@/lib/events/use-events';
import {
  layoutDayTimeline,
  type TimelineConfig,
  type TimelineMode,
} from '@/lib/tasks/day-timeline';
import { deriveStatus, type TaskStatus } from '@/lib/tasks/status';
import type { Task } from '@/lib/tasks/types';
import { readableTextColor } from '@/lib/theme/pill-colors';
import { useTheme } from '@/lib/theme/use-theme';

/** Exported for the day page's initial-scroll math (scroll to the first
 *  item once the axis stopped compressing empty hours). */
export const DAY_TIMELINE_PX_PER_HOUR = 64;

const CONFIG: TimelineConfig = {
  pxPerHour: DAY_TIMELINE_PX_PER_HOUR,
  taskHeight: 56,
  taskGap: 6,
  minEventHeight: 30,
  // Developer direction (2026-09-09, reversing the 2026-08-15 bands): the
  // axis spans the WHOLE day at TRUE scale — every hour line renders, empty
  // stretches included. Infinity disables the "N hr" compression bands.
  gapThresholdHours: Infinity,
  fullDay: true,
  gapBandPx: 44,
};
const RULER_WIDTH = 52;

function timeRange(event: CalendarEvent): string {
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return event.end ? `${fmt(event.start)} – ${fmt(event.end)}` : fmt(event.start);
}

// Discriminated by variant so task handlers can't be forgotten: rendering a
// task row whose press/toggle silently no-ops would expose fake buttons to
// assistive tech (CodeRabbit security/a11y pass 2026-07-23).
type BaseProps = {
  events: CalendarEvent[];
  /** Local now — only passed when this page is showing TODAY (draws the now line). */
  now?: Date | null;
  onPressEvent: (event: CalendarEvent) => void;
};

type Props =
  | (BaseProps & { variant: 'eventsOnly' })
  | (BaseProps & {
      variant: 'merged';
      tasks: Task[];
      urgencyThresholdHours: number;
      onPressTask: (task: Task) => void;
      /** The complete/restore toggle (same handler as a swipe-right). */
      onToggleTask: (task: Task) => void;
    });

export function DayTimeline(props: Props) {
  const { variant, events, now, onPressEvent } = props;
  const merged = props.variant === 'merged' ? props : null;
  const tasks = merged?.tasks ?? [];
  const urgencyThresholdHours = merged?.urgencyThresholdHours ?? 48;
  const { colors, radius, type, monoFont, isDark } = useTheme();

  const layout = useMemo(
    () =>
      layoutDayTimeline(
        events.map((e) => ({ id: e.id, start: e.start, end: e.end, allDay: e.allDay })),
        tasks.filter((t) => t.dueDate).map((t) => ({ id: t.id, due: t.dueDate as Date })),
        variant,
        CONFIG,
        now ? now.getHours() + now.getMinutes() / 60 : null
      ),
    [events, tasks, variant, now]
  );

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const statusAccent = (status: TaskStatus) =>
    status === 'overdue'
      ? colors.statusOverdueAccent
      : status === 'urgent'
        ? colors.statusUrgentAccent
        : status === 'ongoing'
          ? colors.statusOngoingAccent
          : colors.textTertiary;

  if (layout.height === 0) return null;

  return (
    <View style={{ height: layout.height }}>
      {/* Hour ruler + hairlines. */}
      {layout.hours.map((mark) => (
        <View key={mark.hour} pointerEvents="none" style={[styles.hourRow, { top: mark.top }]}>
          <Text
            style={{
              width: RULER_WIDTH - 8,
              textAlign: 'right',
              fontFamily: monoFont,
              fontSize: 10,
              color: colors.textTertiary,
              transform: [{ translateY: -5 }],
            }}>
            {mark.label}
          </Text>
          <View style={[styles.hairline, { backgroundColor: colors.borderSubtle }]} />
        </View>
      ))}

      {/* Compressed empty stretches — a quiet "N hr" band. */}
      {layout.gaps.map((gap, i) => (
        <View
          key={`gap-${i}`}
          pointerEvents="none"
          style={[styles.gapBand, { top: gap.top, height: gap.height, left: RULER_WIDTH }]}>
          <View style={[styles.gapLine, { backgroundColor: colors.borderSubtle }]} />
          <Text
            style={{
              fontFamily: monoFont,
              fontSize: 10,
              color: colors.textTertiary,
              paddingHorizontal: 8,
            }}>
            {gap.hours} hr
          </Text>
          <View style={[styles.gapLine, { backgroundColor: colors.borderSubtle }]} />
        </View>
      ))}

      {/* The single content lane: events (and, on phones, task rows). */}
      <View style={[styles.lane, { left: RULER_WIDTH }]}>
        {layout.events.map((block) => {
          const event = eventById.get(block.id);
          if (!event) return null;
          const eventColor = event.color ?? colors.statusEventAccent;
          // When a task row runs alongside, the event cluster squeezes into
          // the left 56% and the task takes the right (merged mode only).
          const clusterWidth = block.shared ? 56 : 100;
          const laneWidth = clusterWidth / block.cols;
          return (
            <Pressable
              key={`e-${block.id}`}
              onPress={() => onPressEvent(event)}
              accessibilityRole="button"
              accessibilityLabel={`${event.title}, ${timeRange(event)}`}
              style={{
                position: 'absolute',
                top: block.top,
                height: block.height,
                left: `${block.col * laneWidth}%`,
                width: `${laneWidth}%`,
                paddingRight: block.col === block.cols - 1 && !block.shared ? 0 : 4,
              }}>
              <View
                style={[
                  styles.eventBlock,
                  {
                    borderRadius: radius.tight,
                    backgroundColor: colors.surfaceElevated,
                    borderLeftColor: eventColor,
                    borderColor: colors.borderSubtle,
                  },
                ]}>
                <Text
                  numberOfLines={block.height > 44 ? 2 : 1}
                  style={[type.caption, { color: colors.textPrimary }]}>
                  {event.title}
                </Text>
                {block.height >= 44 && (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: monoFont,
                      fontSize: 10,
                      color: readableTextColor(eventColor, isDark),
                    }}>
                    {timeRange(event)}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}

        {layout.tasks.map((block) => {
          const task = taskById.get(block.id);
          if (!task) return null;
          const status = deriveStatus(task, { urgencyThresholdHours });
          const accent = statusAccent(status);
          const done = task.isCompleted;
          const due = task.dueDate as Date;
          return (
            // The check button is a SIBLING of the row pressable, not a child
            // — nested pressables render nested <button> elements on web
            // (invalid HTML, hydration errors, and the RNW hover bug).
            <View
              key={`t-${block.id}`}
              style={[
                styles.taskRow,
                {
                  top: block.top,
                  height: CONFIG.taskHeight,
                  // Alongside an event: take the right side; otherwise full width.
                  left: block.narrow ? '58%' : 0,
                  borderRadius: radius.button,
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.borderSubtle,
                },
              ]}>
              <Pressable
                onPress={() => merged?.onPressTask(task)}
                accessibilityRole="button"
                accessibilityLabel={`${task.title}, ${done ? 'completed' : status}`}
                style={styles.taskBody}>
                <View
                  style={[styles.taskBar, { backgroundColor: done ? colors.textTertiary : accent }]}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: done ? colors.textTertiary : colors.textPrimary,
                      textDecorationLine: done ? 'line-through' : 'none',
                    }}>
                    {task.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {/* Non-color overdue cue — same triangle as the task
                        card (rule 1: never color alone). Urgent-vs-ongoing's
                        extra cue stays a deferred design decision, matching
                        cards (REVIEW-REPORT deferred #1). */}
                    {!done && status === 'overdue' && (
                      <IconSymbol
                        name="exclamationmark.triangle.fill"
                        size={10}
                        color={colors.statusOverdueAccent}
                      />
                    )}
                    {!done && status === 'urgent' && (
                      <IconSymbol name="clock.fill" size={10} color={colors.statusUrgentAccent} />
                    )}
                    <Text
                      style={{
                        fontFamily: monoFont,
                        fontSize: 10,
                        color: !done && status === 'overdue' ? accent : colors.textTertiary,
                      }}>
                      {due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              </Pressable>
              <Pressable
                onPress={() => merged?.onToggleTask(task)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={done ? `Un-complete ${task.title}` : `Complete ${task.title}`}
                style={styles.checkButton}>
                <IconSymbol
                  name={done ? 'checkmark' : 'circle'}
                  size={22}
                  color={done ? colors.textTertiary : accent}
                />
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* The now line — only when viewing today. */}
      {layout.nowTop != null && (
        <View pointerEvents="none" style={[styles.nowLine, { top: layout.nowTop }]}>
          <View style={[styles.nowDot, { backgroundColor: colors.statusOverdueAccent }]} />
          <View style={[styles.nowHairline, { backgroundColor: colors.statusOverdueAccent }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hairline: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  gapBand: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gapLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  lane: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  eventBlock: {
    flex: 1,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  taskRow: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingRight: 6,
    overflow: 'hidden',
  },
  taskBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    minWidth: 0,
  },
  taskBar: { width: 3, alignSelf: 'stretch' },
  checkButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowLine: {
    position: 'absolute',
    left: RULER_WIDTH - 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowDot: { width: 7, height: 7, borderRadius: 4 },
  nowHairline: { flex: 1, height: 1.5 },
});
