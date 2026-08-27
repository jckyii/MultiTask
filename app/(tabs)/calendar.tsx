// The Calendar tab (docs/design/03), phone-calendar style: the month view is
// a continuous VERTICAL SCROLL of months (no arrows) — the current month's
// header is full-color, every other month's header is grey. Tapping the year
// in the top bar zooms out to a scrolling year view (12 blocks per year);
// tapping a month scrolls the month view there. Tap a day to drill into its
// task list. Fixed 6-week month grids keep scroll positions exact.
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { TabPage } from '@/components/tab-pager';
import { WeekGrid } from '@/components/week-grid';
import { useCollapsedSection } from '@/hooks/use-collapsed-section';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TourAnchor, useTourAnchor } from '@/components/tour/tour-context';
import { usePageSlide } from '@/hooks/use-page-slide';
import { emitTourEvent } from '@/lib/tour/events';
import { useToday } from '@/hooks/use-today';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { useWideLayout } from '@/hooks/use-wide-layout';
import { eventsByDay, useEvents } from '@/lib/events/use-events';
import { buildMonthMatrix, localDateKey, tasksByDay, weekDates } from '@/lib/tasks/calendar';
import { deriveStatus } from '@/lib/tasks/status';
import type { Task } from '@/lib/tasks/types';
import { useTasks } from '@/lib/tasks/use-tasks';
import { CONTENT_MAX_WIDTH, pageContent } from '@/lib/theme/layout';
import { readableTextColor } from '@/lib/theme/pill-colors';
import { useTheme } from '@/lib/theme/use-theme';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LABELS_WIDE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Fixed geometry so FlatList can jump straight to any month/year. Phone and
// desktop use different scales (desktop cells are tall enough for named
// task bars) — each mode's numbers stay constant, so scroll math holds.
const MONTH_HEADER_HEIGHT = 44;
const WEEKDAY_ROW_HEIGHT = 24;
const MONTH_BOTTOM_GAP = 24;
const YEAR_TITLE_HEIGHT = 44;
const YEAR_GRID_GAP = 12;
const YEAR_BOTTOM_GAP = 24;

function getGeometry(isWide: boolean) {
  const dayCellHeight = isWide ? 118 : 68;
  const yearBlockHeight = isWide ? 112 : 84;
  return {
    dayCellHeight,
    monthItemHeight: MONTH_HEADER_HEIGHT + WEEKDAY_ROW_HEIGHT + 6 * dayCellHeight + MONTH_BOTTOM_GAP,
    yearBlockHeight,
    yearItemHeight: YEAR_TITLE_HEIGHT + 4 * yearBlockHeight + 3 * YEAR_GRID_GAP + YEAR_BOTTOM_GAP,
  };
}

// Scroll ranges around the current date.
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 36;
const YEARS_BACK = 5;
const YEARS_FORWARD = 6;

type MonthItem = { year: number; month: number };

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space, type, isDark, monoFont } = useTheme();
  const barAnchor = useTourAnchor('calendar-bar');
  const yearButtonAnchor = useTourAnchor('calendar-year-button');
  const { width: windowWidth } = useWindowDimensions();
  const { data: tasks } = useTasks();
  const urgencyThresholdHours = useUrgencyThreshold();

  // Desktop/web and iPad: taller day cells showing NAMED task/event bars
  // instead of dots — the extra space is there, use it (developer request
  // 2026-07-11; extended to tablets 2026-08-15).
  const isWide = useWideLayout();
  const { dayCellHeight, monthItemHeight, yearBlockHeight, yearItemHeight } = getGeometry(isWide);
  const MAX_BARS = 3;

  const now = new Date();
  // Reactive across midnight (deferred #13): the today-circle and overdue
  // tinting follow the date without needing an unrelated re-render.
  const today = useToday();
  const todayKey = localDateKey(today);
  // Grid ⇄ week-list toggle (developer request 2026-08-02).
  const [weekView, setWeekView] = useState(false);
  // Week FORMAT (developer spec 2026-08-18): scroll list (the original) or
  // the Google-Calendar-style time grid. Persisted; true = list (default).
  const [weekListFormat, toggleWeekFormat] = useCollapsedSection('ui.weekListFormat');
  const [weekOffset, setWeekOffset] = useState(0);
  // Tapping the week range opens a jump-to-week picker (developer request
  // 2026-08-02). It opens SCROLLED TO the week you're viewing — not the top
  // of the list (developer follow-up).
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const weekPickerScrollRef = useRef<ScrollView>(null);
  // Week-to-week travel is the same full page swipe as the day view
  // (developer direction 2026-08-02): chevrons or a horizontal swipe.
  const weekPager = usePageSlide();
  function goToWeek(delta: number) {
    weekPager.go(delta, () => setWeekOffset((w) => w + delta));
  }
  // Interactive: the list rides the finger; release past ~40% or flick to
  // commit to the next/previous week.
  const weekSwipe = weekPager.panGesture((dir) => setWeekOffset((w) => w + dir));
  const [mode, setMode] = useState<'month' | 'year'>('month');
  // The month the month-list should open at (changed by the year view).
  const [anchor, setAnchor] = useState<MonthItem>({ year: now.getFullYear(), month: now.getMonth() });
  // What's currently visible while scrolling months (top bar + zoom target).
  const [visibleYear, setVisibleYear] = useState(now.getFullYear());
  const visibleMonthRef = useRef<MonthItem>({ year: now.getFullYear(), month: now.getMonth() });

  const byDay = useMemo(() => tasksByDay(tasks ?? []), [tasks]);
  const { data: events } = useEvents();
  const eventDays = useMemo(() => eventsByDay(events ?? []), [events]);

  const monthItems = useMemo<MonthItem[]>(() => {
    const items: MonthItem[] = [];
    for (let offset = -MONTHS_BACK; offset <= MONTHS_FORWARD; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      items.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: YEARS_BACK + YEARS_FORWARD + 1 }, (_, i) => current - YEARS_BACK + i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anchorIndex = monthItems.findIndex((m) => m.year === anchor.year && m.month === anchor.month);

  // Month ↔ year cross-zoom (developer request): the outgoing view scales
  // toward/away from the viewer and fades, the incoming view arrives from
  // the opposite scale — both ANCHORED on the specific month (the tapped
  // block going in; the month's spot in the year grid going out), so the
  // zoom visibly targets that month rather than the screen center.
  const viewScale = useSharedValue(1);
  const viewOpacity = useSharedValue(1);
  const originX = useSharedValue(-1); // -1 = center
  const originY = useSharedValue(-1);
  const zoomStyle = useAnimatedStyle(() => ({
    opacity: viewOpacity.value,
    // NaN guard: 'NaNpx' tokens make reanimated's web parser throw
    // "Transform origin must have exactly 3 values" (developer repro:
    // week-view round-trip during the tour).
    transformOrigin:
      !isFinite(originX.value) || originX.value < 0
        ? '50% 50% 0'
        : `${originX.value}px ${originY.value}px 0`,
    transform: [{ scale: viewScale.value }],
  }));

  // The pending switch lives in a ref: runOnJS can only marshal plain data
  // across the UI-thread boundary — a callback passed as an argument arrives
  // as a dead object ("apply is not a function"). The incoming animation is
  // NOT started here: it waits for the new view's first layout (see
  // onIncomingLayout), otherwise the OLD view flashes back for the frames
  // React needs to mount the new list.
  const pendingSwitch = useRef<{ next: 'month' | 'year'; inScale: number; apply?: () => void } | null>(null);
  const awaitingIncomingLayout = useRef(false);

  function switchMode(
    next: 'month' | 'year',
    zoom: 'in' | 'out',
    origin: { x: number; y: number } | null,
    apply?: () => void
  ) {
    const outScale = zoom === 'in' ? 1.4 : 0.7;
    pendingSwitch.current = { next, inScale: zoom === 'in' ? 0.7 : 1.4, apply };
    // Sanitize: a NaN origin would poison the transformOrigin string.
    const safeOrigin =
      origin && Number.isFinite(origin.x) && Number.isFinite(origin.y) ? origin : null;
    originX.value = safeOrigin?.x ?? -1;
    originY.value = safeOrigin?.y ?? -1;
    // The tour's zoom-out / zoom-back-in steps advance on these.
    emitTourEvent(next === 'year' ? 'calendar-year-open' : 'calendar-month-open');
    viewOpacity.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) });
    viewScale.value = withTiming(outScale, { duration: 150, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(finishSwitch)();
    });
  }

  function finishSwitch() {
    const pending = pendingSwitch.current;
    pendingSwitch.current = null;
    if (!pending) return;
    pending.apply?.();
    // Park the incoming view at its starting scale, still invisible; the
    // fade/zoom-in starts when it has actually laid out.
    viewScale.value = pending.inScale;
    viewOpacity.value = 0;
    awaitingIncomingLayout.current = true;
    setMode(pending.next);
  }

  function onIncomingLayout() {
    if (!awaitingIncomingLayout.current) return;
    awaitingIncomingLayout.current = false;
    viewScale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    viewOpacity.value = withTiming(1, { duration: 200 });
  }

  // Where the zoom container starts vertically (below the safe area + top
  // bar) — page touch coordinates get converted into container coordinates.
  const CONTAINER_TOP = insets.top + 38;

  /** Estimated center of month `m`'s block in the year grid (the target
   *  year sits at the top of the list after the switch). Content is centered
   *  at CONTENT_MAX_WIDTH on desktop, so wide screens offset accordingly. */
  function yearBlockCenter(m: number): { x: number; y: number } {
    const col = m % 3;
    const row = Math.floor(m / 3);
    const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH);
    const offsetLeft = Math.max(0, (windowWidth - contentWidth) / 2);
    const x = offsetLeft + 16 + (col + 0.5) * ((contentWidth - 32) / 3);
    const y = YEAR_TITLE_HEIGHT + row * (yearBlockHeight + YEAR_GRID_GAP) + yearBlockHeight / 2;
    return { x, y };
  }

  const onViewableMonthsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.item as MonthItem | undefined;
    if (first) {
      setVisibleYear(first.year);
      visibleMonthRef.current = first;
    }
  });

  function statusDotColor(task: Task): string {
    const status = deriveStatus(task, { urgencyThresholdHours });
    if (status === 'overdue') return colors.statusOverdueAccent;
    if (status === 'urgent') return colors.statusUrgentAccent;
    if (status === 'completed') return colors.textTertiary;
    return colors.statusOngoingAccent;
  }

  /** Desktop bars carry the status the dots carry on the phone: status
   *  surface as the bar fill, status accent as a left tick. */
  function taskBarColors(task: Task): { bg: string; fg: string; accent: string; done: boolean } {
    const status = deriveStatus(task, { urgencyThresholdHours });
    if (status === 'overdue')
      return { bg: colors.statusOverdueBg, fg: colors.textPrimary, accent: colors.statusOverdueAccent, done: false };
    if (status === 'urgent')
      return { bg: colors.statusUrgentBg, fg: colors.textPrimary, accent: colors.statusUrgentAccent, done: false };
    if (status === 'completed')
      return { bg: colors.surfaceSunken, fg: colors.textTertiary, accent: colors.textTertiary, done: true };
    return { bg: colors.statusOngoingBg, fg: colors.textPrimary, accent: colors.statusOngoingAccent, done: false };
  }

  function renderDayCell(date: Date | null, index: number, isCurrentMonth: boolean) {
    if (!date) {
      // borderColor must match the real cells — dayCell has a hairline top
      // border, and an unset color paints it BLACK (the dark line segments
      // over leading/trailing blank days caught in the 2026-07-16 audit).
      return (
        <View
          key={`blank-${index}`}
          style={[styles.dayCell, { height: dayCellHeight, borderColor: colors.borderSubtle }]}
        />
      );
    }
    const key = localDateKey(date);
    const dayTasks = byDay.get(key) ?? [];
    const dayEvents = eventDays.get(key);
    const isToday = key === todayKey;
    const hasOverdue = dayTasks.some((t) => deriveStatus(t) === 'overdue');
    return (
      <Pressable
        key={key}
        onPress={(event) =>
          router.push({
            pathname: '/day/[date]',
            params: {
              date: key,
              // Touch position anchors the day page's zoom-in.
              ax: String(Math.round(event.nativeEvent.pageX)),
              ay: String(Math.round(event.nativeEvent.pageY)),
            },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${date.toDateString()}, ${dayTasks.length} tasks`}
        style={[
          styles.dayCell,
          { height: dayCellHeight, borderColor: colors.borderSubtle },
          isWide && styles.dayCellWide,
        ]}>
        {/* Overdue tint as an INSET layer, not a cell background — full-bleed
            fills on adjacent days merged into one red blob (developer report
            2026-08-18). Absolute inset keeps the fixed grid geometry (scroll
            math) untouched. */}
        {hasOverdue && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 2,
              bottom: 2,
              left: 2,
              right: 2,
              backgroundColor: colors.statusOverdueBg,
              borderRadius: 8,
            }}
          />
        )}
        <View style={[styles.dayNumberWrap, isToday && { backgroundColor: colors.accent, borderRadius: 999 }]}>
          {/* Only the CURRENT month's days are full-color; every other
              month's days are greyed (developer pick — orientation while
              scrolling). Font scaling is clamped: the grid's geometry is
              fixed (scroll math), so text can't be allowed to break it. */}
          <Text
            maxFontSizeMultiplier={1.4}
            style={{
              fontSize: 15,
              lineHeight: 20,
              fontWeight: isToday ? '600' : '500',
              color: isToday
                ? colors.textOnAccent
                : isCurrentMonth
                  ? colors.textPrimary
                  : colors.textTertiary,
            }}>
            {date.getDate()}
          </Text>
        </View>
        {isWide ? (
          // Desktop: named bars — events first (dashed outline in the event
          // color, matching the event cards), then tasks (status-tinted).
          <View style={styles.barsColumn}>
            {(dayEvents ?? []).slice(0, MAX_BARS).map((e) => (
              <View
                key={`e-${e.id}`}
                style={[styles.bar, styles.eventBar, { borderColor: e.color ?? colors.statusEventAccent }]}>
                {/* Border keeps the raw event color; the TEXT is pushed to a
                    much darker shade of the same hue in light mode (7:1 —
                    developer request 2026-07-22: pale bar text was hard to
                    read on white). Dark mode keeps the 4.5:1 lightened text. */}
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  style={[
                    styles.barText,
                    {
                      color: readableTextColor(
                        e.color ?? colors.statusEventAccent,
                        isDark,
                        isDark ? 4.5 : 7
                      ),
                    },
                  ]}>
                  {e.title}
                </Text>
              </View>
            ))}
            {dayTasks.slice(0, Math.max(0, MAX_BARS - (dayEvents?.length ?? 0))).map((t) => {
              const bar = taskBarColors(t);
              return (
                <View
                  key={t.id}
                  style={[styles.bar, { backgroundColor: bar.bg, borderLeftWidth: 2, borderLeftColor: bar.accent }]}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={[
                      styles.barText,
                      { color: bar.fg },
                      bar.done && { textDecorationLine: 'line-through' },
                    ]}>
                    {t.title}
                  </Text>
                </View>
              );
            })}
            {(dayEvents?.length ?? 0) + dayTasks.length > MAX_BARS && (
              <Text maxFontSizeMultiplier={1.2} style={[styles.barText, { color: colors.textTertiary, paddingHorizontal: 4 }]}>
                +{(dayEvents?.length ?? 0) + dayTasks.length - MAX_BARS} more
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.dotRow}>
            {/* Events are visually distinct: hollow ring vs solid task dots
                (ring takes the day's first event color). One ring/3 dots
                can't say HOW MANY (developer request 2026-07-22) — tiny mono
                counts sit beside them: blue after the ring when 2+ events,
                grey overflow count after the dots when 4+ tasks. */}
            {dayEvents && dayEvents.length > 0 && (
              <View
                style={[styles.eventRing, { borderColor: dayEvents[0].color ?? colors.statusEventAccent }]}
              />
            )}
            {(dayEvents?.length ?? 0) > 1 && (
              <Text style={[styles.dotCount, { color: colors.statusEventAccent }]}>
                {dayEvents?.length}
              </Text>
            )}
            {dayTasks.slice(0, 3).map((t) => (
              <View key={t.id} style={[styles.dot, { backgroundColor: statusDotColor(t) }]} />
            ))}
            {dayTasks.length > 3 && (
              <Text style={[styles.dotCount, { color: colors.textTertiary }]}>
                +{dayTasks.length - 3}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    );
  }

  function renderMonth({ item }: { item: MonthItem }) {
    const isCurrentMonth = item.year === now.getFullYear() && item.month === now.getMonth();
    const weeks = buildMonthMatrix(item.year, item.month, true);
    return (
      <View style={{ height: monthItemHeight }}>
        {/* Current month reads full-color; all others grey — the scroll
            position IS the navigation, so color marks "you are here". */}
        <Text
          maxFontSizeMultiplier={1.4}
          style={[
            type.h2,
            styles.monthHeader,
            { color: isCurrentMonth ? colors.accent : colors.textTertiary },
          ]}>
          {MONTH_NAMES[item.month]} {item.year}
        </Text>
        <View style={styles.weekRow}>
          {(isWide ? WEEKDAY_LABELS_WIDE : WEEKDAY_LABELS).map((label, i) => (
            <Text
              key={i}
              maxFontSizeMultiplier={1.4}
              style={[type.caption, styles.weekdayLabel, { color: colors.textTertiary }]}>
              {label}
            </Text>
          ))}
        </View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((date, i) => renderDayCell(date, i, isCurrentMonth))}
          </View>
        ))}
      </View>
    );
  }

  function monthTaskCount(year: number, month: number): number {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    let count = 0;
    for (const [key, list] of byDay) {
      if (key.startsWith(prefix)) count += list.length;
    }
    return count;
  }

  function renderYear({ item: year }: { item: number }) {
    const isCurrentYear = year === now.getFullYear();
    return (
      <View style={{ height: yearItemHeight }}>
        <Text
          style={[
            type.h1,
            { height: YEAR_TITLE_HEIGHT, color: isCurrentYear ? colors.accent : colors.textTertiary },
          ]}>
          {year}
        </Text>
        <View style={[styles.monthGrid, { gap: YEAR_GRID_GAP }]}>
          {MONTH_NAMES.map((name, m) => {
            const isCurrent = isCurrentYear && m === now.getMonth();
            const count = monthTaskCount(year, m);
            return (
              <Pressable
                key={name}
                onPress={(event) => {
                  const origin = {
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY - CONTAINER_TOP,
                  };
                  switchMode('month', 'in', origin, () => {
                    setAnchor({ year, month: m });
                    setVisibleYear(year);
                    visibleMonthRef.current = { year, month: m };
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={`${name} ${year}, ${count} tasks`}
                style={[
                  styles.monthBlock,
                  {
                    height: yearBlockHeight,
                    backgroundColor: colors.surfaceElevated,
                    borderColor: isCurrent ? colors.accent : colors.borderSubtle,
                    borderWidth: isCurrent ? 1.5 : 1,
                    padding: space.s3,
                  },
                ]}>
                {/* Past/future YEARS read grey; only the current year's
                    months are full-color (developer pick). */}
                <Text
                  maxFontSizeMultiplier={1.4}
                  style={[type.h2, { color: isCurrentYear ? colors.textPrimary : colors.textTertiary }]}>
                  {name.slice(0, 3)}
                </Text>
                <Text maxFontSizeMultiplier={1.4} style={[type.caption, { color: colors.textTertiary }]}>
                  {count === 0 ? '—' : `${count} task${count === 1 ? '' : 's'}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <TabPage>
    <View style={[styles.screen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View ref={barAnchor.ref} onLayout={barAnchor.onLayout} style={[styles.topBar, pageContent, { paddingHorizontal: space.s4, paddingVertical: space.s2 }]}>
        {mode === 'month' ? (
          <Pressable
            ref={yearButtonAnchor.ref}
            onLayout={yearButtonAnchor.onLayout}
            onPress={() => {
              const visible = visibleMonthRef.current;
              if (weekView) {
                // From the week LIST there's no month grid on screen to zoom
                // out of — leave week view and arrive at years with a
                // centered zoom (a cell-anchored origin here pointed at an
                // unmounted grid and threw on web; developer report).
                setWeekView(false);
                switchMode('year', 'out', null, () => {
                  setAnchor(visible);
                });
                return;
              }
              switchMode('year', 'out', yearBlockCenter(visible.month), () => {
                setAnchor(visible);
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Show year view"
            style={styles.yearButton}>
            <IconSymbol name="chevron.left" size={16} color={colors.accent} />
            <Text style={[type.body, { color: colors.accent, fontWeight: '600' }]}>{visibleYear}</Text>
          </Pressable>
        ) : (
          <Text style={[type.body, { color: colors.textSecondary }]}>Years</Text>
        )}
        <View style={styles.topBarActions}>
          {/* Week toggle + import share one tour anchor ("Week list and
              imports" step rings both). */}
          <TourAnchor id="calendar-tools">
            <View style={styles.topBarActions}>
              {/* Week view ⇄ month (developer request 2026-08-02). */}
              <Pressable
                onPress={() => setWeekView((w) => !w)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityState={{ selected: weekView }}
                accessibilityLabel={weekView ? 'Show month grid' : 'Show week view'}>
                <IconSymbol
                  name={weekView ? 'calendar' : 'calendar.day.timeline.left'}
                  size={24}
                  color={colors.accent}
                />
              </Pressable>
              {/* Week FORMAT toggle — only while week view is active
                  (developer spec 2026-08-18). */}
              {weekView && (
                <Pressable
                  onPress={toggleWeekFormat}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    weekListFormat ? 'Show the week as a time grid' : 'Show the week as a list'
                  }>
                  <IconSymbol
                    name={weekListFormat ? 'square.grid.2x2' : 'list.bullet'}
                    size={24}
                    color={colors.accent}
                  />
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/add-event')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Add an event">
                <IconSymbol name="plus" size={24} color={colors.accent} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/import-events')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Import calendar events">
                <IconSymbol name="tray.and.arrow.down" size={24} color={colors.accent} />
              </Pressable>
            </View>
          </TourAnchor>
          <ThemeToggleButton />
        </View>
      </View>

      {weekView && weekPickerOpen && renderWeekPicker()}
      {weekView ? (
        renderWeekList()
      ) : (
      <Animated.View style={[styles.zoomContainer, zoomStyle]}>
      {mode === 'month' ? (
        <FlatList
          // isWide in the key: crossing the desktop breakpoint changes row
          // geometry, so the list must remount to re-apply scroll math.
          key={`months-${anchor.year}-${anchor.month}-${isWide ? 'wide' : 'narrow'}`}
          data={monthItems}
          renderItem={renderMonth}
          keyExtractor={(item) => `${item.year}-${item.month}`}
          getItemLayout={(_, index) => ({
            length: monthItemHeight,
            offset: monthItemHeight * index,
            index,
          })}
          initialScrollIndex={Math.max(0, anchorIndex)}
          onViewableItemsChanged={onViewableMonthsChanged.current}
          viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
          onLayout={onIncomingLayout}
          showsVerticalScrollIndicator={false}
          // Tight windowing: the default (~10 screens of months, 42 cells
          // each) kept THOUSANDS of native views mounted, and attaching/
          // detaching them on tab focus was the entering/leaving lag the
          // developer reported (2026-08-26). getItemLayout means blank
          // fill-in during a fast fling is brief.
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s6 }]}
        />
      ) : (
        <FlatList
          data={years}
          renderItem={renderYear}
          keyExtractor={(year) => String(year)}
          getItemLayout={(_, index) => ({
            length: yearItemHeight,
            offset: yearItemHeight * index,
            index,
          })}
          initialScrollIndex={years.indexOf(visibleYear) >= 0 ? years.indexOf(visibleYear) : YEARS_BACK}
          onLayout={onIncomingLayout}
          showsVerticalScrollIndicator={false}
          // Same tight windowing as the month list (tab-focus lag fix).
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s6 }]}
        />
      )}
      </Animated.View>
      )}
    </View>
    </TabPage>
  );

  // ------------------------- Week list view -------------------------
  // All 7 days of a week down the page: each day's schedule (events) first,
  // tasks beneath (developer design 2026-08-02). Tap a day header to open
  // the normal day timeline; ‹ › move whole weeks.
  function renderWeekList() {
    const days = weekDates(today, weekOffset);
    const first = days[0];
    const last = days[6];
    const rangeLabel = `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const weekNav = (
      <View style={[styles.weekNav, { paddingVertical: space.s2 }]}>
          <Pressable
            onPress={() => goToWeek(-1)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous week">
            <IconSymbol name="chevron.left" size={20} color={colors.accent} />
          </Pressable>
          <Pressable
            onPress={() => setWeekPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick a week">
            <Text style={[type.h2, { color: weekOffset === 0 ? colors.textPrimary : colors.accent }]}>
              {rangeLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => goToWeek(1)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next week">
            <IconSymbol name="chevron.right" size={20} color={colors.accent} />
          </Pressable>
        </View>
    );

    // The GRID format (developer spec 2026-08-18): Google-Calendar-style 7
    // columns over a shared time axis. It scrolls itself, so it lives
    // OUTSIDE any ScrollView; the swipe pager wraps both formats.
    if (!weekListFormat) {
      return (
        <GestureDetector gesture={weekSwipe}>
        <Animated.View nativeID="week-pager" style={[styles.zoomContainer, weekPager.style]}>
          <View style={[styles.zoomContainer, pageContent, { paddingHorizontal: space.s4 }]}>
            {weekNav}
            <WeekGrid
              days={days}
              tasksByDayKey={byDay}
              eventsByDayKey={eventDays}
              todayKey={todayKey}
              urgencyThresholdHours={urgencyThresholdHours}
              isWide={isWide}
              onPressTask={(id) => router.push({ pathname: '/task/[id]', params: { id: String(id) } })}
              onPressEvent={(id) => router.push({ pathname: '/event/[id]', params: { id: String(id) } })}
              onPressDay={(date, pageX, pageY) =>
                router.push({
                  pathname: '/day/[date]',
                  params: {
                    date: localDateKey(date),
                    ax: String(Math.round(pageX)),
                    ay: String(Math.round(pageY)),
                  },
                })
              }
            />
          </View>
        </Animated.View>
        </GestureDetector>
      );
    }

    return (
      <GestureDetector gesture={weekSwipe}>
      <Animated.View nativeID="week-pager" style={[styles.zoomContainer, weekPager.style]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s6 }]}>
        {weekNav}

        {days.map((date) => {
          const key = localDateKey(date);
          const dayTasks = (byDay.get(key) ?? []).filter((t) => !t.deletedAt);
          const dayEvents = (eventDays.get(key) ?? []).slice().sort((a, b) => a.start.getTime() - b.start.getTime());
          const isToday = key === todayKey;
          return (
            <View key={key} style={{ marginBottom: space.s3 }}>
              <Pressable
                onPress={(event) =>
                  router.push({
                    pathname: '/day/[date]',
                    params: {
                      date: key,
                      ax: String(Math.round(event.nativeEvent.pageX)),
                      ay: String(Math.round(event.nativeEvent.pageY)),
                    },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Open ${date.toDateString()}`}
                style={[styles.weekDayHeader, { borderBottomColor: isToday ? colors.accent : colors.borderSubtle }]}>
                <Text style={[type.h2, { color: isToday ? colors.accent : colors.textPrimary }]}>
                  {date.toLocaleDateString(undefined, { weekday: 'long' })}
                </Text>
                <Text style={{ fontFamily: monoFont, fontSize: 12, color: isToday ? colors.accent : colors.textTertiary }}>
                  {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>

              {dayEvents.length === 0 && dayTasks.length === 0 ? (
                <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400', paddingVertical: space.s2 }]}>
                  Nothing scheduled.
                </Text>
              ) : (
                <View style={{ gap: 6, paddingTop: space.s2 }}>
                  {dayEvents.map((e) => (
                    <Pressable
                      key={`e-${e.id}`}
                      onPress={() => router.push(`/event/${e.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Event ${e.title}`}
                      style={[styles.weekRowItem, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                      <View style={[styles.weekRowBar, { backgroundColor: e.color ?? colors.statusEventAccent }]} />
                      <Text numberOfLines={1} style={[type.body, { color: colors.textPrimary, flex: 1 }]}>
                        {e.title}
                      </Text>
                      <Text style={{ fontFamily: monoFont, fontSize: 11, color: readableTextColor(e.color ?? colors.statusEventAccent, isDark, isDark ? 4.5 : 7) }}>
                        {e.allDay
                          ? 'All day'
                          : e.end
                            ? `${e.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${e.end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                            : e.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </Pressable>
                  ))}
                  {dayTasks.map((t) => {
                    const bar = taskBarColors(t);
                    return (
                      <Pressable
                        key={`t-${t.id}`}
                        onPress={() => router.push(`/task/${t.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`Task ${t.title}`}
                        style={[styles.weekRowItem, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderSubtle }]}>
                        <View style={[styles.weekRowBar, { backgroundColor: bar.accent }]} />
                        <Text
                          numberOfLines={1}
                          style={[
                            type.body,
                            {
                              color: bar.done ? colors.textTertiary : colors.textPrimary,
                              textDecorationLine: bar.done ? 'line-through' : 'none',
                              flex: 1,
                            },
                          ]}>
                          {t.title}
                        </Text>
                        <Text style={{ fontFamily: monoFont, fontSize: 11, color: colors.textTertiary }}>
                          {t.dueDate?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      </Animated.View>
      </GestureDetector>
    );
  }

  // Jump-to-week picker: a light overlay listing nearby weeks. Picking one
  // rides the same page-slide as the chevrons.
  function renderWeekPicker() {
    const offsets = Array.from({ length: 29 }, (_, i) => i - 8); // 8 back, 20 ahead
    const ROW_HEIGHT = 44;
    const relativeLabel = (o: number) =>
      o === 0 ? 'This week' : o === 1 ? 'Next week' : o === -1 ? 'Last week' : null;
    return (
      <View style={[StyleSheet.absoluteFill, styles.pickerRoot]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
          onPress={() => setWeekPickerOpen(false)}
          accessibilityLabel="Close week picker"
        />
        <View
          style={[
            styles.pickerCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.borderSubtle,
              borderRadius: 16,
              paddingVertical: space.s2,
            },
          ]}>
          <ScrollView
            ref={weekPickerScrollRef}
            showsVerticalScrollIndicator={false}
            onLayout={(event) => {
              // Center the CURRENT week in the viewport on open.
              const viewport = event.nativeEvent.layout.height;
              const index = weekOffset + 8;
              weekPickerScrollRef.current?.scrollTo({
                y: Math.max(0, index * ROW_HEIGHT - viewport / 2 + ROW_HEIGHT / 2),
                animated: false,
              });
            }}>
            {offsets.map((o) => {
              const days = weekDates(today, o);
              const label = `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
              const relative = relativeLabel(o);
              const selected = o === weekOffset;
              return (
                <Pressable
                  key={o}
                  onPress={() => {
                    setWeekPickerOpen(false);
                    goToWeek(o - weekOffset);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Week of ${label}`}
                  style={({ pressed }) => [
                    styles.pickerRow,
                    {
                      paddingHorizontal: space.s4,
                      backgroundColor: selected
                        ? colors.surfaceSunken
                        : pressed
                          ? colors.surface
                          : 'transparent',
                    },
                  ]}>
                  <Text
                    style={[
                      type.body,
                      {
                        color: selected ? colors.accent : colors.textPrimary,
                        fontWeight: selected ? '600' : '400',
                      },
                    ]}>
                    {label}
                  </Text>
                  {relative && (
                    <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400' }]}>
                      {relative}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  zoomContainer: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekDayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    paddingBottom: 4,
  },
  weekRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingRight: 10,
    minHeight: 40,
    overflow: 'hidden',
  },
  weekRowBar: { width: 3, alignSelf: 'stretch' },
  pickerRoot: {
    zIndex: 100,
    elevation: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerCard: {
    borderWidth: 1,
    width: '100%',
    maxWidth: 360,
    maxHeight: '62%',
  },
  pickerRow: {
    // Fixed height — the open-centered scroll math depends on it.
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  monthHeader: {
    height: MONTH_HEADER_HEIGHT,
    textAlignVertical: 'center',
    paddingTop: 12,
  },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center', height: WEEKDAY_ROW_HEIGHT, paddingTop: 4 },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Desktop: bars stretch the cell's full width; the number stays centered.
  dayCellWide: {
    alignItems: 'stretch',
  },
  dayNumberWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  barsColumn: {
    width: '100%',
    paddingHorizontal: 3,
    gap: 2,
  },
  bar: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  eventBar: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  barText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotCount: { fontSize: 9, lineHeight: 10, fontWeight: '600' },
  eventRing: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthBlock: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 16,
    gap: 2,
  },
});
