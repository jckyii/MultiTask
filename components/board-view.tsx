// The lifestyle BOARD (developer featured idea 2026-09-20) — the Tasks
// list re-sorted Notion-style. Lifestyles are the major groups (real
// subtitles), each subject is a tall column box with its own internal
// scroll, lifestyle-only tasks land in a trailing Miscellaneous column,
// and cards are compact: title + date only, no pills (the column IS the
// context). Desktop lays the groups side by side with horizontal
// scrolling (ctrl+wheel steers it); phones show one column at a time in
// a continuous carousel with a jump bar of every lifestyle and subject.
//
// Completing tunnels the card away: it shrinks into a line of the action
// color which travels down the column's edge (right = complete,
// left = delete) and collapses at the bottom — then the mutation fires.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, Pressable as GHPressable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { SwipeableTaskCard } from '@/components/swipeable-task-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useCollapsedSection } from '@/hooks/use-collapsed-section';
import { useLifestyleCatalog } from '@/hooks/use-lifestyle-catalog';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { animateListChanges } from '@/lib/animate-layout';
import { boardPages, buildBoard, type BoardColumn, type BoardPage } from '@/lib/tasks/board';
import { formatDueDate } from '@/lib/tasks/dates';
import { deriveStatus } from '@/lib/tasks/status';
import type { Task } from '@/lib/tasks/types';
import { useWideLayout } from '@/hooks/use-wide-layout';
import { textOnSolid } from '@/components/pill';
import { useTheme, type Theme } from '@/lib/theme/use-theme';

const isWeb = Platform.OS === 'web';
const COLUMN_WIDTH = 232;
const HEADER_H = 40;

type ActionSide = 'complete' | 'delete';

type Props = {
  tasks: Task[];
  onPressTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  bottomInset: number;
};

// ---------------------------------------------------------------- card

function shortDue(due: Date | null): string {
  if (!due) return 'No due date';
  return formatDueDate(due).replace(/^[A-Za-z]+, /, '');
}

function BoardCard({
  task,
  onPress,
  onAction,
}: {
  task: Task;
  onPress: (task: Task) => void;
  /** Web only — starts the tunnel. Undefined on phones (tap to open,
   *  complete from the task sheet — the carousel owns horizontal). */
  onAction?: (task: Task, side: ActionSide, layoutY: number) => void;
  }) {
  const theme = useTheme();
  const { colors, radius, monoFont } = theme;
  const urgencyThresholdHours = useUrgencyThreshold();
  const status = deriveStatus(task, { urgencyThresholdHours });
  const surfaces = boardSurfaces(theme);
  const { background, accentBar } = surfaces[status];
  const [hovered, setHovered] = useState(false);
  const layoutY = useRef(0);

  // The shrink: the card squashes into a line of the action color, then
  // hands off to the column's travelling dash.
  const squash = useSharedValue(1);
  const fade = useSharedValue(1);
  const [actioned, setActioned] = useState<ActionSide | null>(null);
  const squashStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: squash.value }],
    opacity: fade.value,
  }));

  function act(side: ActionSide) {
    if (!onAction || actioned) return;
    setActioned(side);
    squash.value = withTiming(0.06, { duration: 240, easing: Easing.in(Easing.cubic) });
    // The sliver fades as the column's dash takes over — one line at a time.
    fade.value = withDelay(260, withTiming(0, { duration: 160 }));
    setTimeout(() => onAction(task, side, layoutY.current), 250);
  }

  const hoverProps = isWeb
    ? ({
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      } as Record<string, unknown>)
    : {};

  const actionColor = actioned === 'delete' ? colors.statusOverdueAccent : colors.statusOngoingAccent;

  return (
    <View onLayout={(e) => (layoutY.current = e.nativeEvent.layout.y)} {...hoverProps}>
      <Animated.View
        style={[
          styles.card,
          squashStyle,
          {
            backgroundColor: actioned ? actionColor : background,
            borderColor: colors.borderSubtle,
            borderRadius: radius.tight,
          },
        ]}>
        {accentBar && !actioned && <View style={[styles.cardAccent, { backgroundColor: accentBar }]} />}
        {!actioned && (
          <View style={styles.cardBody}>
            <GHPressable
              onPress={() => onPress(task)}
              accessibilityRole="button"
              accessibilityLabel={`${task.title}, ${shortDue(task.dueDate)}`}
              style={styles.cardPress}>
              <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {task.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: monoFont,
                  fontSize: 10,
                  lineHeight: 14,
                  color:
                    status === 'overdue'
                      ? colors.statusOverdueAccent
                      : status === 'urgent'
                        ? colors.statusUrgentAccent
                        : colors.textSecondary,
                }}>
                {shortDue(task.dueDate)}
              </Text>
            </GHPressable>
            {/* Hover actions (web): complete on the left, delete on the
                right — same sides as the list's edge zones. */}
            {onAction && hovered && (
              <>
                <Pressable
                  onPress={() => act('complete')}
                  accessibilityRole="button"
                  accessibilityLabel={`Complete ${task.title}`}
                  style={[styles.cardAction, { left: 4, backgroundColor: colors.statusOngoingBg }]}>
                  <IconSymbol name="checkmark" size={14} color={colors.statusOngoingAccent} />
                </Pressable>
                <Pressable
                  onPress={() => act('delete')}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${task.title}`}
                  style={[styles.cardAction, { right: 4, backgroundColor: colors.statusOverdueBg }]}>
                  <IconSymbol name="trash.fill" size={13} color={colors.statusOverdueAccent} />
                </Pressable>
              </>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// -------------------------------------------------------------- column

function BoardColumnBox({
  column,
  height,
  width,
  onPressTask,
  onComplete,
  onDelete,
}: {
  column: BoardColumn;
  height: number;
  width?: number;
  onPressTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const { colors, radius, type } = useTheme();
  const scrollOffset = useRef(0);

  // The travelling dash: appears where the card collapsed, slides down the
  // column's edge, and winks out at the bottom — THEN the mutation runs.
  const dashY = useSharedValue(0);
  const dashScale = useSharedValue(0);
  const [dashState, setDashState] = useState<{ side: ActionSide } | null>(null);
  const dashStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dashY.value }, { scale: dashScale.value }],
    opacity: dashScale.value,
  }));

  function fire(task: Task, side: ActionSide) {
    animateListChanges();
    if (side === 'complete') onComplete(task);
    else onDelete(task);
  }

  function startTunnel(task: Task, side: ActionSide, layoutY: number) {
    const startY = Math.max(HEADER_H, Math.min(height - 40, HEADER_H + layoutY - scrollOffset.current));
    setDashState({ side });
    dashY.value = startY;
    dashScale.value = withTiming(1, { duration: 100 });
    dashY.value = withDelay(
      80,
      withTiming(height - 26, { duration: 340, easing: Easing.in(Easing.cubic) })
    );
    dashScale.value = withDelay(
      420,
      withTiming(0, { duration: 140 }, (finished) => {
        if (finished) runOnJS(fire)(task, side);
      })
    );
    setTimeout(() => setDashState(null), 620);
  }

  const empty = column.prioritized.length === 0 && column.rest.length === 0;

  return (
    <View
      style={[
        styles.column,
        {
          height,
          width: width ?? COLUMN_WIDTH,
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.borderSubtle,
          borderRadius: radius.card,
        },
      ]}>
      {/* The subject pill header — Notion-style. Misc reads muted. */}
      <View style={[styles.columnHeader, { height: HEADER_H }]}>
        <View
          style={[
            styles.subjectPill,
            {
              backgroundColor: column.isMisc ? colors.surfaceElevated : `${column.color}55`,
              borderColor: column.isMisc ? colors.borderSubtle : `${column.color}`,
            },
          ]}>
          <Text numberOfLines={1} style={[type.caption, { color: colors.textPrimary }]}>
            {column.title}
          </Text>
        </View>
      </View>

      <ScrollView
        onScroll={(e) => (scrollOffset.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 6, gap: 6, flexGrow: 1 }}>
        {column.prioritized.map((task) => (
          <BoardCard key={task.id} task={task} onPress={onPressTask} onAction={isWeb ? startTunnel : undefined} />
        ))}
        {/* The deliberate breath between the ranked tasks and the rest. */}
        {column.prioritized.length > 0 && (column.rest.length > 0 || !empty) && (
          <View style={{ height: 10 }} />
        )}
        {column.rest.map((task) => (
          <BoardCard key={task.id} task={task} onPress={onPressTask} onAction={isWeb ? startTunnel : undefined} />
        ))}
      </ScrollView>

      {dashState && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dash,
            dashStyle,
            dashState.side === 'complete' ? { right: 5 } : { left: 5 },
            {
              backgroundColor:
                dashState.side === 'complete' ? colors.statusOngoingAccent : colors.statusOverdueAccent,
            },
          ]}
        />
      )}
    </View>
  );
}

// ------------------------------------------------------- bottom groups

function BottomSection({
  title,
  storageKey,
  tasks,
  onComplete,
  onDelete,
  onPressTask,
}: {
  title: string;
  storageKey: string;
  tasks: Task[];
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  onPressTask: (task: Task) => void;
}) {
  const { colors, space, type } = useTheme();
  const [collapsed, toggle] = useCollapsedSection(storageKey);
  if (tasks.length === 0) return null;
  return (
    <View style={{ gap: space.s2 }}>
      <Pressable
        onPress={() => {
          animateListChanges();
          toggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        style={styles.bottomHeader}>
        <Text style={[type.h2, { color: colors.textSecondary }]}>
          {title} ({tasks.length})
        </Text>
        <IconSymbol name={collapsed ? 'chevron.right' : 'chevron.down'} size={16} color={colors.textTertiary} />
      </Pressable>
      {!collapsed &&
        tasks.map((task) => (
          <SwipeableTaskCard
            key={task.id}
            task={task}
            compact
            onSwipeRight={onComplete}
            onSwipeLeft={onDelete}
            onPress={onPressTask}
          />
        ))}
    </View>
  );
}

// ------------------------------------------------------------ the view

export function BoardView({ tasks, onPressTask, onComplete, onDelete, bottomInset }: Props) {
  const { colors, space, type } = useTheme();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isWide = useWideLayout();
  const { catalog } = useLifestyleCatalog();

  const board = useMemo(() => buildBoard(tasks, catalog), [tasks, catalog]);

  // "No lifestyle" rides along as a final single-column group so sorting
  // by lifestyle can never hide a task.
  const pages = useMemo<BoardPage[]>(() => {
    const base = boardPages(board);
    if (board.unsorted.length > 0) {
      base.push({
        lifestyle: { name: 'No lifestyle', color: colors.borderSubtle, columns: [] },
        column: { title: 'Miscellaneous', color: null, isMisc: true, prioritized: [], rest: board.unsorted },
      });
    }
    return base;
  }, [board, colors.borderSubtle]);

  const columnHeight = Math.max(360, Math.min(640, windowHeight - 320));

  // ctrl+wheel steers the horizontal board (developer ask) — plain wheel
  // keeps scrolling whatever it's over.
  const hScrollRef = useRef<ScrollView>(null);
  const hScrollX = useRef(0);
  useEffect(() => {
    if (!isWeb || !isWide) return;
    const node = hScrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.shiftKey) return;
      e.preventDefault();
      hScrollRef.current?.scrollTo({ x: Math.max(0, hScrollX.current + e.deltaY), animated: false });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [isWide]);

  // ------------------------------------------------- phone carousel
  const [pageIndex, setPageIndex] = useState(0);
  const clampedIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const pageX = useSharedValue(0);
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pageX.value }] }));

  // The data swap happens on a TIMER, never in an animation callback —
  // the usePageSlide lesson: a janked frame shortens the motion instead
  // of stranding the navigation.
  function scheduleSwap(dir: 1 | -1, delayMs: number) {
    setTimeout(() => {
      setPageIndex((i) => Math.max(0, Math.min(pages.length - 1, i + dir)));
      pageX.value = 0;
    }, delayMs);
  }

  const carouselPan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const atStart = clampedIndex === 0 && event.translationX > 0;
      const atEnd = clampedIndex === pages.length - 1 && event.translationX < 0;
      pageX.value = atStart || atEnd ? event.translationX * 0.25 : event.translationX;
    })
    .onEnd((event) => {
      const canPrev = clampedIndex > 0;
      const canNext = clampedIndex < pages.length - 1;
      const commit =
        (pageX.value < -windowWidth * 0.3 || event.velocityX < -800) && canNext
          ? -1
          : (pageX.value > windowWidth * 0.3 || event.velocityX > 800) && canPrev
            ? 1
            : 0;
      if (commit !== 0) {
        pageX.value = withTiming(commit * windowWidth, { duration: 200, easing: Easing.out(Easing.cubic) });
        runOnJS(scheduleSwap)(commit === 1 ? -1 : 1, 205);
      } else {
        pageX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  // Jump via the top bar: land beside the target instantly, then one
  // animated slide onto it — the neighbouring content streaks past, which
  // reads as skipping across the cabinet (developer: the homescreen feel).
  function jumpTo(target: number) {
    if (target === clampedIndex || pages.length === 0) return;
    const dir: 1 | -1 = target > clampedIndex ? -1 : 1;
    const staging = Math.max(0, Math.min(pages.length - 1, target + dir));
    setPageIndex(staging);
    setTimeout(() => {
      pageX.value = withTiming(dir * windowWidth, { duration: 240, easing: Easing.out(Easing.cubic) });
    }, 40);
    setTimeout(() => {
      setPageIndex(target);
      pageX.value = 0;
    }, 40 + 245);
  }

  const bottomSections = (
    <View style={{ gap: space.s3, marginTop: space.s4 }}>
      <BottomSection
        title="Completed"
        storageKey="ui.completedCollapsed"
        tasks={board.completed}
        onComplete={onComplete}
        onDelete={onDelete}
        onPressTask={onPressTask}
      />
      <BottomSection
        title="Deleted"
        storageKey="ui.deletedCollapsed"
        tasks={board.deleted}
        onComplete={onComplete}
        onDelete={onDelete}
        onPressTask={onPressTask}
      />
    </View>
  );

  // ------------------------------------------------------- desktop
  if (isWide) {
    return (
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.s4, paddingBottom: bottomInset, maxWidth: 1400, width: '100%', alignSelf: 'center' }}
        showsVerticalScrollIndicator={false}>
        <ScrollView
          ref={hScrollRef}
          horizontal
          onScroll={(e) => (hScrollX.current = e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={32}
          showsHorizontalScrollIndicator
          contentContainerStyle={{ gap: space.s6, paddingBottom: space.s3 }}>
          {board.lifestyles.map((lifestyle) => (
            <View key={lifestyle.name} style={{ gap: space.s2 }}>
              {/* The lifestyle is a REAL subtitle with its color as the
                  underline — the columns below belong to it. */}
              <View style={{ gap: 4, alignSelf: 'flex-start' }}>
                <Text style={[type.h2, { color: colors.textPrimary }]}>{lifestyle.name}</Text>
                <View style={{ height: 3, borderRadius: 2, backgroundColor: lifestyle.color, minWidth: 56 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.s3 }}>
                {lifestyle.columns.map((column) => (
                  <BoardColumnBox
                    key={column.title}
                    column={column}
                    height={columnHeight}
                    onPressTask={onPressTask}
                    onComplete={onComplete}
                    onDelete={onDelete}
                  />
                ))}
              </View>
            </View>
          ))}
          {board.unsorted.length > 0 && (
            <View style={{ gap: space.s2 }}>
              <View style={{ gap: 4, alignSelf: 'flex-start' }}>
                <Text style={[type.h2, { color: colors.textPrimary }]}>No lifestyle</Text>
                <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.borderSubtle, minWidth: 56 }} />
              </View>
              <BoardColumnBox
                column={{ title: 'Miscellaneous', color: null, isMisc: true, prioritized: [], rest: board.unsorted }}
                height={columnHeight}
                onPressTask={onPressTask}
                onComplete={onComplete}
                onDelete={onDelete}
              />
            </View>
          )}
        </ScrollView>
        {bottomSections}
      </ScrollView>
    );
  }

  // --------------------------------------------------------- phone
  const page = pages[clampedIndex];
  const prev = pages[clampedIndex - 1];
  const next = pages[clampedIndex + 1];
  const carouselHeight = Math.max(340, windowHeight * 0.58);

  if (pages.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.s4, paddingBottom: bottomInset }}>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          No lifestyles yet. Add one from the task form.
        </Text>
        {bottomSections}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}>
      {/* The jump bar: every lifestyle and its subjects, tap to skip. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.s4, gap: 6, paddingVertical: space.s2 }}>
        {pages.map((p, i) => {
          const isLifestyleStart = i === 0 || pages[i - 1].lifestyle.name !== p.lifestyle.name;
          const active = i === clampedIndex;
          return (
            <View key={`${p.lifestyle.name}-${p.column.title}`} style={{ flexDirection: 'row', gap: 6 }}>
              {isLifestyleStart && (
                <Pressable
                  onPress={() => jumpTo(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${p.lifestyle.name}`}
                  style={[
                    styles.jumpChip,
                    { backgroundColor: p.lifestyle.color, borderColor: active ? colors.textPrimary : 'transparent' },
                  ]}>
                  <Text style={[type.caption, { color: textOnSolid(p.lifestyle.color) }]} numberOfLines={1}>
                    {p.lifestyle.name}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => jumpTo(i)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${p.lifestyle.name} ${p.column.title}`}
                style={[
                  styles.jumpChip,
                  {
                    backgroundColor: p.column.color ? `${p.column.color}44` : colors.surfaceSunken,
                    borderColor: active ? colors.accent : colors.borderSubtle,
                  },
                ]}>
                <Text style={[type.caption, { color: colors.textPrimary }]} numberOfLines={1}>
                  {p.column.title}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <Text style={[type.h2, { color: colors.textPrimary, paddingHorizontal: space.s4, paddingBottom: space.s2 }]}>
        {page.lifestyle.name}
      </Text>

      <GestureDetector gesture={carouselPan}>
        <View style={{ height: carouselHeight, overflow: 'hidden' }}>
          <Animated.View style={[styles.carouselTrack, pageStyle]}>
            {[prev, page, next].map((p, slot) =>
              p ? (
                <View
                  key={`${p.lifestyle.name}-${p.column.title}`}
                  style={[styles.carouselPage, { width: windowWidth, left: (slot - 1) * windowWidth, paddingHorizontal: space.s4 }]}>
                  <BoardColumnBox
                    column={p.column}
                    height={carouselHeight - 8}
                    width={windowWidth - space.s4 * 2}
                    onPressTask={onPressTask}
                    onComplete={onComplete}
                    onDelete={onDelete}
                  />
                </View>
              ) : null
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={{ paddingHorizontal: space.s4 }}>{bottomSections}</View>
    </ScrollView>
  );
}

// Status → compact-card surface (same sacred four as TaskCard).
function boardSurfaces(theme: Theme) {
  const { colors } = theme;
  return {
    default: { background: colors.surfaceElevated, accentBar: null },
    ongoing: { background: colors.statusOngoingBg, accentBar: colors.statusOngoingAccent },
    urgent: { background: colors.statusUrgentBg, accentBar: colors.statusUrgentAccent },
    overdue: { background: colors.statusOverdueBg, accentBar: colors.statusOverdueAccent },
    completed: { background: colors.surfaceElevated, accentBar: null },
  } as const;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 46,
    justifyContent: 'center',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  cardBody: {
    justifyContent: 'center',
  },
  cardPress: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  cardAction: {
    position: 'absolute',
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  columnHeader: {
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  subjectPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  dash: {
    position: 'absolute',
    width: 3,
    height: 26,
    borderRadius: 2,
  },
  bottomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  jumpChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 140,
  },
  carouselTrack: {
    flex: 1,
  },
  carouselPage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
