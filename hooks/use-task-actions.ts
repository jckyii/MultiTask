// The swipe handlers for task cards — extracted so every screen showing
// tasks (Tasks list, Daily view) gets identical behavior: optimistic
// mutations, undo toasts, regroup animation, entrance marks, error surfacing.
import { useUndoToast } from '@/components/undo-toast';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { animateListChanges } from '@/lib/animate-layout';
import { markEnter } from '@/lib/enter-marks';
import { deriveStatus } from '@/lib/tasks/status';
import type { Task } from '@/lib/tasks/types';
import {
  useDeleteTask,
  usePermanentlyDeleteTask,
  useRestoreTask,
  useSetTaskCompleted,
} from '@/lib/tasks/use-tasks';

export function useTaskActions() {
  const urgencyThresholdHours = useUrgencyThreshold();
  const setCompleted = useSetTaskCompleted();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const permanentlyDelete = usePermanentlyDeleteTask();
  const toast = useUndoToast();

  // A failed mutation rolls the optimistic change back — the task visibly
  // snaps back. Without a message that reads as a spooky bug, so every
  // handler surfaces the failure factually.
  function showError(what: string) {
    return () => toast.show({ message: `Couldn’t ${what} — check your connection.` });
  }

  // EVERY action confirms with a banner, the undos included (developer
  // request 2026-08-26) — each shows its own toast whose Undo runs the
  // inverse action, so undoing is confirmed and reversible again.
  function complete(task: Task) {
    animateListChanges();
    markEnter(task.id, 'right');
    setCompleted.mutate({ id: task.id, isCompleted: true }, { onError: showError('complete the task') });
    toast.show({ message: 'Task completed.', onUndo: () => uncomplete(task) });
  }

  function uncomplete(task: Task) {
    animateListChanges();
    markEnter(task.id, 'right');
    setCompleted.mutate({ id: task.id, isCompleted: false }, { onError: showError('update the task') });
    // Name the status the task actually lands in (developer request
    // 2026-08-26) — "ongoing" covers the no-due-date default too.
    const status = deriveStatus({ ...task, isCompleted: false }, { urgencyThresholdHours });
    const label = status === 'urgent' ? 'urgent' : status === 'overdue' ? 'overdue' : 'ongoing';
    toast.show({ message: `Marked as ${label}.`, onUndo: () => complete(task) });
  }

  function softDelete(task: Task) {
    animateListChanges();
    markEnter(task.id, 'left'); // it enters the trash leftward
    deleteTask.mutate(task.id, { onError: showError('delete the task') });
    toast.show({ message: 'Task deleted.', onUndo: () => restore(task) });
  }

  function restore(task: Task) {
    animateListChanges();
    markEnter(task.id, 'right');
    restoreTask.mutate(task.id, { onError: showError('restore the task') });
    toast.show({ message: 'Task restored.', onUndo: () => softDelete(task) });
  }

  function handleSwipeRight(task: Task) {
    if (task.deletedAt) restore(task);
    else if (task.isCompleted) uncomplete(task);
    else complete(task);
  }

  function handleSwipeLeft(task: Task) {
    if (task.deletedAt) {
      animateListChanges();
      permanentlyDelete.mutate(task.id, { onError: showError('delete the task') });
      toast.show({ message: 'Task permanently deleted.' });
    } else {
      softDelete(task);
    }
  }

  return { handleSwipeRight, handleSwipeLeft };
}
