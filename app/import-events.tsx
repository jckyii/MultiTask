// CSV import. Pick a file → preview what parsed → choose whether the rows
// land as calendar EVENTS (the default, read-only, distinct from tasks) or as
// TASKS (with due dates), per-row or in bulk → import. No in-app event
// creation by design: the CSV is made elsewhere. Transparent sheet route,
// same shell pattern as quick-add.
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TourAnchor } from '@/components/tour/tour-context';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { useUndoToast } from '@/components/undo-toast';
import { confirmDialog } from '@/lib/confirm';
import { csvToEvents, NAMED_EVENT_COLORS, type CsvImportResult } from '@/lib/events/csv';
import { importButtonLabel, importedMessage } from '@/lib/events/import-labels';
import { eventToNewTask } from '@/lib/events/to-task';
import { useDeleteAllEvents, useEvents, useImportEvents } from '@/lib/events/use-events';
import { useImportTasks } from '@/lib/tasks/use-tasks';
import { useWideNative } from '@/hooks/use-wide-layout';
import { tabletSheet } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

// Swatches for the whole-import default (rows with their own color column
// keep it). First option = the theme's standard event blue (stored as null
// so it adapts to dark mode).
const COLOR_CHOICES = ['red', 'orange', 'yellow', 'green', 'teal', 'indigo', 'purple', 'pink'].map(
  (name) => ({ name, hex: NAMED_EVENT_COLORS[name] })
);

const isWeb = Platform.OS === 'web';

/** Bulk destination for the imported rows. 'choose' reveals per-row toggles. */
type ImportMode = 'events' | 'tasks' | 'choose';

export default function ImportEventsScreen() {
  const router = useRouter();
  const { colors, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const onTablet = useWideNative();
  const toast = useUndoToast();

  const { data: existingEvents } = useEvents();
  const importEvents = useImportEvents();
  const importTasks = useImportTasks();
  const deleteAllEvents = useDeleteAllEvents();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<CsvImportResult | null>(null);
  const [defaultColor, setDefaultColor] = useState<string | null>(null);
  // The parse whose EVENTS leg already inserted (partial-failure retry guard).
  const eventsImportedFor = useRef<CsvImportResult | null>(null);

  // Events vs tasks. Default 'events' (the handoff behavior); `modeExplicit`
  // tracks whether the user actually engaged the selector, so we know whether
  // to ask before importing (see onImportPress).
  const [mode, setMode] = useState<ImportMode>('events');
  const [modeExplicit, setModeExplicit] = useState(false);
  // Row indices marked as TASKS while in 'choose' mode.
  const [taskRows, setTaskRows] = useState<Set<number>>(new Set());

  const importing = importEvents.isPending || importTasks.isPending;
  const allIndices = useMemo(
    () => (parsed ? parsed.events.map((_, i) => i) : []),
    [parsed]
  );

  // Sheet enter/exit — same shell as the task form.
  const sheetOffset = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);
  useEffect(() => {
    backdropOpacity.value = withTiming(1, { duration: 220 });
    sheetOffset.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [backdropOpacity, sheetOffset]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetOffset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value * 0.35 }));

  function goBack() {
    router.back();
  }
  function close() {
    backdropOpacity.value = withTiming(0, { duration: 220 });
    sheetOffset.value = withTiming(screenHeight, { duration: 160, easing: Easing.in(Easing.cubic) });
    setTimeout(goBack, 170);
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // Reading loads the whole file into memory — a mis-picked video would
    // hang or OOM the app. Any plausible calendar CSV is far under 5 MB.
    // Check BOTH size sources: asset.size can be null on some pickers, and
    // on web the File object always knows (security pass 2026-07-23).
    const size = asset.size ?? asset.file?.size ?? null;
    if (size != null && size > 5 * 1024 * 1024) {
      toast.show({ message: 'That file is too large for a calendar CSV (5 MB max).' });
      return;
    }
    try {
      // Web: the picker hands us a File object — expo-file-system can't read
      // web blob URIs at all (import on web ALWAYS failed before this branch;
      // reported with a real schedule CSV 2026-07-22). Native: read the
      // cache copy as before.
      const text = asset.file ? await asset.file.text() : await readAsStringAsync(asset.uri);
      setFileName(asset.name);
      setParsed(csvToEvents(text));
      // Fresh file → fresh choice.
      setMode('events');
      setModeExplicit(false);
      setTaskRows(new Set());
    } catch {
      toast.show({ message: 'Couldn’t read that file.' });
    }
  }

  /** Which row indices become tasks under the current mode. */
  function taskIndexSet(): Set<number> {
    if (mode === 'tasks') return new Set(allIndices);
    if (mode === 'choose') return taskRows;
    return new Set();
  }

  function chooseMode(next: ImportMode) {
    setModeExplicit(true);
    if (next === 'choose') {
      // Seed the per-row toggles from the bulk interpretation the user was
      // just looking at, so switching to "Pick each" doesn't lose it.
      setTaskRows(mode === 'tasks' ? new Set(allIndices) : new Set(taskRows));
    }
    setMode(next);
  }

  function toggleRow(index: number) {
    setTaskRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setAllRows(asTasks: boolean) {
    setTaskRows(asTasks ? new Set(allIndices) : new Set());
  }

  async function commitImport(asTasks: Set<number>) {
    if (!parsed) return;
    const taskInputs = parsed.events.filter((_, i) => asTasks.has(i)).map(eventToNewTask);
    const eventInputs = parsed.events.filter((_, i) => !asTasks.has(i));
    try {
      // A mixed import runs as two inserts. If the events leg lands but the
      // tasks leg fails, retrying must NOT re-insert the events — remember
      // which parse already had its events written (cleared on new file).
      if (eventInputs.length > 0 && eventsImportedFor.current !== parsed) {
        await importEvents.mutateAsync({
          events: eventInputs,
          source: fileName ?? 'import.csv',
          defaultColor,
        });
        eventsImportedFor.current = parsed;
      }
      if (taskInputs.length > 0) {
        await importTasks.mutateAsync({ tasks: taskInputs });
      }
      toast.show({ message: importedMessage(eventInputs.length, taskInputs.length) });
      close();
    } catch (error) {
      const eventsAlreadyIn = eventsImportedFor.current === parsed && eventInputs.length > 0;
      toast.show({
        message: eventsAlreadyIn
          ? `Events imported, but the tasks failed: ${(error as Error).message}. Import again to retry just the tasks.`
          : `Import failed: ${(error as Error).message}`,
      });
    }
  }

  function onImportPress() {
    if (!parsed || parsed.events.length === 0) return;
    // If the user never touched the selector, give them the choice they may
    // have missed BEFORE anything is written — no create-then-convert churn.
    if (mode === 'events' && !modeExplicit) {
      confirmDialog({
        title: 'Add some as tasks?',
        message:
          'A schedule imports as calendar events. You can make some or all of these rows tasks instead.',
        confirmLabel: 'Choose which',
        cancelLabel: 'Import as events',
      }).then((choose) => {
        if (choose) chooseMode('choose');
        else commitImport(new Set());
      });
      return;
    }
    commitImport(taskIndexSet());
  }

  async function confirmDeleteAll() {
    const count = existingEvents?.length ?? 0;
    const confirmed = await confirmDialog({
      title: 'Delete all events?',
      message: `${count} imported event${count === 1 ? '' : 's'} will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    deleteAllEvents.mutate(undefined, {
      onSuccess: () => toast.show({ message: 'All events deleted.' }),
      onError: () => toast.show({ message: 'Couldn’t delete events — check your connection.' }),
    });
  }

  const currentTaskCount = taskIndexSet().size;
  const eventCount = (parsed?.events.length ?? 0) - currentTaskCount;

  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Pressable style={styles.backdropTouch} onPress={close} accessibilityLabel="Close import" />
      <Animated.View
        style={[
          sheetStyle,
          isWeb && styles.sheetWeb,
          onTablet && tabletSheet,
          // Desktop/web: a centered dialog like quick-add, not a full-bleed
          // bottom sheet (audit 2026-07-16 — the sheet spanned the whole
          // 1440px viewport).
          isWeb && {
            borderBottomLeftRadius: radius.card,
            borderBottomRightRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
          },
          {
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            padding: space.s4,
            paddingBottom: Math.max(insets.bottom, space.s4),
            gap: space.s3,
          },
        ]}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>Import calendar events</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          A CSV with columns like title, date, start time, end time, location, color. Rows without a
          time become all-day events. You can bring rows in as events or turn them into tasks.
        </Text>
        <TourAnchor ringPadX={4} ringPadY={2} id="import-help-link" style={{ alignSelf: 'flex-start' }}>
        <Pressable
          onPress={() => router.push('/import-help')}
          accessibilityRole="button"
          style={{ paddingVertical: space.s1 }}>
          <Text style={[type.body, { color: colors.accent }]}>How do I make a CSV? (with an AI prompt)</Text>
        </Pressable>
        </TourAnchor>

        <Text style={[type.caption, { color: colors.textSecondary }]}>Event color</Text>
        <View style={[styles.swatchRow, { gap: space.s2 }]}>
          <Pressable
            onPress={() => setDefaultColor(null)}
            // 30pt swatch + 7 slop = 44pt touch target.
            hitSlop={7}
            accessibilityRole="button"
            accessibilityLabel="Default blue"
            accessibilityState={{ selected: defaultColor === null }}
            style={[
              styles.swatch,
              {
                backgroundColor: colors.statusEventAccent,
                borderWidth: defaultColor === null ? 2.5 : 0,
                borderColor: colors.textPrimary,
              },
            ]}
          />
          {COLOR_CHOICES.map(({ name, hex }) => (
            <Pressable
              key={hex}
              onPress={() => setDefaultColor(hex)}
              hitSlop={7}
              accessibilityRole="button"
              // Color NAME, not hex — VoiceOver reading "#f97316" aloud
              // helps nobody.
              accessibilityLabel={name}
              accessibilityState={{ selected: defaultColor === hex }}
              style={[
                styles.swatch,
                {
                  backgroundColor: hex,
                  borderWidth: defaultColor === hex ? 2.5 : 0,
                  borderColor: colors.textPrimary,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400' }]}>
          Applies to rows without their own color column.
        </Text>

        {/* ONE filled primary at a time (rule 3, deferred #2): before a file
            is parsed the pick button is the primary; after, Import takes
            over and re-picking demotes to a text link. */}
        {fileName ? (
          <Pressable onPress={pickFile} accessibilityRole="button" style={{ paddingVertical: space.s1 }}>
            <Text style={[type.body, { color: colors.accent }]}>Choose a different file</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={pickFile}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.accent, borderRadius: radius.button, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>
              Choose CSV file
            </Text>
          </Pressable>
        )}

        {parsed && (
          <View style={{ gap: space.s2 }}>
            <Text style={[type.body, { color: colors.textPrimary }]}>
              {fileName}: {parsed.events.length} row{parsed.events.length === 1 ? '' : 's'} ready
              {parsed.errors.length > 0 ? `, ${parsed.errors.length} row${parsed.errors.length === 1 ? '' : 's'} skipped` : ''}
              .
            </Text>
            {parsed.errors.slice(0, 3).map((error) => (
              <Text key={error} style={[type.caption, { color: colors.statusOverdueAccent, fontWeight: '400' }]}>
                {error}
              </Text>
            ))}

            {parsed.events.length > 0 && (
              <>
                {/* Destination selector — the "know beforehand" affordance. */}
                <Text style={[type.caption, { color: colors.textSecondary, marginTop: space.s1 }]}>
                  Import these as
                </Text>
                <View style={[styles.segmented, { borderColor: colors.borderSubtle, borderRadius: radius.button }]}>
                  {(
                    [
                      ['events', 'Events'],
                      ['tasks', 'Tasks'],
                      ['choose', 'Pick each'],
                    ] as [ImportMode, string][]
                  ).map(([value, label], i) => {
                    const selected = mode === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => chooseMode(value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.segment,
                          i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.borderSubtle },
                          selected && { backgroundColor: colors.accent },
                        ]}>
                        <Text
                          style={[
                            type.caption,
                            { color: selected ? colors.textOnAccent : colors.textPrimary, fontWeight: '600' },
                          ]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {mode === 'choose' ? (
                  <View style={{ gap: space.s1 }}>
                    <View style={styles.chooserActions}>
                      <Pressable onPress={() => setAllRows(false)} accessibilityRole="button" hitSlop={6}>
                        <Text style={[type.caption, { color: colors.accent }]}>All events</Text>
                      </Pressable>
                      <Pressable onPress={() => setAllRows(true)} accessibilityRole="button" hitSlop={6}>
                        <Text style={[type.caption, { color: colors.accent }]}>All tasks</Text>
                      </Pressable>
                    </View>
                    <ScrollView
                      style={{ maxHeight: 220 }}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}>
                      <View style={{ gap: space.s1 }}>
                        {parsed.events.map((event, i) => {
                          const asTask = taskRows.has(i);
                          return (
                            <Pressable
                              key={i}
                              onPress={() => toggleRow(i)}
                              accessibilityRole="button"
                              accessibilityLabel={`${event.title}, ${asTask ? 'task' : 'event'}`}
                              accessibilityHint="Toggles between event and task"
                              style={[
                                styles.chooserRow,
                                { borderColor: colors.borderSubtle, borderRadius: radius.tight },
                              ]}>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text numberOfLines={1} style={[type.body, { color: colors.textPrimary }]}>
                                  {event.title}
                                </Text>
                                <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400' }]}>
                                  {event.start.toLocaleDateString()}
                                  {event.allDay
                                    ? ' · all day'
                                    : ` · ${event.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.rowPill,
                                  {
                                    backgroundColor: asTask ? colors.accentMuted : 'transparent',
                                    borderColor: asTask ? colors.accent : colors.statusEventAccent,
                                    borderRadius: radius.pill,
                                  },
                                ]}>
                                <Text
                                  style={[
                                    type.caption,
                                    { color: asTask ? colors.accent : colors.statusEventAccent, fontWeight: '600' },
                                  ]}>
                                  {asTask ? 'Task' : 'Event'}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ) : (
                  // Preview the first few rows, as before.
                  parsed.events.slice(0, 3).map((event, i) => (
                    <Text key={i} numberOfLines={1} style={[type.caption, { color: colors.textSecondary, fontWeight: '400' }]}>
                      {event.title} — {event.start.toLocaleDateString()}{' '}
                      {event.allDay ? '(all day)' : event.start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  ))
                )}

                <Pressable
                  onPress={onImportPress}
                  disabled={importing}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: currentTaskCount > 0 && eventCount === 0 ? colors.accent : colors.statusEventAccent,
                      borderRadius: radius.button,
                      opacity: importing ? 0.5 : pressed ? 0.85 : 1,
                    },
                  ]}>
                  <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>
                    {importing ? 'Importing…' : importButtonLabel(eventCount, currentTaskCount)}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {(existingEvents?.length ?? 0) > 0 && (
          <Pressable onPress={confirmDeleteAll} accessibilityRole="button" style={{ paddingVertical: space.s2 }}>
            <Text style={[type.body, { color: colors.statusOverdueAccent }]}>
              Delete all {existingEvents?.length} imported events
            </Text>
          </Pressable>
        )}
      </Animated.View>
      {/* Native modal screens paint above the root overlay — the tour's
          import steps render from INSIDE this route. */}
      <TourOverlay host="import" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  containerWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetWeb: {
    width: '100%',
    maxWidth: 560,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chooserActions: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 4,
  },
  chooserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 48,
  },
  rowPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 56,
    alignItems: 'center',
  },
});
