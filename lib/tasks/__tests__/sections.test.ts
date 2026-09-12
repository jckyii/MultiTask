import { groupTasks } from '../sections';
import type { Task } from '../types';

const NOW = new Date(2026, 6, 15, 12, 0, 0); // Wed July 15 2026, 12:00 local

let nextId = 1;
function task(overrides: Partial<Task>): Task {
  return {
    id: nextId++,
    title: 't',
    description: '',
    createdAt: NOW,
    dueDate: null,
    isCompleted: false,
    subject: '',
    subjectColor: '#e5e7eb',
    category: 'Uncategorized',
    categoryColor: '#fef3c7',
    priority: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('groupTasks', () => {
  test('routes tasks to the right buckets by calendar day', () => {
    const sections = groupTasks(
      [
        task({ title: 'overdue', dueDate: new Date(2026, 6, 15, 9, 0) }), // this morning, past
        task({ title: 'today', dueDate: new Date(2026, 6, 15, 18, 0) }), // this evening
        task({ title: 'tomorrow', dueDate: new Date(2026, 6, 16, 9, 0) }),
        task({ title: 'later', dueDate: new Date(2026, 6, 20, 9, 0) }),
        task({ title: 'dateless' }),
        task({ title: 'done', dueDate: new Date(2026, 6, 15, 9, 0), isCompleted: true }),
        task({ title: 'trashed', dueDate: new Date(2026, 6, 15, 18, 0), deletedAt: NOW }),
      ],
      NOW
    );
    expect(sections.map((s) => [s.key, s.data.map((t) => t.title)])).toEqual([
      ['completed', ['done']],
      ['overdue', ['overdue']],
      ['today', ['today']],
      ['tomorrow', ['tomorrow']],
      ['upcoming', ['later']],
      ['noDueDate', ['dateless']],
      ['deleted', ['trashed']],
    ]);
  });

  test('deleted wins over completed and overdue (trash is trash)', () => {
    const sections = groupTasks(
      [task({ dueDate: new Date(2026, 6, 1), isCompleted: true, deletedAt: NOW })],
      NOW
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('deleted');
  });

  test('completed wins over overdue (a done task is never in Overdue)', () => {
    const sections = groupTasks([task({ dueDate: new Date(2026, 6, 1), isCompleted: true })], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('completed');
  });

  test('empty sections are omitted entirely', () => {
    const sections = groupTasks([task({ title: 'only', dueDate: new Date(2026, 6, 15, 18, 0) })], NOW);
    expect(sections.map((s) => s.key)).toEqual(['today']);
  });

  test('prioritised tasks gather in a Priority section at the top (2026-09-12)', () => {
    const at18 = new Date(2026, 6, 15, 18, 0);
    const sections = groupTasks(
      [
        task({ title: 'no-prio', dueDate: at18 }),
        task({ title: 'second', dueDate: at18, priority: 2 }),
        task({ title: 'first-late', dueDate: new Date(2026, 6, 20, 9, 0), priority: 1 }),
        task({ title: 'first-early', dueDate: at18, priority: 1 }),
        task({ title: 'earlier', dueDate: new Date(2026, 6, 15, 14, 0) }),
        // Completed/deleted prioritised tasks stay in their own groups.
        task({ title: 'done-first', dueDate: at18, priority: 1, isCompleted: true }),
      ],
      NOW
    );
    expect(sections.map((s) => [s.key, s.data.map((t) => t.title)])).toEqual([
      ['completed', ['done-first']],
      ['priority', ['first-early', 'first-late', 'second']],
      ['today', ['earlier', 'no-prio']],
    ]);
  });
});
