// Day drill-down from the calendar: that day's tasks as the familiar
// swipeable cards. Presented as a transparent route with a ZOOM transition
// (developer request): the page scales up from the calendar on entry and
// scales back down on exit. Custom header (no native back-swipe — the zoom
// replaces the native push animation).
import { StackActions, useRoute } from '@react-navigation/native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DayTimeline, DAY_TIMELINE_PX_PER_HOUR } from '@/components/day-timeline';
import { EventCard } from '@/components/event-card';
import { SwipeableTaskCard } from '@/components/swipeable-task-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTaskActions } from '@/hooks/use-task-actions';
import { usePageSlide } from '@/hooks/use-page-slide';
import { useToday } from '@/hooks/use-today';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { useWideLayout } from '@/hooks/use-wide-layout';
import { clearEnterMark, getEnterFrom } from '@/lib/enter-marks';
import { useEvents } from '@/lib/events/use-events';
import { localDateKey, parseDateKey } from '@/lib/tasks/calendar';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { useTasks } from '@/lib/tasks/use-tasks';
import { CONTENT_MAX_WIDTH, pageContent } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

export default function DayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const routeKey = useRoute().key;
  const insets = useSafeAreaInsets();
  const { date, ax, ay } = useLocalSearchParams<{ date: string; ax?: string; ay?: string }>();
  const { colors, space, type } = useTheme();
  const { data: tasks } = useTasks();
  const { handleSwipeRight, handleSwipeLeft } = useTaskActions();
  const urgencyThresholdHours = useUrgencyThreshold();
  const today = useToday();

  const day = useMemo(() => parseDateKey(date ?? localDateKey(new Date())), [date]);

  // Zoom anchor: the tapped day cell's screen position (the route fills the
  // whole window, so page coordinates are container coordinates).
  const anchorX = Number(ax);
  const anchorY = Number(ay);
  const hasAnchor = Number.isFinite(anchorX) && Number.isFinite(anchorY);

  const dayTasks = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => !t.deletedAt && t.dueDate && localDateKey(t.dueDate) === date)
        .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)),
    [tasks, date]
  );

  const { data: events } = useEvents();
  const dayEvents = useMemo(
    () =>
      (events ?? [])
        .filter((e) => localDateKey(e.start) === date)
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events, date]
  );

  // Zoom in on entry, zoom back out on exit — anchored on the tapped cell,
  // so the page visibly grows out of (and shrinks back into) that day.
  const START_SCALE = hasAnchor ? 0.5 : 0.85;
  const scale = useSharedValue(START_SCALE);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag-down-to-dismiss from the header (restores a standard escape gesture
  // after the zoom transition replaced the native back-swipe — HIG audit).
  const dragY = useSharedValue(0);
  const { height: windowHeight } = useWindowDimensions();

  // Desktop/web and iPad: two-pane timeline in a centered column; the exposed
  // gutters TAP to dismiss (developer request 2026-07-11) and descriptions
  // show inline — the space exists on a laptop or a tablet, so use it.
  const isWide = useWideLayout();

  const zoomStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transformOrigin: hasAnchor ? `${anchorX}px ${anchorY}px 0` : '50% 50% 0',
    transform: [{ translateY: dragY.value }, { scale: scale.value }],
  }));

  // Once closing: stop eating clicks immediately, and NEVER let navigation
  // wait on an animation callback — on web, scaling this whole page tree
  // (hour grid + dozens of absolutely-positioned blocks) can stall the JS
  // thread so badly the completion callback fires seconds late, or frames
  // drop entirely and there's no fade at all (developer report 2026-07-23).
  const [dismissing, setDismissing] = useState(false);
  const closeStarted = useRef(false);

  function goBack() {
    // Pop THIS route by key — the user may already be somewhere new.
    navigation.dispatch({ ...StackActions.pop(1), source: routeKey });
  }

  function close() {
    if (closeStarted.current) return;
    closeStarted.current = true;
    setDismissing(true);
    if (Platform.OS === 'web') {
      // Cheap fade only (no full-tree scale), and navigation on a TIMER so a
      // janked frame can't hold the exit hostage.
      opacity.value = withTiming(0, { duration: 120 });
      setTimeout(goBack, 130);
      return;
    }
    scale.value = withTiming(START_SCALE, { duration: 220, easing: Easing.in(Easing.cubic) });
    opacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(goBack)();
    });
  }

  // The ENTIRE page is the drag surface (developer request). The pan runs
  // simultaneously with the inner scroll but only engages while the list sits
  // at the top — mid-list, dragging scrolls as normal. `dragBase` marks where
  // in the gesture the list reached the top, so the page never jumps.
  const scrollTop = useSharedValue(0);
  const dragBase = useSharedValue(-1);
  // Dismissal is only offered when the drag BEGAN with the list at the top
  // (developer 2026-09-09) — scrolling up from mid-list used to hand the
  // tail of the same gesture to the dismiss pan, yanking the page down.
  const startedAtTop = useSharedValue(false);
  const scrollGesture = Gesture.Native();

  const pagePan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-14, 14]) // horizontal stays with the card swipes
    .simultaneousWithExternalGesture(scrollGesture)
    .onStart(() => {
      dragBase.value = -1;
      startedAtTop.value = scrollTop.value <= 0.5;
    })
    .onUpdate((event) => {
      if (startedAtTop.value && scrollTop.value <= 0.5 && event.translationY > 0) {
        if (dragBase.value < 0) dragBase.value = event.translationY;
        dragY.value = Math.max(0, event.translationY - dragBase.value);
      } else {
        dragBase.value = -1;
        dragY.value = 0;
      }
    })
    .onEnd((event) => {
      if (dragY.value > 120 || (dragY.value > 30 && event.velocityY > 800)) {
        // Continue the slide off the bottom, then pop.
        dragY.value = withTiming(windowHeight, { duration: 220, easing: Easing.in(Easing.cubic) });
        opacity.value = withTiming(0, { duration: 220 }, (finished) => {
          if (finished) runOnJS(goBack)();
        });
      } else {
        dragY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  // With the axis at true 24h scale (no compression bands), a day's content
  // can live well below the fold — open scrolled to the first item, capped
  // at 7 AM (the week grid's opening hour). Empty days stay at the top so
  // the "Nothing due" message is the first thing seen. Phones only: the
  // wide layout's task pane starts at the top already.
  const scrollRef = useRef<ScrollView>(null);
  const initialScrollY = useMemo(() => {
    if (isWide) return 0;
    const hours = [
      ...dayEvents.filter((e) => !e.allDay).map((e) => e.start.getHours()),
      ...dayTasks.filter((t) => t.dueDate).map((t) => t.dueDate!.getHours()),
    ];
    if (hours.length === 0) return 0;
    return Math.min(7, ...hours) * DAY_TIMELINE_PX_PER_HOUR;
  }, [isWide, dayEvents, dayTasks]);

  // Keyed on initialScrollY too, NOT just mount: on a cold load the task and
  // event queries resolve after the first render, so the target is 0 until
  // data lands (and the timeline has no height to scroll into yet). Once per
  // shown day — later refetches must never yank the user's scroll position.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (scrolledFor.current === (date ?? null) || initialScrollY <= 0) return;
    const timer = setTimeout(() => {
      scrolledFor.current = date ?? null;
      scrollRef.current?.scrollTo({ y: initialScrollY, animated: false });
      // Mirror into the drag-dismiss gate in case onScroll skips the
      // programmatic jump — a stale 0 would offer dismissal mid-list.
      scrollTop.value = initialScrollY;
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, initialScrollY]);

  const title = day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  // Prev/next day: update the route param in place — the screen stays
  // mounted (no re-zoom), everything derived from `date` recomputes.
  // Day-to-day travel is a full page swipe (developer direction 2026-08-02):
  // the current day exits off-screen the way you're going, the next enters
  // from the opposite edge. Shared motion with the calendar's week view.
  const pager = usePageSlide();

  function goToDay(delta: number) {
    const next = new Date(day);
    next.setDate(next.getDate() + delta);
    pager.go(delta, () => router.setParams({ date: localDateKey(next) }));
  }

  // Phones: swipe the page horizontally to change days. Wide layouts keep
  // arrows only — task cards there swipe horizontally themselves, and two
  // horizontal gestures on one surface fight.
  // Interactive: the page rides the finger (homescreen feel); release past
  // ~40% or flick to commit. Phones only — wide layouts' task cards own
  // horizontal swipes.
  const daySwipe = pager
    .panGesture((dir) => {
      const next = new Date(day);
      next.setDate(next.getDate() + dir);
      router.setParams({ date: localDateKey(next) });
    })
    .enabled(!isWide);

  return (
    <Animated.View
      pointerEvents={dismissing ? 'none' : 'auto'}
      style={[styles.screen, zoomStyle, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <GestureDetector gesture={Gesture.Race(daySwipe, pagePan)}>
        <View style={styles.pageFill}>
          {/* Blank space (the side gutters) exits back to the calendar —
              web/desktop only; the content column renders above this. */}
          {isWide && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityLabel="Back to calendar"
            />
          )}
          <View style={[styles.header, pageContent, { paddingHorizontal: space.s4, paddingVertical: space.s2, gap: space.s2 }]}>
            <Pressable
              onPress={close}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to calendar"
              style={styles.backButton}>
              <IconSymbol name="chevron.left" size={20} color={colors.accent} />
              <Text style={[type.body, { color: colors.accent, fontWeight: '600' }]}>Calendar</Text>
            </Pressable>
          </View>
          {/* Everything date-derived (title + timeline) slides as one unit
              when changing days — the header/back button stays put. */}
          <Animated.View style={[styles.dayContent, pager.style]}>
          {/* Title row with prev/next-day arrows (developer request
              2026-08-02); phones can also swipe the page left/right. */}
          <View style={[pageContent, styles.titleRow, { paddingHorizontal: space.s4, paddingBottom: space.s3 }]}>
            <Text style={[type.h1, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.dayNav}>
              <Pressable
                onPress={() => goToDay(-1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Previous day"
                style={[styles.dayNavButton, { borderColor: colors.borderSubtle }]}>
                <IconSymbol name="chevron.left" size={18} color={colors.accent} />
              </Pressable>
              <Pressable
                onPress={() => goToDay(1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Next day"
                style={[styles.dayNavButton, { borderColor: colors.borderSubtle }]}>
                <IconSymbol name="chevron.right" size={18} color={colors.accent} />
              </Pressable>
            </View>
          </View>
          <GestureDetector gesture={scrollGesture}>
            <ScrollView
              ref={scrollRef}
              bounces={false}
              // Wide: the scroller itself is the centered column so clicks
              // beside it land on the dismiss backdrop.
              style={isWide && { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}
              onScroll={(e) => {
                scrollTop.value = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              contentContainerStyle={{ padding: space.s4, paddingTop: 0, gap: space.s3, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}>
              {/* The empty message stays at the TOP (developer 2026-09-09) —
                  on phones the full 24h axis still renders beneath it. */}
              {dayTasks.length === 0 && dayEvents.length === 0 && (
                <Text style={[type.body, { color: colors.textSecondary }]}>Nothing due this day.</Text>
              )}
              {isWide && dayTasks.length === 0 && dayEvents.length === 0 ? null : isWide ? (
                /* Wide screens: two panes — the timeline of EVENTS on the
                   left, tasks as NORMAL full-size cards on the right, ordered
                   by time (developer design 2026-07-22 v2). Panes STRETCH to
                   the row's height and each ends in a grow-to-fill exit
                   Pressable — the empty space under a short pane (e.g. no
                   tasks while the timeline runs long) must dismiss like the
                   gutters do (reported 2026-07-23). */
                <View style={{ flexDirection: 'row', gap: space.s6, alignItems: 'stretch' }}>
                  <View style={{ flex: 45, gap: space.s3 }}>
                    <Text style={[type.h2, { color: colors.textSecondary }]}>Schedule</Text>
                    {dayEvents.filter((e) => e.allDay).map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onPress={(e) => router.push(`/event/${e.id}`)}
                        showNotes
                      />
                    ))}
                    {dayEvents.some((e) => !e.allDay) ? (
                      <DayTimeline
                        variant="eventsOnly"
                        events={dayEvents.filter((e) => !e.allDay)}
                        now={date === localDateKey(today) ? new Date() : null}
                        onPressEvent={(e) => router.push(`/event/${e.id}`)}
                      />
                    ) : (
                      dayEvents.length === 0 && (
                        <Text style={[type.body, { color: colors.textSecondary }]}>No events.</Text>
                      )
                    )}
                    <Pressable
                      onPress={close}
                      accessibilityLabel="Back to calendar"
                      style={{ flexGrow: 1, minHeight: 24 }}
                    />
                  </View>
                  <View style={{ flex: 55, gap: space.s3 }}>
                    <Text style={[type.h2, { color: colors.textSecondary }]}>Tasks</Text>
                    {dayTasks.length === 0 ? (
                      <Text style={[type.body, { color: colors.textSecondary }]}>No tasks due.</Text>
                    ) : (
                      dayTasks.map((task) => (
                        <SwipeableTaskCard
                          key={task.id}
                          task={task}
                          onSwipeRight={handleSwipeRight}
                          onSwipeLeft={handleSwipeLeft}
                          onPress={(t) => router.push(`/task/${t.id}`)}
                          enterFrom={getEnterFrom(task.id)}
                          onEntered={clearEnterMark}
                          showDescription
                        />
                      ))
                    )}
                    <Pressable
                      onPress={close}
                      accessibilityLabel="Back to calendar"
                      style={{ flexGrow: 1, minHeight: 24 }}
                    />
                  </View>
                </View>
              ) : (
                /* Phones: ONE full-width timeline — events and tasks
                   interleaved by time on the full 24h axis, hour lines
                   drawn even where nothing sits (developer 2026-09-09). */
                <>
                  {dayEvents.filter((e) => e.allDay).map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onPress={(e) => router.push(`/event/${e.id}`)}
                    />
                  ))}
                  <DayTimeline
                    variant="merged"
                    events={dayEvents.filter((e) => !e.allDay)}
                    tasks={dayTasks}
                    urgencyThresholdHours={urgencyThresholdHours}
                    now={date === localDateKey(today) ? new Date() : null}
                    onPressEvent={(e) => router.push(`/event/${e.id}`)}
                    onPressTask={(t) => router.push(`/task/${t.id}`)}
                    onToggleTask={handleSwipeRight}
                  />
                </>
              )}
              {/* The leftover space below the last card is also an exit
                  (web/desktop, matching the side gutters). */}
              {isWide && (
                <Pressable
                  onPress={close}
                  accessibilityLabel="Back to calendar"
                  style={{ flexGrow: 1, minHeight: 48 }}
                />
              )}
            </ScrollView>
          </GestureDetector>
          </Animated.View>
        </View>
      </GestureDetector>
      {/* Native modal screens paint above the root overlay — the tour's
          day-timeline steps render from INSIDE this route. */}
      <TourOverlay host="day" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pageFill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayContent: { flex: 1 },
  dayNav: { flexDirection: 'row', gap: 8 },
  dayNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
