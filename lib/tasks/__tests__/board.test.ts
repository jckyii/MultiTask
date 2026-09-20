import { boardPages, buildBoard } from '../board';
import type { Task } from '../types';

let nextId = 1;
function task(overrides: Partial<Task>): Task {
  return {
    id: nextId++,
    title: 't',
    description: '',
    createdAt: new Date(2026, 8, 1),
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

const CATALOG = [
  {
    name: 'School',
    color: '#C4B5FD',
    subjects: [
      { name: 'Chem', color: '#F9A8D4' },
      { name: 'Math', color: '#93C5FD' },
    ],
  },
  { name: 'Work', color: '#FDBA74', subjects: [] },
];

describe('buildBoard', () => {
  test('columns per subject plus a trailing Miscellaneous, empty ones included', () => {
    const board = buildBoard([], CATALOG);
    expect(board.lifestyles.map((l) => l.name)).toEqual(['School', 'Work']);
    expect(board.lifestyles[0].columns.map((c) => c.title)).toEqual(['Chem', 'Math', 'Miscellaneous']);
    expect(board.lifestyles[1].columns.map((c) => c.title)).toEqual(['Miscellaneous']);
    expect(board.lifestyles[0].columns[0].prioritized).toEqual([]);
    expect(board.lifestyles[0].columns[0].rest).toEqual([]);
  });

  test('routes tasks: subject column, misc for lifestyle-only, unsorted for none', () => {
    const board = buildBoard(
      [
        task({ title: 'chem hw', category: 'School', subject: 'Chem' }),
        task({ title: 'school only', category: 'School' }),
        task({ title: 'no lifestyle' }),
        task({ title: 'done', category: 'School', subject: 'Chem', isCompleted: true }),
        task({ title: 'gone', category: 'School', deletedAt: new Date() }),
      ],
      CATALOG
    );
    const school = board.lifestyles[0];
    expect(school.columns[0].rest.map((t) => t.title)).toEqual(['chem hw']);
    expect(school.columns[2].rest.map((t) => t.title)).toEqual(['school only']);
    expect(board.unsorted.map((t) => t.title)).toEqual(['no lifestyle']);
    expect(board.completed.map((t) => t.title)).toEqual(['done']);
    expect(board.deleted.map((t) => t.title)).toEqual(['gone']);
  });

  test('inside a column: prioritised first by rank, then the rest by date', () => {
    const board = buildBoard(
      [
        task({ title: 'late', category: 'School', subject: 'Chem', dueDate: new Date(2026, 8, 20) }),
        task({ title: 'early', category: 'School', subject: 'Chem', dueDate: new Date(2026, 8, 10) }),
        task({ title: 'second', category: 'School', subject: 'Chem', priority: 2 }),
        task({ title: 'first', category: 'School', subject: 'Chem', priority: 1 }),
      ],
      CATALOG
    );
    const chem = board.lifestyles[0].columns[0];
    expect(chem.prioritized.map((t) => t.title)).toEqual(['first', 'second']);
    expect(chem.rest.map((t) => t.title)).toEqual(['early', 'late']);
  });

  test('a task whose subject is unknown to the catalog still lands in a column', () => {
    const board = buildBoard(
      [task({ title: 'surprise', category: 'School', subject: 'Physics', subjectColor: '#111' })],
      CATALOG
    );
    const school = board.lifestyles[0];
    // Derived merge adds the Physics column, so nothing is lost.
    const physics = school.columns.find((c) => c.title === 'Physics');
    expect(physics?.rest.map((t) => t.title)).toEqual(['surprise']);
  });

  test('boardPages flattens every column of every lifestyle in order', () => {
    const pages = boardPages(buildBoard([], CATALOG));
    expect(pages.map((p) => `${p.lifestyle.name}/${p.column.title}`)).toEqual([
      'School/Chem',
      'School/Math',
      'School/Miscellaneous',
      'Work/Miscellaneous',
    ]);
  });
});
