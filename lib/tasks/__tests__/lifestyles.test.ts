import { lifestyleGroups } from '../lifestyles';
import type { Task } from '../types';

function task(over: Partial<Task>): Task {
  return {
    id: Math.random() * 1e6,
    title: 'x',
    description: '',
    dueDate: null,
    category: 'Uncategorized',
    categoryColor: '#999999',
    subject: null,
    subjectColor: '#999999',
    priority: null,
    isCompleted: false,
    deletedAt: null,
    ...over,
  } as Task;
}

describe('lifestyleGroups', () => {
  it('derives lifestyles from categories and nests co-occurring subjects', () => {
    const groups = lifestyleGroups([
      task({ category: 'School', categoryColor: '#60a5fa', subject: 'Chemistry', subjectColor: '#2dd4bf' }),
      task({ category: 'School', categoryColor: '#60a5fa', subject: 'Algebra', subjectColor: '#f472b6' }),
      task({ category: 'Home', categoryColor: '#4ade80' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Home', 'School']);
    expect(groups[1].subjects.map((s) => s.name)).toEqual(['Algebra', 'Chemistry']);
    expect(groups[0].subjects).toEqual([]);
  });

  it('sorts lifestyles and subjects alphabetically', () => {
    const groups = lifestyleGroups([
      task({ category: 'Zed', subject: 'b', subjectColor: '#111111' }),
      task({ category: 'Zed', subject: 'a', subjectColor: '#222222' }),
      task({ category: 'Alpha' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Zed']);
    expect(groups[1].subjects.map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('ignores trash, Uncategorized, and duplicate subjects', () => {
    const groups = lifestyleGroups([
      task({ category: 'Work', subject: 'Meetings', subjectColor: '#111111' }),
      task({ category: 'Work', subject: 'Meetings', subjectColor: '#222222' }),
      task({ category: 'Gone', deletedAt: new Date() }),
      task({ category: 'Uncategorized', subject: 'Orphan' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Work']);
    expect(groups[0].subjects).toEqual([{ name: 'Meetings', color: '#111111' }]);
  });
});
