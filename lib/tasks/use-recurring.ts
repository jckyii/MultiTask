// Recurring daily tasks — the data behind the Daily view. A recurring task
// is "done today" when a completion row exists for the device's current
// calendar day. Dual-mode transport like use-tasks.ts: local SQLite when
// PowerSync is active (dev build), Supabase REST otherwise (Expo Go).
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { newNumericId, newUuid } from '@/lib/sync/ids';
import { syncDb } from '@/lib/sync/system';
import { emitTourEvent, getTourRecurringId, setTourRecurringId } from '@/lib/tour/events';
import { localDateKey } from './calendar';

export type RecurringTask = {
  id: number;
  title: string;
  sortOrder: number;
  doneToday: boolean;
};

type RecurringTaskRow = {
  id: number;
  title: string;
  sort_order: number;
  archived_at: string | null;
};

// The canonical day-key implementation lives in calendar.ts; re-exported so
// existing imports keep working.
export { localDateKey };

const RECURRING_KEY = ['recurring'] as const;
const RECURRING_MUTATION_KEY = ['recurring-mutations'] as const;

export function useRecurringTasks() {
  return useQuery({ queryKey: RECURRING_KEY, queryFn: fetchRecurring });
}

async function fetchRecurring(): Promise<RecurringTask[]> {
  const today = localDateKey();
  const db = syncDb();
  if (db) {
    const tasks = await db.getAll<{ id: string; title: string; sort_order: number }>(
      'SELECT id, title, sort_order FROM recurring_task WHERE archived_at IS NULL ORDER BY sort_order, created_at'
    );
    const done = await db.getAll<{ recurring_task_id: number }>(
      'SELECT recurring_task_id FROM recurring_completion WHERE done_on = ?',
      [today]
    );
    const doneIds = new Set(done.map((row) => Number(row.recurring_task_id)));
    return tasks.map((row) => ({
      id: Number(row.id),
      title: row.title,
      sortOrder: row.sort_order,
      doneToday: doneIds.has(Number(row.id)),
    }));
  }

  const [tasksResult, completionsResult] = await Promise.all([
    supabase
      .from('recurring_task')
      .select('id, title, sort_order, archived_at')
      .is('archived_at', null)
      .order('sort_order')
      .order('created_at'),
    supabase.from('recurring_completion').select('recurring_task_id').eq('done_on', today),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (completionsResult.error) throw completionsResult.error;
  const doneIds = new Set(
    (completionsResult.data as { recurring_task_id: number }[]).map((row) => row.recurring_task_id)
  );
  return (tasksResult.data as RecurringTaskRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    sortOrder: row.sort_order,
    doneToday: doneIds.has(row.id),
  }));
}

async function applyOptimistic(
  queryClient: QueryClient,
  update: (tasks: RecurringTask[]) => RecurringTask[]
): Promise<{ previous: RecurringTask[] | undefined }> {
  await queryClient.cancelQueries({ queryKey: RECURRING_KEY });
  const previous = queryClient.getQueryData<RecurringTask[]>(RECURRING_KEY);
  queryClient.setQueryData<RecurringTask[]>(RECURRING_KEY, (old) => update(old ?? []));
  return { previous };
}

function rollback(queryClient: QueryClient, context?: { previous: RecurringTask[] | undefined }) {
  if (!context?.previous) return;
  // Same concurrent-mutation guard as use-tasks: a whole-array snapshot is
  // stale while other recurring mutations are in flight.
  if (queryClient.isMutating({ mutationKey: RECURRING_MUTATION_KEY }) > 1) return;
  queryClient.setQueryData(RECURRING_KEY, context.previous);
}

function settleInvalidate(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: RECURRING_MUTATION_KEY }) === 1) {
    queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
  }
}

async function currentUserUuid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uuid = data.session?.user.id;
  if (!uuid) throw new Error('Not signed in');
  return uuid;
}

export function useAddRecurringTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: RECURRING_MUTATION_KEY,
    mutationFn: async ({ title, sortOrder }: { title: string; sortOrder: number; tempId: number }): Promise<RecurringTask> => {
      const userUuid = await currentUserUuid();
      const db = syncDb();
      if (db) {
        const id = newNumericId();
        await db.execute(
          'INSERT INTO recurring_task (id, user_uuid, title, sort_order, created_at, archived_at) VALUES (?,?,?,?,?,NULL)',
          [String(id), userUuid, title, sortOrder, new Date().toISOString()]
        );
        return { id, title, sortOrder, doneToday: false };
      }
      const { data, error } = await supabase
        .from('recurring_task')
        .insert({ user_uuid: userUuid, title, sort_order: sortOrder })
        .select('id, title, sort_order')
        .single();
      if (error) throw error;
      const row = data as { id: number; title: string; sort_order: number };
      return { id: row.id, title: row.title, sortOrder: row.sort_order, doneToday: false };
    },
    onMutate: ({ title, sortOrder, tempId }) => {
      // Track the created row so the tour's check-off step rings IT, not
      // whichever daily sorts first. Follows the id through the temp swap.
      setTourRecurringId(tempId);
      emitTourEvent('recurring-added');
      return applyOptimistic(queryClient, (tasks) => [
        ...tasks,
        { id: tempId, title, sortOrder, doneToday: false },
      ]);
    },
    // Swap the temp row for the real one immediately — until the refetch
    // lands, toggling/archiving the new row would otherwise target the temp
    // id, and a Supabase update matching zero rows "succeeds" silently.
    onSuccess: (created, { tempId }) => {
      if (getTourRecurringId() === tempId) setTourRecurringId(created.id);
      queryClient.setQueryData<RecurringTask[]>(RECURRING_KEY, (old) =>
        old?.map((t) => (t.id === tempId ? created : t))
      );
    },
    onError: (_error, _vars, context) => rollback(queryClient, context),
    onSettled: () => settleInvalidate(queryClient),
  });
}

export function useSetRecurringDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: RECURRING_MUTATION_KEY,
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => {
      const today = localDateKey();
      const db = syncDb();
      if (db) {
        if (done) {
          const userUuid = await currentUserUuid();
          await db.execute(
            'INSERT INTO recurring_completion (id, recurring_task_id, user_uuid, done_on) VALUES (?,?,?,?)',
            [newUuid(), id, userUuid, today]
          );
        } else {
          await db.execute('DELETE FROM recurring_completion WHERE recurring_task_id=? AND done_on=?', [
            id,
            today,
          ]);
        }
        return;
      }
      if (done) {
        const userUuid = await currentUserUuid();
        // upsert + ignoreDuplicates: another device may have completed the
        // same task today — that's agreement, not an error. A plain insert
        // would 23505 and roll the checkmark back off a task that IS done.
        const { error } = await supabase
          .from('recurring_completion')
          .upsert(
            { recurring_task_id: id, user_uuid: userUuid, done_on: today },
            { onConflict: 'recurring_task_id,done_on', ignoreDuplicates: true }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recurring_completion')
          .delete()
          .eq('recurring_task_id', id)
          .eq('done_on', today);
        if (error) throw error;
      }
    },
    onMutate: ({ id, done }) => {
      if (done) emitTourEvent('recurring-checked');
      return applyOptimistic(queryClient, (tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, doneToday: done } : t))
      );
    },
    onError: (_error, _vars, context) => rollback(queryClient, context),
    onSettled: () => settleInvalidate(queryClient),
  });
}

/** Archive, not delete — completion history stays in the database. */
export function useArchiveRecurringTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: RECURRING_MUTATION_KEY,
    mutationFn: async (id: number) => {
      const db = syncDb();
      if (db) {
        await db.execute('UPDATE recurring_task SET archived_at=? WHERE id=?', [
          new Date().toISOString(),
          String(id),
        ]);
        return;
      }
      const { error } = await supabase
        .from('recurring_task')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: (id) => applyOptimistic(queryClient, (tasks) => tasks.filter((t) => t.id !== id)),
    onError: (_error, _vars, context) => rollback(queryClient, context),
    onSettled: () => settleInvalidate(queryClient),
  });
}

/** Undo for archive: flips archived_at back (same row, same id). */
export function useUnarchiveRecurringTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: RECURRING_MUTATION_KEY,
    mutationFn: async (task: RecurringTask) => {
      const db = syncDb();
      if (db) {
        await db.execute('UPDATE recurring_task SET archived_at=NULL WHERE id=?', [String(task.id)]);
        return;
      }
      const { error } = await supabase.from('recurring_task').update({ archived_at: null }).eq('id', task.id);
      if (error) throw error;
    },
    onMutate: (task) =>
      applyOptimistic(queryClient, (tasks) =>
        [...tasks, task].sort((a, b) => a.sortOrder - b.sortOrder)
      ),
    onError: (_error, _vars, context) => rollback(queryClient, context),
    onSettled: () => settleInvalidate(queryClient),
  });
}
