// The task list — the app's landing screen. Completed (collapsed) at top,
// Overdue / Today / Tomorrow / Upcoming / No due date by time, Deleted
// (collapsed trash) at the bottom. Swipeable cards, optimistic mutations,
// undo toasts, spring regroup animations. Quick-add FAB is the next slice.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fab } from '@/components/fab';
import { TabPage } from '@/components/tab-pager';
import { SearchFilterBar } from '@/components/search-filter-bar';
import { TourAnchor, useTourAnchor } from '@/components/tour/tour-context';
import { SwipeableTaskCard } from '@/components/swipeable-task-card';
import { SyncStatusDot } from '@/components/sync-status-dot';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useUndoToast } from '@/components/undo-toast';
import { useCollapsedSection } from '@/hooks/use-collapsed-section';
import { useTaskActions } from '@/hooks/use-task-actions';
import { useToday } from '@/hooks/use-today';
import { useWideLayout } from '@/hooks/use-wide-layout';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { animateListChanges } from '@/lib/animate-layout';
import { isReduceMotionEnabled } from '@/lib/reduced-motion';
import { confirmDialog } from '@/lib/confirm';
import { clearEnterMark, getEnterFrom, markEnter } from '@/lib/enter-marks';
import { getTourTaskId } from '@/lib/tour/events';
import { EMPTY_FILTERS, filterTasks, hasActiveFilters, type TaskFilters } from '@/lib/tasks/filter';
import { groupTasks } from '@/lib/tasks/sections';
import { pageContent } from '@/lib/theme/layout';
import {
  useBulkPermanentlyDeleteTasks,
  useBulkRestoreTasks,
  useBulkSoftDeleteTasks,
  useTasks,
} from '@/lib/tasks/use-tasks';
import { useTheme } from '@/lib/theme/use-theme';

export default function TaskListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listAnchor = useTourAnchor('task-list');
  const searchAnchor = useTourAnchor('search-bar');
  const { colors, space, type } = useTheme();
  const { data: tasks, isLoading, error, refetch } = useTasks();
  const today = useToday(); // regroups sections when the date rolls over (deferred #13)
  const { handleSwipeRight, handleSwipeLeft } = useTaskActions();
  const bulkSoftDelete = useBulkSoftDeleteTasks();
  const bulkRestore = useBulkRestoreTasks();
  const bulkPermanentDelete = useBulkPermanentlyDeleteTasks();
  const toast = useUndoToast();
  const [completedCollapsed, toggleCompleted] = useCollapsedSection('ui.completedCollapsed');
  const [deletedCollapsed, toggleDeleted] = useCollapsedSection('ui.deletedCollapsed');
  const urgencyThresholdHours = useUrgencyThreshold();

  // Search + filter. On PHONES: not rendered until deliberately revealed —
  // an overscroll pull at the top, or the magnifier button (developer: keep
  // it hidden, it's a lot of information) — and auto-hidden again on scroll
  // when no criteria are active. On DESKTOP/WEB AND iPad: permanently open,
  // filters included — the space exists (developer request 2026-07-11).
  const isDesktop = useWideLayout();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  // Filter chips start collapsed everywhere (developer pick) — the bar's
  // "Filter" button opens them.
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchShown = searchVisible || isDesktop;
  const searching = hasActiveFilters(filters);

  function showSearch() {
    if (!searchShown) {
      animateListChanges();
      setSearchVisible(true);
    }
  }

  function hideSearch() {
    if (isDesktop) return; // always open on desktop
    animateListChanges();
    setSearchVisible(false);
    setFilterPanelOpen(false);
    setFilters(EMPTY_FILTERS);
  }

  function onListScroll(event: { nativeEvent: { contentOffset: { y: number } } }) {
    if (isDesktop) return;
    const y = event.nativeEvent.contentOffset.y;
    if (!searchShown && y < -70) {
      // A firm, deliberate pull past the top (iOS overscroll) — tuned hard
      // on purpose (developer request); casual bounces never trigger it.
      showSearch();
    } else if (searchShown && !searching && !filterPanelOpen && y > 100) {
      // Nothing active and the user is scrolling on — tuck it away.
      animateListChanges();
      setSearchVisible(false);
    }
  }

  const filterOptions = useMemo(() => {
    const cats = new Map<string, string>();
    const subs = new Map<string, string>();
    for (const t of tasks ?? []) {
      if (t.deletedAt) continue;
      if (t.category && t.category !== 'Uncategorized' && !cats.has(t.category)) {
        cats.set(t.category, t.categoryColor);
      }
      if (t.subject && !subs.has(t.subject)) subs.set(t.subject, t.subjectColor);
    }
    return {
      categories: [...cats].map(([name, color]) => ({ name, color })),
      subjects: [...subs].map(([name, color]) => ({ name, color })),
    };
  }, [tasks]);

  const results = useMemo(
    () => (searching ? filterTasks(tasks ?? [], filters, { urgencyThresholdHours }) : []),
    [searching, tasks, filters, urgencyThresholdHours]
  );

  // The refresh spinner appears ONLY for a physical pull-down — background
  // refetches after mutations stay invisible (developer feedback).
  const [pullRefreshing, setPullRefreshing] = useState(false);
  async function onPullRefresh() {
    setPullRefreshing(true);
    try {
      await refetch();
    } finally {
      setPullRefreshing(false);
    }
  }

  const sections = useMemo(() => {
    if (searching) {
      // Filtering hides everything else: one flat results section.
      return [{ key: 'results', title: `Results (${results.length})`, data: results }];
    }
    const grouped = groupTasks(tasks ?? []);
    return grouped.map((section) =>
      (section.key === 'completed' && completedCollapsed) || (section.key === 'deleted' && deletedCollapsed)
        ? { ...section, data: [] }
        : section
    );
    // `today` isn't read directly — it re-runs the grouping (which calls
    // new Date() internally) when the local date rolls over (deferred #13).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, results, tasks, completedCollapsed, deletedCollapsed, today]);

  const completedCount = useMemo(
    () => (tasks ?? []).filter((t) => t.isCompleted && !t.deletedAt).length,
    [tasks]
  );
  const deletedCount = useMemo(() => (tasks ?? []).filter((t) => t.deletedAt).length, [tasks]);

  // Batch exits: when the section is expanded, every visible card slides
  // off-screen swipe-style in a slight cascade BEFORE the mutation runs (the
  // cache update would otherwise remove the rows instantly, killing the
  // motion). Collapsed sections skip straight to the mutation.
  const [exiting, setExiting] = useState<Map<number, { to: 'left' | 'right'; delayMs: number }>>(new Map());

  // Ref-held so unmounting mid-cascade neither leaks the timer nor LOSES the
  // batch action the user already committed to.
  const cascadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCascade = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (cascadeTimer.current) clearTimeout(cascadeTimer.current);
      pendingCascade.current?.();
      pendingCascade.current = null;
    },
    []
  );

  function runWithCascade(ids: number[], visible: boolean, mutate: () => void) {
    // Single-flight: a second tap during a running cascade would double the
    // mutation and its toast.
    if (pendingCascade.current) return;
    // Reduce-motion: rows would jump instead of slide, so waiting out the
    // animation window is pure delay — mutate immediately.
    if (!visible || isReduceMotionEnabled()) {
      mutate();
      return;
    }
    const marks = new Map<number, { to: 'left' | 'right'; delayMs: number }>();
    ids.forEach((id, index) => marks.set(id, { to: 'left', delayMs: Math.min(index, 8) * 30 }));
    setExiting(marks);
    const animationWindow = 240 + Math.min(ids.length, 8) * 30 + 40;
    pendingCascade.current = mutate;
    cascadeTimer.current = setTimeout(() => {
      cascadeTimer.current = null;
      pendingCascade.current = null;
      setExiting(new Map());
      mutate();
    }, animationWindow);
  }

  // "Clear all completed" — the fix for the web app's most annoying bug.
  // One cascade into the trash, one undo toast for the whole batch, and the
  // section NEVER collapses on you mid-clear.
  function clearAllCompleted() {
    const ids = (tasks ?? []).filter((t) => t.isCompleted && !t.deletedAt).map((t) => t.id);
    if (ids.length === 0) return;
    runWithCascade(ids, !completedCollapsed, () => {
      animateListChanges();
      ids.forEach((id) => markEnter(id, 'left'));
      bulkSoftDelete.mutate(ids, {
        onError: () => toast.show({ message: 'Couldn’t clear completed — check your connection.' }),
      });
      toast.show({
        message: `${ids.length} ${ids.length === 1 ? 'task' : 'tasks'} deleted.`,
        onUndo: () => {
          animateListChanges();
          ids.forEach((id) => markEnter(id, 'right'));
          bulkRestore.mutate(ids, {
            onError: () => toast.show({ message: 'Couldn’t restore — check your connection.' }),
          });
        },
      });
    });
  }

  // Emptying the trash is bulk-permanent — the one action with no undo, so
  // it's also the one action that earns a confirmation dialog.
  async function emptyTrash() {
    const ids = (tasks ?? []).filter((t) => t.deletedAt).map((t) => t.id);
    if (ids.length === 0) return;
    const confirmed = await confirmDialog({
      title: 'Empty trash?',
      message: `${ids.length} ${ids.length === 1 ? 'task' : 'tasks'} will be gone permanently.`,
      confirmLabel: 'Empty',
      destructive: true,
    });
    if (!confirmed) return;
    runWithCascade(ids, !deletedCollapsed, () => {
      animateListChanges();
      // Success-gated toast: this is the one action with no undo, so
      // pre-announcing "emptied" and then erroring would be contradictory.
      bulkPermanentDelete.mutate(ids, {
        onSuccess: () => toast.show({ message: 'Trash emptied.' }),
        onError: () => toast.show({ message: 'Couldn’t empty the trash — check your connection.' }),
      });
    });
  }

  function renderCollapsibleHeader(key: string) {
    const isCompleted = key === 'completed';
    const collapsed = isCompleted ? completedCollapsed : deletedCollapsed;
    const toggle = isCompleted ? toggleCompleted : toggleDeleted;
    const count = isCompleted ? completedCount : deletedCount;
    const label = isCompleted ? `Completed (${count})` : `Deleted (${count})`;
    return (
      <View
        style={[
          styles.sectionHeaderRow,
          { backgroundColor: colors.surface, paddingVertical: space.s2 },
        ]}>
        <Text
          onPress={() => {
            animateListChanges();
            toggle();
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          style={[type.h2, styles.sectionHeaderLabel, { color: colors.textSecondary }]}>
          {`${label}  `}
          <IconSymbol
            name={collapsed ? 'chevron.right' : 'chevron.down'}
            size={14}
            color={colors.textSecondary}
          />
        </Text>
        {count > 0 && (
          // Pressable + hitSlop: a caption-size Text alone is a ~24pt target
          // for a batch action (HIG minimum is 44). "Empty trash" is the ONE
          // irreversible list action — red, unlike the undoable "Clear all".
          <Pressable
            onPress={isCompleted ? clearAllCompleted : emptyTrash}
            hitSlop={12}
            accessibilityRole="button"
            style={{ paddingVertical: space.s1 }}>
            <Text
              style={[
                type.caption,
                { color: isCompleted ? colors.accent : colors.statusOverdueAccent },
              ]}>
              {isCompleted ? 'Clear all' : 'Empty trash'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <TabPage>
    <View style={[styles.screen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* The SCROLLABLE spans the window (scrollbar at the true edge; swipe
          exits travel the full viewport) — content centers itself via
          pageContent inside contentContainerStyle. */}
      <View ref={listAnchor.ref} onLayout={listAnchor.onLayout} style={[styles.titleRow, pageContent, { paddingHorizontal: space.s4, paddingVertical: space.s3 }]}>
        <Text style={[type.h1, { color: colors.textPrimary }]}>Tasks</Text>
        {/* The theme toggle is ALWAYS the outermost top-right control on
            every tab (developer request) — other actions sit to its left. */}
        <View style={styles.titleActions}>
          <SyncStatusDot />
          {!isDesktop && (
            <Pressable
              onPress={() => (searchVisible ? hideSearch() : showSearch())}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={searchVisible ? 'Hide search' : 'Search tasks'}>
              <IconSymbol name="magnifyingglass" size={24} color={searchVisible ? colors.accent : colors.textSecondary} />
            </Pressable>
          )}
          <ThemeToggleButton />
        </View>
      </View>

      {isLoading ? (
        // Skeleton per docs/design/05: grey placeholder cards, no shimmer.
        <View style={[pageContent, { paddingHorizontal: space.s4, gap: space.s3 }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ height: 88, borderRadius: 16, backgroundColor: colors.surfaceSunken }} />
          ))}
        </View>
      ) : error ? (
        <View style={[pageContent, { paddingHorizontal: space.s4 }]}>
          <Text style={[type.body, { color: colors.textPrimary }]}>Couldn’t load tasks.</Text>
          <Pressable onPress={() => refetch()} hitSlop={12} accessibilityRole="button" style={{ marginTop: space.s2 }}>
            <Text style={[type.body, { color: colors.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(task) => String(task.id)}
          stickySectionHeadersEnabled
          refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} />}
          onScroll={onListScroll}
          scrollEventThrottle={32}
          ListHeaderComponent={
            searchShown ? (
              <SearchFilterBar
                filters={filters}
                onChange={setFilters}
                panelOpen={filterPanelOpen}
                onTogglePanel={() => setFilterPanelOpen((open) => !open)}
                categories={filterOptions.categories}
                subjects={filterOptions.subjects}
              />
            ) : null
          }
          keyboardShouldPersistTaps="handled"
          // flexGrow: with few tasks the content container used to end where
          // the cards ended, so dragging the blank lower half of the screen
          // did nothing (developer report 2026-08-17). Filling the viewport
          // makes every drag - and the pull-to-reveal search - work from
          // anywhere. alwaysBounceVertical keeps the iOS overscroll alive
          // even when content is shorter than the screen.
          contentContainerStyle={[pageContent, { flexGrow: 1, paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s6 }]}
          alwaysBounceVertical
          renderSectionHeader={({ section }) =>
            section.key === 'completed' || section.key === 'deleted' ? (
              renderCollapsibleHeader(section.key)
            ) : (
              <View style={{ backgroundColor: colors.surface, paddingVertical: space.s2 }}>
                <Text style={[type.h2, { color: colors.textSecondary }]}>{section.title}</Text>
              </View>
            )
          }
          renderItem={({ item: task, section, index }) => {
            const card = (
              <SwipeableTaskCard
                task={task}
                onSwipeRight={handleSwipeRight}
                onSwipeLeft={handleSwipeLeft}
                onPress={(t) => router.push(`/task/${t.id}`)}
                enterFrom={getEnterFrom(task.id)}
                onEntered={clearEnterMark}
                exit={exiting.get(task.id) ?? null}
              />
            );
            // The tour's delete/complete steps ring THE TASK THE TOUR MADE
            // (falling back to the first open task) — with existing tasks
            // the first row could be some old overdue task, leaving the
            // real one dimmed out (developer report 2026-08-14).
            const tourId = getTourTaskId();
            const isTourTask = tourId != null && task.id === tourId;
            const isFirstOpen =
              tourId == null && index === 0 && section.key !== 'completed' && section.key !== 'deleted';
            if (isTourTask || isFirstOpen) {
              return <TourAnchor id="first-task">{card}</TourAnchor>;
            }
            return card;
          }}
          ItemSeparatorComponent={() => <View style={{ height: space.s3 }} />}
          SectionSeparatorComponent={() => <View style={{ height: space.s2 }} />}
          ListEmptyComponent={
            searching ? (
              <Text style={[type.body, { color: colors.textSecondary, marginTop: space.s6 }]}>
                No matching tasks.
              </Text>
            ) : (
              // A clear list is an achievement, not an absence (developer
              // request 2026-08-02): small centered graphic + warm line.
              <View style={{ alignItems: 'center', gap: space.s3, marginTop: space.s8 * 2 }}>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    borderWidth: 2,
                    borderColor: colors.statusOngoingAccent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.statusOngoingBg,
                  }}>
                  <IconSymbol name="checkmark" size={34} color={colors.statusOngoingAccent} />
                </View>
                <Text style={[type.h2, { color: colors.textPrimary }]}>All clear</Text>
                <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Nothing is waiting on you. Add the next thing with +.
                </Text>
              </View>
            )
          }
        />
      )}

      <Fab
        bottom={insets.bottom + (isDesktop ? 48 : 24)}
        right={isDesktop ? 48 : 20}
        onPress={() => router.push('/quick-add')}
      />
    </View>
    </TabPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLabel: {
    flexShrink: 1,
  },
});
