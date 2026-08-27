// The Google-Calendar-style week grid (developer spec 2026-08-18): 7 day
// columns over a shared 24-hour axis, tasks and events as time-positioned
// blocks. Tasks keep the card DNA (status tint + accent bar), events keep
// the dashed event-blue identity. Same layout on phone and desktop, just
// compressed (spec: "they should be sort of the same format"). The engine
// (lib/tasks/week-grid.ts) owns all geometry; this file only paints.
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { hourLabel } from '@/lib/tasks/day-timeline';
import { localDateKey } from '@/lib/tasks/calendar';
import { deriveStatus, type TaskStatus } from '@/lib/tasks/status';
import type { CalendarEvent } from '@/lib/events/use-events';
import type { Task } from '@/lib/tasks/types';
import {
  layoutWeekColumn,
  weekGridHeight,
  type WeekGridConfig,
  type WeekGridTaskInput,
} from '@/lib/tasks/week-grid';
import { useTheme } from '@/lib/theme/use-theme';

const AXIS_WIDTH = 40;

type Props = {
  days: Date[];
  tasksByDayKey: Map<string, Task[]>;
  eventsByDayKey: Map<string, CalendarEvent[]>;
  todayKey: string;
  urgencyThresholdHours: number;
  isWide: boolean;
  onPressTask: (id: number) => void;
  onPressEvent: (id: number) => void;
  onPressDay: (date: Date, pageX: number, pageY: number) => void;
};

export function WeekGrid({
  days,
  tasksByDayKey,
  eventsByDayKey,
  todayKey,
  urgencyThresholdHours,
  isWide,
  onPressTask,
  onPressEvent,
  onPressDay,
}: Props) {
  const { colors, space, radius, type, monoFont } = useTheme();
  const cfg: WeekGridConfig = {
    pxPerHour: isWide ? 56 : 44,
    taskBlockPx: isWide ? 22 : 18,
    minEventPx: isWide ? 20 : 16,
  };
  const gridHeight = weekGridHeight(cfg);
  const scrollRef = useRef<ScrollView>(null);

  // Open around the working morning, not midnight.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 7 * cfg.pxPerHour, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  const nowY = (now.getHours() * 60 + now.getMinutes()) * (cfg.pxPerHour / 60);

  const columns = days.map((date) => {
    const key = localDateKey(date);
    const dayTasks: WeekGridTaskInput[] = (tasksByDayKey.get(key) ?? [])
      .filter((t) => !t.deletedAt && t.dueDate)
      .map((t) => ({
        id: t.id,
        title: t.title,
        due: t.dueDate as Date,
        status: deriveStatus(t, { urgencyThresholdHours }),
      }));
    const dayEvents = eventsByDayKey.get(key) ?? [];
    return { date, key, ...layoutWeekColumn(dayTasks, dayEvents, cfg) };
  });

  const hasAllDay = columns.some((c) => c.allDay.length > 0);

  function statusColors(status: TaskStatus | null): { bg: string; accent: string; fg: string } {
    switch (status) {
      case 'urgent':
        return { bg: colors.statusUrgentBg, accent: colors.statusUrgentAccent, fg: colors.textPrimary };
      case 'overdue':
        return { bg: colors.statusOverdueBg, accent: colors.statusOverdueAccent, fg: colors.textPrimary };
      case 'completed':
        return { bg: colors.surfaceSunken, accent: colors.borderSubtle, fg: colors.textTertiary };
      case 'ongoing':
        return { bg: colors.statusOngoingBg, accent: colors.statusOngoingAccent, fg: colors.textPrimary };
      default:
        return { bg: colors.surfaceElevated, accent: colors.borderSubtle, fg: colors.textPrimary };
    }
  }

  return (
    <View style={styles.root}>
      {/* Day headers — tapping one opens that day's page. */}
      <View style={[styles.headerRow, { borderBottomColor: colors.borderSubtle }]}>
        <View style={{ width: AXIS_WIDTH }} />
        {columns.map(({ date, key }) => {
          const isToday = key === todayKey;
          return (
            <Pressable
              key={key}
              onPress={(e) => onPressDay(date, e.nativeEvent.pageX, e.nativeEvent.pageY)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${date.toDateString()}`}
              style={styles.headerCell}>
              <Text
                maxFontSizeMultiplier={1.2}
                style={[type.caption, { color: isToday ? colors.accent : colors.textSecondary }]}>
                {date.toLocaleDateString(undefined, { weekday: isWide ? 'short' : 'narrow' })}
              </Text>
              <View
                style={[
                  styles.headerDay,
                  isToday && { backgroundColor: colors.accent, borderRadius: 999 },
                ]}>
                <Text
                  maxFontSizeMultiplier={1.2}
                  style={{
                    fontFamily: monoFont,
                    fontSize: 13,
                    color: isToday ? colors.textOnAccent : colors.textPrimary,
                  }}>
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* All-day strip. */}
      {hasAllDay && (
        <View style={[styles.allDayRow, { borderBottomColor: colors.borderSubtle }]}>
          <View style={{ width: AXIS_WIDTH }} />
          {columns.map(({ key, allDay }) => (
            <View key={key} style={styles.allDayCell}>
              {allDay.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => onPressEvent(e.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Event ${e.title}`}
                  style={[
                    styles.allDayChip,
                    { borderColor: e.color ?? colors.statusEventAccent, borderRadius: radius.tight },
                  ]}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={{ fontSize: 10, color: e.color ?? colors.statusEventAccent }}>
                    {e.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        <View style={[styles.gridRow, { height: gridHeight }]}>
          {/* Hour axis. */}
          <View style={{ width: AXIS_WIDTH }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Text
                key={h}
                maxFontSizeMultiplier={1.2}
                style={[
                  styles.hourLabel,
                  { top: h * cfg.pxPerHour - 6, fontFamily: monoFont, color: colors.textTertiary },
                ]}>
                {h === 0 ? '' : hourLabel(h)}
              </Text>
            ))}
          </View>

          {columns.map(({ date, key, blocks }, columnIndex) => (
            <View
              key={key}
              style={[
                styles.column,
                { borderLeftColor: colors.borderSubtle },
                key === todayKey && { backgroundColor: colors.accentMuted },
              ]}>
              {/* Hour lines. */}
              {Array.from({ length: 24 }, (_, h) => (
                <View
                  key={h}
                  pointerEvents="none"
                  style={[styles.hourLine, { top: h * cfg.pxPerHour, backgroundColor: colors.borderSubtle }]}
                />
              ))}
              {/* Empty space in a column opens the day too. */}
              <Pressable
                style={StyleSheet.absoluteFill}
                accessibilityRole="button"
                accessibilityLabel={`Open ${date.toDateString()}`}
                onPress={(e) => onPressDay(date, e.nativeEvent.pageX, e.nativeEvent.pageY)}
              />
              {blocks.map((b) => {
                const left = `${b.leftFrac * 100}%` as const;
                const width = `${b.widthFrac * 100}%` as const;
                if (b.kind === 'event') {
                  const accent = b.color ?? colors.statusEventAccent;
                  return (
                    <Pressable
                      key={`e${b.id}`}
                      onPress={() => onPressEvent(b.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Event ${b.title}`}
                      style={[
                        styles.block,
                        {
                          top: b.top,
                          height: b.height,
                          left,
                          width,
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: accent,
                          borderRadius: radius.tight,
                          backgroundColor: colors.surface,
                        },
                      ]}>
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 10, color: accent }}>
                        {b.title}
                      </Text>
                    </Pressable>
                  );
                }
                const c = statusColors(b.status);
                return (
                  <Pressable
                    key={`t${b.id}`}
                    onPress={() => onPressTask(b.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Task ${b.title}`}
                    style={[
                      styles.block,
                      styles.taskBlock,
                      {
                        top: b.top,
                        height: b.height,
                        left,
                        width,
                        backgroundColor: c.bg,
                        borderLeftColor: c.accent,
                        borderRadius: radius.tight,
                      },
                    ]}>
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                      style={{ fontSize: 10, fontWeight: '600', color: c.fg }}>
                      {b.title}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Now line, today only. */}
              {key === todayKey && (
                <View pointerEvents="none" style={[styles.nowLine, { top: nowY, backgroundColor: colors.statusOverdueAccent }]}>
                  <View style={[styles.nowDot, { backgroundColor: colors.statusOverdueAccent, left: columnIndex === 0 ? 0 : -3 }]} />
                </View>
              )}
            </View>
          ))}
        </View>
        <View style={{ height: space.s6 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
  },
  headerCell: { flex: 1, alignItems: 'center', gap: 2 },
  headerDay: {
    minWidth: 26,
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 3,
  },
  allDayCell: { flex: 1, gap: 2, paddingHorizontal: 1 },
  allDayChip: {
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  gridRow: { flexDirection: 'row' },
  hourLabel: {
    position: 'absolute',
    right: 6,
    fontSize: 9,
  },
  column: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  block: {
    position: 'absolute',
    paddingHorizontal: 3,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  taskBlock: {
    borderLeftWidth: 3,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
  },
  nowDot: {
    position: 'absolute',
    top: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
