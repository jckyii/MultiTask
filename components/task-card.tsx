// The task card — the most-touched component in the app (docs/design/02).
// Anatomy: left status accent bar · title · due date (mono, warning icon when
// overdue) · pills (priority first, then category, then subject). Title + due
// date are ALWAYS visible. Description lives in the detail view, not here.
// Complete/delete are swipe gestures (see swipeable-task-card.tsx); the card
// exposes the same actions to screen readers via accessibilityActions.
// No drop shadow — cards separate by border + surface contrast.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LifestylePill, Pill, PriorityBadge } from '@/components/pill';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { formatDueDate } from '@/lib/tasks/dates';
import { deriveStatus } from '@/lib/tasks/status';
import type { Task } from '@/lib/tasks/types';
import { useTheme, type Theme } from '@/lib/theme/use-theme';

type Props = {
  task: Task;
  onToggleComplete?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onPress?: (task: Task) => void;
  onLongPress?: (task: Task) => void;
  /** Desktop day page shows descriptions inline (the space exists there);
   *  phone cards keep description in the detail view only. */
  showDescription?: boolean;
};

export function TaskCard({ task, onToggleComplete, onDelete, onPress, onLongPress, showDescription }: Props) {
  const theme = useTheme();
  const { colors, space, radius, type, monoFont } = theme;
  const urgencyThresholdHours = useUrgencyThreshold();
  const status = deriveStatus(task, { urgencyThresholdHours });
  const surfaces = statusSurfaces(theme);
  const { background, accentBar } = surfaces[status];

  // The label must carry EVERYTHING rule 2 promises visually — an
  // accessibilityLabel on the container replaces the child text for screen
  // readers, so without this VoiceOver would only ever hear the title.
  const statusPhrase =
    status === 'overdue' ? 'overdue' : status === 'urgent' ? 'urgent' : status === 'completed' ? 'completed' : null;
  const accessibilityLabel = [
    task.title,
    task.deletedAt ? 'in trash' : statusPhrase,
    task.dueDate ? `due ${formatDueDate(task.dueDate)}` : 'no due date',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress && (() => onPress(task))}
      onLongPress={onLongPress && (() => onLongPress(task))}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: task.isCompleted }}
      // Swipe gestures need a non-gesture equivalent for assistive tech
      // (docs/design/04 accessibility rules).
      accessibilityActions={[
        {
          name: 'complete',
          label: task.deletedAt
            ? 'Restore task'
            : task.isCompleted
              ? 'Mark as not completed'
              : 'Mark as completed',
        },
        { name: 'delete', label: task.deletedAt ? 'Delete permanently' : 'Delete task' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'complete') onToggleComplete?.(task);
        if (event.nativeEvent.actionName === 'delete') onDelete?.(task);
      }}
      style={[
        styles.card,
        {
          backgroundColor: background,
          borderColor: colors.borderSubtle,
          borderRadius: radius.card,
          padding: space.s4,
        },
      ]}>
      {accentBar && <View style={[styles.accentBar, { backgroundColor: accentBar }]} />}

      {/* Muted look for done/trashed tasks: fade the CONTENT only. The card
          surface stays opaque — a translucent card lets the swipe trails
          behind it bleed through (visible flicker when wiggled). */}
      <View style={[styles.content, { opacity: task.isCompleted || task.deletedAt ? 0.55 : 1 }]}>
        <Text
          numberOfLines={2}
          style={[type.h2, { color: colors.textPrimary }, task.isCompleted && styles.titleCompleted]}>
          {task.title}
        </Text>

        <View style={[styles.dueRow, { gap: space.s1 }]}>
          {/* Non-color status cues (rule 1): overdue = warning triangle,
              urgent = clock (polish pass 2026-08-02 — urgent was the one
              state distinguished by color alone). */}
          {status === 'overdue' && (
            <IconSymbol name="exclamationmark.triangle.fill" size={12} color={colors.statusOverdueAccent} />
          )}
          {status === 'urgent' && (
            <IconSymbol name="clock.fill" size={12} color={colors.statusUrgentAccent} />
          )}
          <Text
            style={{
              fontFamily: monoFont,
              fontSize: 12,
              lineHeight: 16,
              color:
                status === 'overdue'
                  ? colors.statusOverdueAccent
                  : status === 'urgent'
                    ? colors.statusUrgentAccent
                    : colors.textSecondary,
            }}>
            {task.dueDate ? formatDueDate(task.dueDate) : 'No due date'}
          </Text>
        </View>

        {showDescription && task.description.length > 0 && (
          <Text numberOfLines={4} style={[type.body, { color: colors.textSecondary, marginTop: 2 }]}>
            {task.description}
          </Text>
        )}

        <View style={[styles.pillRow, { gap: space.s2, marginTop: space.s2 }]}>
          {task.priority != null && <PriorityBadge priority={task.priority} />}
          <LifestylePill
            lifestyle={task.category}
            lifestyleColor={task.categoryColor}
            subject={task.subject.length > 0 ? task.subject : null}
            subjectColor={task.subjectColor}
          />
        </View>
      </View>
    </Pressable>
  );
}

// Status → card surface + accent bar color (the sacred four, plus completed).
// Redundant encoding per WCAG 1.4.1: the accent bar, overdue warning icon,
// and completed strikethrough repeat what color says.
function statusSurfaces(theme: Theme) {
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
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  content: {
    gap: 4,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
