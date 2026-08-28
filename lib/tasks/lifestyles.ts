// The lifestyle hierarchy (developer revamp 2026-08-26): lifestyles are
// what categories used to be, and every subject lives UNDER one lifestyle.
// The hierarchy is DERIVED from tasks — a lifestyle exists when a task
// carries it, a subject belongs to the lifestyle it co-occurs with — so
// the schema, sync rules, and web app stay untouched. Subjects on
// lifestyle-less tasks were cleared by supabase/13; the form enforces the
// rule going forward (no subject without a lifestyle).
import type { Task } from '@/lib/tasks/types';

export type NamedColor = { name: string; color: string };

export type LifestyleGroup = {
  name: string;
  color: string;
  /** Alphabetical. */
  subjects: NamedColor[];
};

/** Distinct lifestyles with their subjects, both alphabetical (developer
 *  spec). Trash is excluded — deleted tasks shouldn't resurrect options. */
export function lifestyleGroups(tasks: Task[]): LifestyleGroup[] {
  const groups = new Map<string, { color: string; subjects: Map<string, string> }>();
  for (const t of tasks) {
    if (t.deletedAt) continue;
    if (!t.category || t.category === 'Uncategorized') continue;
    let group = groups.get(t.category);
    if (!group) {
      group = { color: t.categoryColor, subjects: new Map() };
      groups.set(t.category, group);
    }
    if (t.subject && !group.subjects.has(t.subject)) {
      group.subjects.set(t.subject, t.subjectColor);
    }
  }
  return [...groups]
    .map(([name, g]) => ({
      name,
      color: g.color,
      subjects: [...g.subjects]
        .map(([subjectName, color]) => ({ name: subjectName, color }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
