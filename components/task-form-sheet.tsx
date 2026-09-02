// The task form sheet — shared by quick-add (app/quick-add.tsx) and the task
// detail/edit view (app/task/[id].tsx). The everyday path stays title + time;
// everything optional lives behind the collapsed Details section (priority,
// categories/subjects incl. "+ New" with a color palette, description).
//
// Hosted by TRANSPARENT MODAL ROUTES, never an RN <Modal> (Reanimated
// silently no-ops in Modal's separate native window). Dismissal is
// tap-outside or the submit button ONLY — the body scrolls and scrolling can
// never close the sheet.
import { StackActions, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CollapsibleReveal } from '@/components/collapsible-reveal';
import { animateListChanges } from '@/lib/animate-layout';
import { InlineDatePicker } from '@/components/inline-date-picker';
import { RightClickMenu } from '@/components/right-click-menu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TourAnchor, useTour } from '@/components/tour/tour-context';
import { useUndoToast } from '@/components/undo-toast';
import { confirmDialog } from '@/lib/confirm';
import { TASK_DESCRIPTION_MAX, TASK_TITLE_MAX } from '@/lib/limits';
import { endOfToday } from '@/lib/tasks/dates';
import { lifestyleGroups } from '@/lib/tasks/lifestyles';
import { useDeleteCategory, useDeleteSubject, useTasks } from '@/lib/tasks/use-tasks';
import { useWideNative } from '@/hooks/use-wide-layout';
import { tabletSheet } from '@/lib/theme/layout';
import { priorityTiers } from '@/lib/theme/tokens';
import { useTheme } from '@/lib/theme/use-theme';
import { emitTourEvent } from '@/lib/tour/events';

export type NamedColor = { name: string; color: string };

export type TaskFormValues = {
  title: string;
  dueDate: Date | null;
  description: string;
  priority: number | null;
  category: NamedColor | null;
  subject: NamedColor | null;
};

type Props = {
  submitLabel: string;
  autoFocusTitle?: boolean;
  initial?: Partial<TaskFormValues>;
  /** Called with the final values right before the sheet slides away. */
  onSubmit: (values: TaskFormValues) => void;
};

const SLIDE = { duration: 220, easing: Easing.inOut(Easing.cubic) } as const;

// 12-swatch palette for new categories/subjects (docs/design/02). The pill
// contrast logic auto-adjusts text, so any of these stays readable.
const SWATCHES = [
  '#f87171', '#fb923c', '#fbbf24', '#fef08a', '#a3e635', '#4ade80',
  '#2dd4bf', '#60a5fa', '#818cf8', '#c084fc', '#f472b6', '#e5e7eb',
];

// Module scope on purpose: declared inside the sheet this would be a NEW
// component type on every render, so React unmounted and remounted every
// chip on each title keystroke (lost press feedback, re-measured layout).
function SelectChip({
  label,
  selected,
  onPress,
  onDelete,
  deleteLabel,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** When set, long-press (or the VoiceOver "Delete" action) removes it;
   *  on desktop a right-click menu offers it too. */
  onDelete?: () => void;
  deleteLabel?: string;
  color?: string;
}) {
  const { colors, space, radius, type } = useTheme();
  const chip = (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      // 40pt chip + slop = 44pt touch target.
      hitSlop={2}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // Long-press is a gesture, so give assistive tech a real equivalent.
      accessibilityHint={onDelete ? 'Long press to delete' : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: 'Delete' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') onDelete?.();
      }}
      style={{
        borderWidth: 1.5,
        borderColor: selected ? colors.accent : colors.borderSubtle,
        backgroundColor: selected ? colors.accentMuted : 'transparent',
        borderRadius: radius.button,
        paddingHorizontal: space.s3,
        minHeight: 40,
        justifyContent: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.s2,
      }}>
      {color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />}
      <Text style={[type.body, { color: selected ? colors.accent : colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
  if (!onDelete) return chip;
  return (
    <RightClickMenu items={[{ label: deleteLabel ?? `Delete “${label}”`, destructive: true, onPress: onDelete }]}>
      {chip}
    </RightClickMenu>
  );
}

/** Inline creator for a new category/subject: a name field with an Add button
 *  at its end, then the swatch palette. The explicit button matters — tapping
 *  away from a field never "submits" it, so relying on the keyboard's Done key
 *  alone silently lost the name (reported 2026-07-21). Enter still works too. */
function NewOptionCreator({ placeholder, onCreate }: { placeholder: string; onCreate: (option: NamedColor) => void }) {
  const { colors, space, radius, type } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[7]);
  const canAdd = name.trim().length > 0;

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, color });
    setName('');
  }

  return (
    <View style={{ gap: space.s2 }}>
      <View style={{ flexDirection: 'row', gap: space.s2, alignItems: 'center' }}>
        <TextInput
          style={{
            flex: 1,
            minHeight: 40,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            borderRadius: radius.button,
            color: colors.textPrimary,
            paddingHorizontal: space.s3,
            fontSize: 15,
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          // Enter commits THE BADGE, never the task (developer report
          // 2026-08-02). blurOnSubmit={false} keeps the event contained —
          // the keyboard stays put and no follow-on submit can fire.
          blurOnSubmit={false}
          onSubmitEditing={(event) => {
            event.preventDefault?.();
            create();
          }}
        />
        <Pressable
          onPress={create}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="Add"
          style={({ pressed }) => ({
            minHeight: 40,
            paddingHorizontal: space.s4,
            borderRadius: radius.button,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !canAdd ? 0.4 : pressed ? 0.85 : 1,
          })}>
          <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>Add</Text>
        </Pressable>
      </View>
      <View style={[styles.wrapRow, { gap: space.s2 }]}>
        {SWATCHES.map((swatch) => (
          <Pressable
            key={swatch}
            onPress={() => setColor(swatch)}
            // 28pt swatch + 8 slop = 44pt touch target (HIG minimum).
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Color ${swatch}`}
            accessibilityState={{ selected: color === swatch }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: swatch,
              borderWidth: color === swatch ? 2.5 : 0,
              borderColor: colors.accent,
            }}
          />
        ))}
      </View>
    </View>
  );
}

// On web/desktop the form is a WINDOW, not a bottom sheet (docs/design/08):
// centered card, all fields visible, no drag-to-dismiss.
const isWeb = Platform.OS === 'web';

// Clip gutter the body ScrollView reserves so tour rings can extend past
// the content without being cut off; the anchors' ringPadX stays below it.
const RING_GUTTER = 8;
// Round 3 (developer screenshot 2026-08-25): no padding value works while
// the LABEL sits inside the ring - grow it and the line hits the row above,
// shrink it and it strikes the label. So the field labels now live OUTSIDE
// the anchors (the ring wraps only the chips/input, like the date chips
// ring) and the pads stay small.
const FORM_RING_X = 6;
const FORM_RING_Y = 3;

export function TaskFormSheet({ submitLabel, autoFocusTitle = false, initial, onSubmit }: Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const routeKey = useRoute().key;
  const { colors, space, radius, type, monoFont } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const onTablet = useWideNative();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [dueDate, setDueDate] = useState<Date | null>(initial?.dueDate ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriorityValue] = useState<number | null>(initial?.priority ?? null);
  const [category, setCategory] = useState<NamedColor | null>(initial?.category ?? null);
  const [subject, setSubject] = useState<NamedColor | null>(initial?.subject ?? null);
  // Open Details from the start when editing a task that already uses them —
  // and ALWAYS on web/desktop, where the form is a window with all fields
  // visible (docs/design/08).
  const [detailsOpen, setDetailsOpen] = useState(
    isWeb ||
      Boolean(initial?.description || initial?.priority != null || initial?.category || initial?.subject)
  );
  // The tour's "open Details" step: on web (or when editing) Details starts
  // ALREADY open, so the tap event can never fire — re-announce the open
  // state whenever the tour step changes, delayed past the overlay's
  // listener re-subscription.
  const { active: tourActive, index: tourIndex } = useTour();
  useEffect(() => {
    if (!tourActive || !detailsOpen) return;
    const timer = setTimeout(() => emitTourEvent('form-details-open'), 80);
    return () => clearTimeout(timer);
  }, [tourActive, tourIndex, detailsOpen]);
  const [creating, setCreating] = useState<'lifestyle' | 'subject' | null>(null);
  // The lifestyle box currently EXPANDED in the selector (null = list or
  // stacked summary). Expanding IS selecting (developer spec 2026-08-26);
  // tapping the expanded box again clears the selection.
  const [activeLifestyle, setActiveLifestyle] = useState<string | null>(null);
  // Options created in this session, so they render immediately (they
  // become "existing" once a task is saved with them). Extra subjects are
  // keyed by their lifestyle — a subject can't exist without one.
  const [extraLifestyles, setExtraLifestyles] = useState<NamedColor[]>([]);
  const [extraSubjectsByLifestyle, setExtraSubjectsByLifestyle] = useState<Map<string, NamedColor[]>>(
    new Map()
  );

  // The lifestyle hierarchy, data-driven from the user's real tasks
  // (lib/tasks/lifestyles.ts) plus this session's creations.
  const { data: tasks } = useTasks();
  const deleteCategory = useDeleteCategory();
  const deleteSubject = useDeleteSubject();
  const toast = useUndoToast();
  const groups = useMemo(() => {
    const derived = lifestyleGroups(tasks ?? []);
    const byName = new Map(derived.map((g) => [g.name, { ...g, subjects: [...g.subjects] }]));
    for (const extra of extraLifestyles) {
      if (!byName.has(extra.name)) byName.set(extra.name, { name: extra.name, color: extra.color, subjects: [] });
    }
    for (const [lifestyleName, extras] of extraSubjectsByLifestyle) {
      const group = byName.get(lifestyleName);
      if (!group) continue;
      for (const s of extras) {
        if (!group.subjects.some((x) => x.name === s.name)) group.subjects.push(s);
      }
      group.subjects.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, extraLifestyles, extraSubjectsByLifestyle]);

  // Sheet surface stays anchored to the screen bottom and pads itself by the
  // keyboard height — no backdrop gap under the box.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Sheet enter/exit: slide up on mount; on close, dismiss the keyboard and
  // slide down in sync with it, then pop the route. On web the window just
  // eases in from a small offset instead of crossing the viewport.
  const closedOffset = isWeb ? 32 : screenHeight;
  const sheetOffset = useSharedValue(closedOffset);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    backdropOpacity.value = withTiming(1, { duration: 220 });
    sheetOffset.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [backdropOpacity, sheetOffset]);

  // Focus the title AFTER the sheet is on screen. autoFocus at mount made
  // the keyboard appear BEFORE the sheet on a busy JS thread ("keyboard
  // first, page a few seconds later" — developer report 2026-08-11), and
  // the keyboard animation competing with the sheet entrance is exactly
  // what makes the open feel heavy.
  const titleInputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!autoFocusTitle) return;
    const timer = setTimeout(() => titleInputRef.current?.focus(), isWeb ? 120 : 320);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.35,
  }));

  // Once closing, stop eating clicks IMMEDIATELY — the dying backdrop
  // otherwise blocks the page underneath for the whole exit animation and
  // the next card can't be opened (flow bug, 2026-07-22).
  const [dismissing, setDismissing] = useState(false);

  function goBack() {
    // Pop THIS route by key, not the stack top — during the exit animation
    // the user may already have opened the next sheet (pointerEvents fix),
    // and a plain back() would pop their new sheet instead of this one.
    navigation.dispatch({ ...StackActions.pop(1), source: routeKey });
  }

  const closeStarted = useRef(false);
  function close() {
    // One pop only — submit + backdrop (or a Siri-opened sheet) could both
    // schedule the close timer, and the second keyed pop finds nothing to
    // pop ("The action 'POP' ... was not handled", developer report).
    if (closeStarted.current) return;
    closeStarted.current = true;
    Keyboard.dismiss();
    setDismissing(true);
    // The page under a modal is INERT until the route pops — on EVERY
    // platform (native lag reported 2026-08-02). Short exits, pop on a
    // TIMER so a janked frame can't hold the page below hostage.
    const exitMs = isWeb ? 120 : 160;
    backdropOpacity.value = withTiming(0, { duration: exitMs });
    sheetOffset.value = withTiming(closedOffset, { duration: exitMs, easing: Easing.in(Easing.cubic) });
    setTimeout(goBack, exitMs + 10);
  }

  // Data-loss guard (HIG: confirm dismissal when unsaved changes loom).
  // "Dirty" = any field differs from what the sheet opened with.
  const isDirty =
    title !== (initial?.title ?? '') ||
    description !== (initial?.description ?? '') ||
    priority !== (initial?.priority ?? null) ||
    (category?.name ?? null) !== (initial?.category?.name ?? null) ||
    (subject?.name ?? null) !== (initial?.subject?.name ?? null) ||
    (dueDate?.getTime() ?? null) !== (initial?.dueDate?.getTime() ?? null);

  async function maybeClose() {
    if (!isDirty) {
      close();
      return;
    }
    sheetOffset.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
    const discard = await confirmDialog({
      title: 'Discard changes?',
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (discard) close();
  }

  // The button stays tappable during the ~260ms close animation — without a
  // synchronous guard a double tap submits (and creates) twice.
  const submitted = useRef(false);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed || submitted.current) return;
    submitted.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSubmit({
      title: trimmed,
      dueDate,
      description: description.trim(),
      priority,
      category,
      subject,
    });
    close();
  }

  // Long-press a lifestyle box or subject chip to delete it. These aren't
  // their own records (just the distinct values across your tasks), so
  // deleting clears it off every task that carries it — the confirm says
  // how many. Deleting a lifestyle also clears its subjects on those tasks
  // (a subject can't exist without a lifestyle).
  async function removeOption(kind: 'lifestyle' | 'subject', option: NamedColor) {
    const inUse = (tasks ?? []).filter((t) =>
      kind === 'lifestyle' ? t.category === option.name : t.subject === option.name
    ).length;
    const confirmed = await confirmDialog({
      title: `Delete ${kind} “${option.name}”?`,
      message:
        inUse > 0
          ? `It’ll be removed from ${inUse} task${inUse === 1 ? '' : 's'}${kind === 'lifestyle' ? ', along with their subjects' : ''}.`
          : 'This removes it from the list.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    if (kind === 'lifestyle') {
      setExtraLifestyles((prev) => prev.filter((c) => c.name !== option.name));
      setExtraSubjectsByLifestyle((prev) => {
        const next = new Map(prev);
        next.delete(option.name);
        return next;
      });
      if (category?.name === option.name) {
        setCategory(null);
        setSubject(null);
      }
      if (activeLifestyle === option.name) setActiveLifestyle(null);
      if (inUse > 0) deleteCategory.mutate(option.name);
    } else {
      setExtraSubjectsByLifestyle((prev) => {
        const next = new Map(prev);
        for (const [k, list] of next) next.set(k, list.filter((s) => s.name !== option.name));
        return next;
      });
      if (subject?.name === option.name) setSubject(null);
      if (inUse > 0) deleteSubject.mutate(option.name);
    }
    toast.show({ message: `${kind === 'lifestyle' ? 'Lifestyle' : 'Subject'} deleted.` });
  }

  // Date/time picker reveal — animated height, slide open/closed.
  const [picker, setPickerRaw] = useState<'date' | 'time' | null>(null);
  const [renderedPicker, setRenderedPicker] = useState<'date' | 'time' | null>(null);
  const pickerHeight = useSharedValue(0);
  // iOS: inline calendar / minute wheel. Web: a compact HTML input row.
  const PICKER_HEIGHTS = isWeb ? ({ date: 56, time: 56 } as const) : ({ date: 360, time: 216 } as const);

  function setPicker(next: 'date' | 'time' | null) {
    setPickerRaw(next);
    if (Platform.OS === 'android') {
      // Android pickers are system dialogs — nothing inline to animate.
      setRenderedPicker(next);
      return;
    }
    if (next) {
      setRenderedPicker(next);
      pickerHeight.value = withTiming(PICKER_HEIGHTS[next], SLIDE);
    } else {
      pickerHeight.value = withTiming(0, SLIDE, (finished) => {
        if (finished) runOnJS(setRenderedPicker)(null);
      });
    }
  }

  const pickerContainerStyle = useAnimatedStyle(() => ({
    height: pickerHeight.value,
    overflow: 'hidden',
  }));

  // The WHOLE SHEET drags down to dismiss (developer request) — follows the
  // finger, springs back below the threshold, confirms when dirty. Runs
  // simultaneously with the body scroll but only engages while the scroll
  // sits at the top; horizontal movement fails it (chip rows). Disabled
  // while a date/time picker is open — spinning the wheel must never drag
  // the sheet. Dragging also tucks the keyboard away.
  const scrollTop = useSharedValue(0);
  const dragBase = useSharedValue(-1);
  const keyboardTucked = useSharedValue(0);
  const bodyScrollGesture = Gesture.Native();

  function tuckKeyboard() {
    Keyboard.dismiss();
  }

  const sheetPan = Gesture.Pan()
    .enabled(!isWeb && renderedPicker === null)
    .activeOffsetY(12)
    .failOffsetX([-14, 14])
    .simultaneousWithExternalGesture(bodyScrollGesture)
    .onStart(() => {
      dragBase.value = -1;
      keyboardTucked.value = 0;
    })
    .onUpdate((event) => {
      if (scrollTop.value <= 0.5 && event.translationY > 0) {
        if (dragBase.value < 0) dragBase.value = event.translationY;
        sheetOffset.value = Math.max(0, event.translationY - dragBase.value);
        if (sheetOffset.value > 20 && keyboardTucked.value === 0) {
          keyboardTucked.value = 1;
          runOnJS(tuckKeyboard)();
        }
      } else {
        dragBase.value = -1;
        sheetOffset.value = 0;
      }
    })
    .onEnd((event) => {
      if (sheetOffset.value > 120 || (sheetOffset.value > 30 && event.velocityY > 800)) {
        runOnJS(maybeClose)();
      } else {
        sheetOffset.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  function onPickerChange(selected: Date | null, dismissed: boolean) {
    if (dismissed) {
      setPicker(null);
      return;
    }
    if (selected) {
      emitTourEvent('form-date-set');
      setDueDate((current) => {
        const base = current ?? endOfToday();
        const next = new Date(base);
        if (renderedPicker === 'date') {
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        } else {
          next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        }
        return next;
      });
    }
    if (Platform.OS === 'android') setPicker(null);
  }

  const chipStyle = {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    paddingHorizontal: space.s3,
    paddingVertical: space.s2,
  } as const;

  const maxBodyHeight = Math.max(200, screenHeight - keyboardHeight - insets.top - 220);

  return (
    <View
      style={[styles.container, isWeb && styles.containerWeb]}
      pointerEvents={dismissing ? 'none' : 'auto'}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      {/* Tap outside (or drag the sheet down) to cancel; unsaved changes
          get a discard confirmation. */}
      <Pressable style={styles.backdropTouch} onPress={maybeClose} accessibilityRole="button" accessibilityLabel="Close" />
      <GestureDetector gesture={sheetPan}>
      <Animated.View
        style={[
          styles.sheet,
          isWeb && styles.sheetWeb,
          onTablet && tabletSheet,
          sheetStyle,
          {
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            padding: space.s4,
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + space.s3 : Math.max(insets.bottom, space.s4),
          },
          isWeb && {
            borderBottomLeftRadius: radius.card,
            borderBottomRightRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            paddingBottom: space.s4,
          },
        ]}>
        {/* Grabber: role=button (not "adjustable" — that promises increment/
            decrement actions we don't implement, and VoiceOver announces a
            broken control). Tap-to-close gives assistive tech a real
            equivalent of the drag-down gesture. */}
        {!isWeb && (
          <Pressable
            style={styles.grabberZone}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint="Closes the form. Drag down to dismiss."
            onPress={maybeClose}>
            <View style={[styles.grabber, { backgroundColor: colors.borderSubtle }]} />
          </Pressable>
        )}

        <GestureDetector gesture={bodyScrollGesture}>
        <ScrollView
          // The ScrollView clips at its bounds, which used to force the tour
          // rings to ringPadX 0 - the border then painted over the leading
          // letters of "Priority"/"Category" (developer report 2026-08-17).
          // Pull the scroller RING_GUTTER wider on each side and pad the
          // content back: layout looks identical, but rings now have an
          // in-bounds gutter to draw into.
          style={{ maxHeight: maxBodyHeight, marginHorizontal: -RING_GUTTER }}
          contentContainerStyle={{ paddingHorizontal: RING_GUTTER }}
          bounces={false}
          onScroll={(e) => {
            scrollTop.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <TextInput
            style={[
              styles.titleInput,
              {
                borderColor: colors.borderSubtle,
                borderRadius: radius.button,
                color: colors.textPrimary,
                paddingHorizontal: space.s3,
              },
            ]}
            placeholder="Task title"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={TASK_TITLE_MAX}
            ref={titleInputRef}
            // Done only dismisses the keyboard; submitting is the button's job.
            returnKeyType="done"
          />

          {/* marginTop lives on the ANCHOR so the tour ring hugs the chips
              (inside, the margin read as dead space above them). */}
          <TourAnchor ringPadX={FORM_RING_X} ringPadY={FORM_RING_Y} id="form-when" style={{ marginTop: space.s3 }}>
          <View style={[styles.chipRow, { gap: space.s2 }]}>
            {dueDate ? (
              <>
                <Pressable
                  onPress={() => setPicker(picker === 'date' ? null : 'date')}
                  accessibilityRole="button"
                  accessibilityLabel="Change due date"
                  style={chipStyle}>
                  <Text style={{ fontFamily: monoFont, fontSize: 13, color: colors.textPrimary }}>
                    {dueDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPicker(picker === 'time' ? null : 'time')}
                  accessibilityRole="button"
                  accessibilityLabel="Change due time"
                  style={chipStyle}>
                  <Text style={{ fontFamily: monoFont, fontSize: 13, color: colors.textPrimary }}>
                    {dueDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPicker(null);
                    setDueDate(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove due date"
                  style={chipStyle}>
                  <Text style={{ fontSize: 13, color: colors.textTertiary }}>✕</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setDueDate(endOfToday());
                  setPicker('date');
                }}
                accessibilityRole="button"
                accessibilityLabel="Add due date"
                style={chipStyle}>
                <Text style={{ fontFamily: monoFont, fontSize: 13, color: colors.textSecondary }}>
                  Add date
                </Text>
              </Pressable>
            )}
          </View>
          </TourAnchor>

          {Platform.OS !== 'android' ? (
            <Animated.View style={pickerContainerStyle}>
              {renderedPicker && (
                <View style={{ paddingTop: space.s2 }}>
                  <InlineDatePicker
                    mode={renderedPicker}
                    value={dueDate ?? endOfToday()}
                    onChange={onPickerChange}
                  />
                </View>
              )}
            </Animated.View>
          ) : (
            renderedPicker && (
              <InlineDatePicker
                mode={renderedPicker}
                value={dueDate ?? endOfToday()}
                onChange={onPickerChange}
              />
            )
          )}

          {/* ---------------------- Details (collapsed) ---------------------- */}
          <TourAnchor ringPadX={FORM_RING_X} ringPadY={FORM_RING_Y} id="form-details" style={{ marginTop: space.s3, alignSelf: 'flex-start' }}>
          <Pressable
            onPress={() => {
              // Emit OUTSIDE the state updater — updaters run during render,
              // and advancing the tour from render gets dropped by React.
              if (!detailsOpen) emitTourEvent('form-details-open');
              setDetailsOpen((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            style={[styles.detailsToggle, { gap: space.s1 }]}>
            <Text style={[type.body, { color: colors.accent }]}>Details</Text>
            <IconSymbol
              name={detailsOpen ? 'chevron.down' : 'chevron.right'}
              size={14}
              color={colors.accent}
            />
          </Pressable>
          </TourAnchor>

          <CollapsibleReveal open={detailsOpen}>
            <View style={{ gap: space.s3, paddingTop: space.s2 }}>
              {/* Labels sit OUTSIDE the tour anchors so the ring can never
                  strike through them (developer rounds 1-3). */}
              <View style={{ gap: space.s2 }}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Priority</Text>
              {/* flex-start: the ring shrink-wraps the chips instead of
                  spanning the sheet and kissing its side edges (developer
                  round 4). Creator rows need full width, so category and
                  subject stretch only while their creator is open. */}
              <TourAnchor ringPadX={FORM_RING_X} ringPadY={FORM_RING_Y} id="form-priority" style={{ alignSelf: 'flex-start' }}>
              <View style={[styles.wrapRow, { gap: space.s2 }]}>
                <SelectChip label="None" selected={priority == null} onPress={() => setPriorityValue(null)} />
                {[1, 2, 3].map((tier) => (
                  <SelectChip
                    key={tier}
                    label={priorityTiers[tier].label}
                    selected={priority === tier}
                    onPress={() => { setPriorityValue(tier); emitTourEvent('form-priority-set'); }}
                  />
                ))}
              </View>
              </TourAnchor>
              </View>

              {/* THE LIFESTYLE SELECTOR (developer revamp 2026-08-26).
                  States: summary (something picked) / list (nothing picked) /
                  expanded (one lifestyle open, its subjects + "+new" inside;
                  the other lifestyles slide away underneath). Expanding IS
                  selecting; tapping the expanded box again clears it. */}
              <View style={{ gap: space.s2 }}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Lifestyle</Text>
              <TourAnchor ringPadX={FORM_RING_X} ringPadY={FORM_RING_Y} id="form-lifestyle">
              <View style={{ gap: space.s2 }}>
                {category && activeLifestyle === null ? (
                  // STACKED summary: the subject box with the lifestyle's
                  // color bar peeking at its top (the ( a ( b ) overlap).
                  <RightClickMenu
                    items={[
                      ...(subject
                        ? [{ label: `Delete subject “${subject.name}”`, destructive: true, onPress: () => removeOption('subject', subject) }]
                        : []),
                      { label: `Delete lifestyle “${category.name}”`, destructive: true, onPress: () => removeOption('lifestyle', category) },
                    ]}>
                  <Pressable
                    onPress={() => {
                      animateListChanges();
                      setActiveLifestyle(category.name);
                    }}
                    onLongPress={() =>
                      removeOption(subject ? 'subject' : 'lifestyle', subject ?? category)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Lifestyle ${category.name}${subject ? `, subject ${subject.name}` : ''}. Tap to change.`}
                    style={[styles.lifestyleBox, { borderColor: colors.borderSubtle, borderRadius: radius.button }]}>
                    <View style={[styles.lifestyleBar, { backgroundColor: category.color }]} />
                    <View style={[styles.lifestyleBody, { paddingHorizontal: space.s3 }]}>
                      {subject && (
                        <View style={[styles.subjectDot, { backgroundColor: subject.color }]} />
                      )}
                      <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>
                        {subject ? subject.name : category.name}
                      </Text>
                      {subject && (
                        <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400' }]} numberOfLines={1}>
                          {category.name}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                  </RightClickMenu>
                ) : activeLifestyle !== null ? (
                  // EXPANDED: only the active lifestyle shows; subjects
                  // (alphabetical) inside, "+new" always last and open.
                  (() => {
                    const group = groups.find((g) => g.name === activeLifestyle);
                    if (!group) return null;
                    return (
                      <View style={[styles.lifestyleBox, { borderColor: colors.accent, borderRadius: radius.button }]}>
                        <RightClickMenu
                          items={[{ label: `Delete lifestyle “${group.name}”`, destructive: true, onPress: () => removeOption('lifestyle', { name: group.name, color: group.color }) }]}>
                        <Pressable
                          onPress={() => {
                            // Second tap clears the selection (spec).
                            animateListChanges();
                            setCategory(null);
                            setSubject(null);
                            setActiveLifestyle(null);
                            setCreating(null);
                          }}
                          onLongPress={() => removeOption('lifestyle', { name: group.name, color: group.color })}
                          accessibilityRole="button"
                          accessibilityState={{ selected: true }}
                          accessibilityLabel={`Lifestyle ${group.name} selected. Tap to clear.`}>
                          <View style={[styles.lifestyleBar, { backgroundColor: group.color }]} />
                          <View style={[styles.lifestyleBody, { paddingHorizontal: space.s3 }]}>
                            <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                              {group.name}
                            </Text>
                          </View>
                        </Pressable>
                        </RightClickMenu>
                        <View style={[styles.subjectList, { paddingHorizontal: space.s3, paddingBottom: space.s3, gap: space.s2 }]}>
                          <View style={[styles.wrapRow, { gap: space.s2 }]}>
                            {group.subjects.map((s) => (
                              <SelectChip
                                key={s.name}
                                label={s.name}
                                color={s.color}
                                selected={subject?.name === s.name}
                                onPress={() => {
                                  animateListChanges();
                                  setSubject(s);
                                  setActiveLifestyle(null);
                                  setCreating(null);
                                  emitTourEvent('form-subject-set');
                                }}
                                onDelete={() => removeOption('subject', s)}
                                deleteLabel={`Delete subject “${s.name}”`}
                              />
                            ))}
                            <SelectChip
                              label="＋new"
                              selected={creating === 'subject'}
                              onPress={() => setCreating(creating === 'subject' ? null : 'subject')}
                            />
                          </View>
                          {creating === 'subject' && (
                            <NewOptionCreator
                              placeholder="New subject name"
                              onCreate={(option) => {
                                setExtraSubjectsByLifestyle((prev) => {
                                  const next = new Map(prev);
                                  next.set(group.name, [...(next.get(group.name) ?? []), option]);
                                  return next;
                                });
                                animateListChanges();
                                setSubject(option);
                                setActiveLifestyle(null);
                                setCreating(null);
                                emitTourEvent('form-subject-set');
                              }}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  // LIST: every lifestyle (alphabetical) + "+ New" last.
                  <View style={{ gap: space.s2 }}>
                    {groups.map((g) => (
                      <RightClickMenu
                        key={g.name}
                        items={[{ label: `Delete lifestyle “${g.name}”`, destructive: true, onPress: () => removeOption('lifestyle', { name: g.name, color: g.color }) }]}>
                      <Pressable
                        onPress={() => {
                          // Expanding IS selecting (spec) — the subjects
                          // drop down automatically.
                          animateListChanges();
                          setCategory({ name: g.name, color: g.color });
                          setSubject(null);
                          setActiveLifestyle(g.name);
                          emitTourEvent('form-category-set');
                        }}
                        onLongPress={() => removeOption('lifestyle', { name: g.name, color: g.color })}
                        accessibilityRole="button"
                        accessibilityLabel={`Lifestyle ${g.name}, ${g.subjects.length} subjects`}
                        style={[styles.lifestyleBox, { borderColor: colors.borderSubtle, borderRadius: radius.button }]}>
                        <View style={[styles.lifestyleBar, { backgroundColor: g.color }]} />
                        <View style={[styles.lifestyleBody, { paddingHorizontal: space.s3 }]}>
                          <Text style={[type.body, { color: colors.textPrimary }]} numberOfLines={1}>
                            {g.name}
                          </Text>
                        </View>
                      </Pressable>
                      </RightClickMenu>
                    ))}
                    <SelectChip
                      label="＋ New"
                      selected={creating === 'lifestyle'}
                      onPress={() => setCreating(creating === 'lifestyle' ? null : 'lifestyle')}
                    />
                    {creating === 'lifestyle' && (
                      <NewOptionCreator
                        placeholder="New lifestyle name"
                        onCreate={(option) => {
                          setExtraLifestyles((prev) => [...prev, option]);
                          animateListChanges();
                          setCategory(option);
                          setSubject(null);
                          setActiveLifestyle(option.name);
                          setCreating(null);
                          emitTourEvent('form-category-set');
                        }}
                      />
                    )}
                  </View>
                )}
              </View>
              </TourAnchor>
              </View>

              <View style={{ gap: space.s2 }}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Description</Text>
              <TourAnchor ringPadX={FORM_RING_X} ringPadY={FORM_RING_Y} id="form-notes">
              <TextInput
                style={[
                  styles.descriptionInput,
                  {
                    borderColor: colors.borderSubtle,
                    borderRadius: radius.button,
                    color: colors.textPrimary,
                    padding: space.s3,
                  },
                ]}
                placeholder="Optional notes"
                placeholderTextColor={colors.textTertiary}
                value={description}
                onChangeText={setDescription}
                maxLength={TASK_DESCRIPTION_MAX}
                multiline
              />
              </TourAnchor>
              </View>
            </View>
          </CollapsibleReveal>
        </ScrollView>
        </GestureDetector>

        <TourAnchor ringPadX={FORM_RING_X} ringPadY={FORM_RING_Y} id="form-submit" style={{ marginTop: space.s4 }}>
        <Pressable
          onPress={submit}
          disabled={!title.trim()}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.button,
              opacity: !title.trim() ? 0.3 : pressed ? 0.85 : 1,
            },
          ]}>
          <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>{submitLabel}</Text>
        </Pressable>
        </TourAnchor>
      </Animated.View>
      </GestureDetector>
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
    maxWidth: 560,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000', // opacity is animated
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
  },
  grabberZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 12,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 999,
  },
  titleInput: {
    minHeight: 44, // min, not fixed: Dynamic Type must grow rows, not clip
    borderWidth: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  lifestyleBox: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  lifestyleBar: {
    height: 6,
  },
  lifestyleBody: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectList: {},
  subjectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  descriptionInput: {
    minHeight: 72,
    borderWidth: 1,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  submitButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
