// Tiny event bus the interactive tour listens on. UI code emits these so
// action steps advance the moment the user actually does the thing.
// Module-level singleton — usable outside React.
export type TourEvent =
  | 'task-created'
  | 'task-completed'
  | 'task-uncompleted'
  | 'task-deleted'
  | 'task-restored'
  | 'form-title-committed'
  | 'form-date-set'
  | 'form-priority-set'
  | 'form-category-set'
  | 'form-subject-set'
  | 'form-subject-cleared'
  | 'form-notes-committed'
  | 'tasks-cleared'
  | 'trash-emptied'
  | 'recurring-added'
  | 'recurring-checked'
  | 'recurring-removed'
  | 'form-details-open'
  | 'calendar-year-open'
  | 'calendar-month-open'
  | 'calendar-week-open'
  | 'calendar-week-list'
  | 'calendar-week-closed';

type Listener = (event: TourEvent) => void;

const listeners = new Set<Listener>();

export function emitTourEvent(event: TourEvent) {
  for (const listener of listeners) listener(event);
}

export function onTourEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The task the tour created — the delete/undo/complete steps ring THIS
// task, not whatever happens to be first in the list (developer report
// 2026-08-14: with existing tasks the ring landed on an old task and the
// real one stayed dimmed out).
let tourTaskId: number | null = null;

export function setTourTaskId(id: number | null) {
  tourTaskId = id;
}

export function getTourTaskId(): number | null {
  return tourTaskId;
}

// Same idea for the daily the tour adds — the check-it-off step must ring
// THAT row, not whichever daily happens to sort first (developer report
// 2026-08-17: with existing dailies the ring locked onto the top one).
let tourRecurringId: number | null = null;

export function setTourRecurringId(id: number | null) {
  tourRecurringId = id;
}

export function getTourRecurringId(): number | null {
  return tourRecurringId;
}
