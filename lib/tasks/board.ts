// The lifestyle BOARD (developer featured idea 2026-09-20): a Notion-style
// arrangement of the open tasks — lifestyles as the major groups, one
// column per subject (plus a trailing Miscellaneous column for tasks that
// carry the lifestyle alone), every column ordered prioritised-first then
// by date. Pure layout logic so it's unit-testable; the views render it.
import type { CatalogLifestyle } from '@/lib/tasks/lifestyle-catalog';
import { mergeGroups } from '@/lib/tasks/lifestyle-catalog';
import { lifestyleGroups } from '@/lib/tasks/lifestyles';
import type { Task } from '@/lib/tasks/types';

export type BoardColumn = {
  /** Display name — the subject, or 'Miscellaneous' for lifestyle-only tasks. */
  title: string;
  /** The subject's pill color; null for the Miscellaneous column. */
  color: string | null;
  isMisc: boolean;
  /** Priority-ranked tasks first (1st → 3rd, date breaking ties)… */
  prioritized: Task[];
  /** …then everything else by date (dateless last). */
  rest: Task[];
};

export type BoardLifestyle = {
  name: string;
  color: string;
  columns: BoardColumn[];
};

export type Board = {
  lifestyles: BoardLifestyle[];
  /** Open tasks with NO lifestyle at all — shown as a final group so
   *  sorting by lifestyle can never hide a task. */
  unsorted: Task[];
  completed: Task[];
  deleted: Task[];
};

const MISC_TITLE = 'Miscellaneous';

function byDue(a: Task, b: Task): number {
  return (
    (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
  );
}

function byPriorityThenDue(a: Task, b: Task): number {
  const rankDiff = (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);
  if (rankDiff !== 0) return rankDiff;
  return byDue(a, b);
}

/** Build the whole board. The skeleton (which lifestyles and subjects
 *  exist, even EMPTY ones — the developer wants blank columns shown) comes
 *  from the persistent catalog merged with what tasks carry; tasks then
 *  fill the columns. */
export function buildBoard(tasks: Task[], catalog: CatalogLifestyle[]): Board {
  const skeleton = mergeGroups(catalog, lifestyleGroups(tasks));

  const lifestyles: BoardLifestyle[] = skeleton.map((g) => ({
    name: g.name,
    color: g.color,
    columns: [
      ...g.subjects.map((s) => ({
        title: s.name,
        color: s.color,
        isMisc: false,
        prioritized: [] as Task[],
        rest: [] as Task[],
      })),
      { title: MISC_TITLE, color: null, isMisc: true, prioritized: [], rest: [] },
    ],
  }));
  const byName = new Map(lifestyles.map((l) => [l.name, l]));

  const unsorted: Task[] = [];
  const completed: Task[] = [];
  const deleted: Task[] = [];

  for (const task of tasks) {
    if (task.deletedAt) {
      deleted.push(task);
      continue;
    }
    if (task.isCompleted) {
      completed.push(task);
      continue;
    }
    const hasLifestyle = task.category && task.category !== 'Uncategorized';
    if (!hasLifestyle) {
      unsorted.push(task);
      continue;
    }
    const lifestyle = byName.get(task.category);
    if (!lifestyle) {
      // Can't happen (the skeleton derives from the same tasks), but a
      // dropped task would be silent data loss — route it visibly instead.
      unsorted.push(task);
      continue;
    }
    const column =
      (task.subject ? lifestyle.columns.find((c) => !c.isMisc && c.title === task.subject) : null) ??
      lifestyle.columns[lifestyle.columns.length - 1];
    if (task.priority != null) column.prioritized.push(task);
    else column.rest.push(task);
  }

  for (const lifestyle of lifestyles) {
    for (const column of lifestyle.columns) {
      column.prioritized.sort(byPriorityThenDue);
      column.rest.sort(byDue);
    }
  }
  unsorted.sort(byDue);
  completed.sort(byDue);
  deleted.sort(byDue);

  return { lifestyles, unsorted, completed, deleted };
}

/** The phone carousel flattens the board into one sequence of pages:
 *  every column of every lifestyle, in order. */
export type BoardPage = { lifestyle: BoardLifestyle; column: BoardColumn };

export function boardPages(board: Board): BoardPage[] {
  const pages: BoardPage[] = [];
  for (const lifestyle of board.lifestyles) {
    for (const column of lifestyle.columns) {
      pages.push({ lifestyle, column });
    }
  }
  return pages;
}
