// Task-specific swipe semantics on top of the shared SwipeableRow engine:
//   live task:      right = complete (green, check) · left = delete (red, trash)
//   completed task: right = restore  (accent, undo) · left = delete (red, trash)
//   trashed task:   right = restore  (accent, undo) · left = PERMANENT delete
// The screen decides what actually happens via onSwipeRight/onSwipeLeft.
import { SwipeableRow } from '@/components/swipeable-row';
import { TaskCard } from '@/components/task-card';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { deriveStatus } from '@/lib/tasks/status';
import type { Task } from '@/lib/tasks/types';
import { useTheme } from '@/lib/theme/use-theme';

type Props = {
  task: Task;
  onSwipeRight: (task: Task) => void;
  onSwipeLeft: (task: Task) => void;
  onPress?: (task: Task) => void;
  enterFrom?: 'left' | 'right' | null;
  onEntered?: (id: number) => void;
  exit?: { to: 'left' | 'right'; delayMs: number } | null;
  showDescription?: boolean;
  /** One-line bar variant (see TaskCard.compact). */
  compact?: boolean;
};

export function SwipeableTaskCard({ task, onSwipeRight, onSwipeLeft, onPress, enterFrom, onEntered, exit, showDescription, compact }: Props) {
  const { colors } = useTheme();
  const urgencyThresholdHours = useUrgencyThreshold();

  // Right swipe = complete for live tasks, restore for completed/trashed ones.
  const rightIsRestore = task.isCompleted || task.deletedAt != null;

  // Hover aura (web/desktop) matches the task's status color; neutral
  // statuses glow in the theme accent.
  const status = deriveStatus(task, { urgencyThresholdHours });
  const auraColor =
    status === 'overdue'
      ? colors.statusOverdueAccent
      : status === 'urgent'
        ? colors.statusUrgentAccent
        : status === 'ongoing'
          ? colors.statusOngoingAccent
          : colors.accent;

  return (
    <SwipeableRow
      hoverAuraColor={auraColor}
      rightAction={{
        color: rightIsRestore ? colors.accent : colors.statusOngoingAccent,
        icon: rightIsRestore ? 'arrow.uturn.backward' : 'checkmark',
      }}
      leftAction={{ color: colors.statusOverdueAccent, icon: 'trash.fill' }}
      onSwipeRight={() => onSwipeRight(task)}
      onSwipeLeft={() => onSwipeLeft(task)}
      resetKey={`${task.id}|${task.isCompleted}|${task.deletedAt != null}`}
      enterFrom={enterFrom}
      onEntered={onEntered && (() => onEntered(task.id))}
      exit={exit}>
      <TaskCard
        task={task}
        onPress={onPress}
        onToggleComplete={onSwipeRight}
        onDelete={onSwipeLeft}
        showDescription={showDescription}
        compact={compact}
      />
    </SwipeableRow>
  );
}
