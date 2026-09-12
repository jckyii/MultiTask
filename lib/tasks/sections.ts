// Groups tasks into the list sections from docs/design/03 (Today / Tomorrow /
// Later / No due date), plus Overdue at the top and Completed at the bottom.
// Pure function so it's unit-testable; "today" boundaries are calendar days
// in the device's zone (wall-clock semantics, same as everything else).

import type { Task } from './types';

export type SectionKey =
  | 'priority'
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'upcoming'
  | 'noDueDate'
  | 'completed'
  | 'deleted';

export type TaskSection = {
  key: SectionKey;
  title: string;
  data: Task[];
};

const SECTION_TITLES: Record<SectionKey, string> = {
  priority: 'Priority',
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  noDueDate: 'No due date',
  completed: 'Completed',
  deleted: 'Deleted',
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Sort: earlier due date first; ties broken by priority (1st before none).
 *  Dateless tasks sort LAST (MAX_SAFE_INTEGER, matching filter.ts) — with 0
 *  they'd jump to the TOP of the Completed/Deleted sections. */
function byDueThenPriority(a: Task, b: Task): number {
  const dueDiff =
    (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER);
  if (dueDiff !== 0) return dueDiff;
  return (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);
}

/** Priority section order: 1st before 2nd before 3rd, earlier due date
 *  breaking ties (dateless last). */
function byPriorityThenDue(a: Task, b: Task): number {
  const rankDiff = (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);
  if (rankDiff !== 0) return rankDiff;
  return (
    (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
  );
}

export function groupTasks(tasks: Task[], now: Date = new Date()): TaskSection[] {
  const buckets: Record<SectionKey, Task[]> = {
    priority: [],
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    noDueDate: [],
    completed: [],
    deleted: [],
  };

  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const dayAfterStart = addDays(todayStart, 2);

  for (const task of tasks) {
    if (task.deletedAt) buckets.deleted.push(task);
    else if (task.isCompleted) buckets.completed.push(task);
    // Every open prioritised task lives in the Priority section at the top
    // instead of its date group (developer 2026-09-12) — they're ranked by
    // hand, so they must never be mixed in with the rest.
    else if (task.priority != null) buckets.priority.push(task);
    else if (!task.dueDate) buckets.noDueDate.push(task);
    else if (task.dueDate.getTime() < now.getTime()) buckets.overdue.push(task);
    else if (task.dueDate.getTime() < tomorrowStart.getTime()) buckets.today.push(task);
    else if (task.dueDate.getTime() < dayAfterStart.getTime()) buckets.tomorrow.push(task);
    else buckets.upcoming.push(task);
  }

  // Completed sits at the TOP and Deleted (trash) at the BOTTOM, both
  // collapsed by default in the UI. Priority leads the active list, and
  // the date groups after it read strictly by time — developer decisions,
  // 2026-07-09/10 + 2026-09-12.
  const order: SectionKey[] = ['completed', 'priority', 'overdue', 'today', 'tomorrow', 'upcoming', 'noDueDate', 'deleted'];
  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({
      key,
      title: SECTION_TITLES[key],
      data: buckets[key].sort(key === 'priority' ? byPriorityThenDue : byDueThenPriority),
    }));
}
