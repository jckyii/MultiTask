import {
  catalogIsMissing,
  catalogRemoveLifestyle,
  catalogRemoveSubject,
  catalogRenameLifestyle,
  catalogUpsertLifestyle,
  catalogUpsertSubject,
  mergeGroups,
  parseCatalog,
} from '../lifestyle-catalog';

const SCHOOL = { name: 'School', color: '#C4B5FD', subjects: [{ name: 'Chem', color: '#F9A8D4' }] };
const HOME = { name: 'Home', color: '#5EEAD4', subjects: [] };

describe('parseCatalog', () => {
  it('decodes a valid catalog and drops malformed entries', () => {
    const parsed = parseCatalog([
      SCHOOL,
      { name: '', color: '#fff' },
      { color: '#fff' },
      { name: 'Ok', color: '#fff', subjects: [{ name: 'S', color: '#000' }, { nope: 1 }] },
      'junk',
    ]);
    expect(parsed.map((c) => c.name)).toEqual(['School', 'Ok']);
    expect(parsed[1].subjects).toEqual([{ name: 'S', color: '#000' }]);
  });

  it('returns empty for non-arrays', () => {
    expect(parseCatalog(undefined)).toEqual([]);
    expect(parseCatalog({})).toEqual([]);
  });
});

describe('mergeGroups', () => {
  it('keeps catalog entries that no task carries (the whole point)', () => {
    const merged = mergeGroups([SCHOOL, HOME], []);
    expect(merged.map((g) => g.name)).toEqual(['Home', 'School']);
    expect(merged[1].subjects).toEqual([{ name: 'Chem', color: '#F9A8D4' }]);
  });

  it('unions derived entries and subjects the catalog lacks, catalog color wins', () => {
    const merged = mergeGroups(
      [{ name: 'School', color: '#EDITED', subjects: [] }],
      [
        { name: 'School', color: '#C4B5FD', subjects: [{ name: 'Chem', color: '#F9A8D4' }] },
        { name: 'Work', color: '#FDBA74', subjects: [] },
      ]
    );
    expect(merged.map((g) => g.name)).toEqual(['School', 'Work']);
    expect(merged[0].color).toBe('#EDITED');
    expect(merged[0].subjects.map((s) => s.name)).toEqual(['Chem']);
  });
});

describe('catalogIsMissing', () => {
  it('flags unknown lifestyles and unknown subjects, and only those', () => {
    expect(catalogIsMissing([SCHOOL], [{ name: 'Work', color: '#fff', subjects: [] }])).toBe(true);
    expect(
      catalogIsMissing([SCHOOL], [
        { name: 'School', color: '#fff', subjects: [{ name: 'Math', color: '#000' }] },
      ])
    ).toBe(true);
    expect(
      catalogIsMissing([SCHOOL], [
        { name: 'School', color: '#other', subjects: [{ name: 'Chem', color: '#other' }] },
      ])
    ).toBe(false);
    expect(catalogIsMissing([], [])).toBe(false);
  });
});

describe('catalog mutations', () => {
  it('upserts lifestyles and subjects', () => {
    let cat = catalogUpsertLifestyle([], { name: 'Work', color: '#FDBA74' });
    cat = catalogUpsertSubject(cat, { name: 'Work', color: '#FDBA74' }, { name: 'Meetings', color: '#93C5FD' });
    expect(cat).toEqual([
      { name: 'Work', color: '#FDBA74', subjects: [{ name: 'Meetings', color: '#93C5FD' }] },
    ]);
    // Upserting a subject under an unknown lifestyle creates the lifestyle.
    const cat2 = catalogUpsertSubject([], { name: 'Gym', color: '#f00' }, { name: 'Legs', color: '#0f0' });
    expect(cat2[0].name).toBe('Gym');
    expect(cat2[0].subjects[0].name).toBe('Legs');
  });

  it('removes by name (subjects across every lifestyle)', () => {
    const cat = [
      { ...SCHOOL },
      { name: 'Work', color: '#FDBA74', subjects: [{ name: 'Chem', color: '#93C5FD' }] },
    ];
    expect(catalogRemoveLifestyle(cat, 'School').map((c) => c.name)).toEqual(['Work']);
    const noChem = catalogRemoveSubject(cat, 'Chem');
    expect(noChem.every((c) => c.subjects.length === 0)).toBe(true);
  });

  it('renames a lifestyle keeping its subjects, and upserts when the source is unknown', () => {
    const renamed = catalogRenameLifestyle([SCHOOL], 'School', { name: 'Uni', color: '#111' });
    expect(renamed).toEqual([{ name: 'Uni', color: '#111', subjects: SCHOOL.subjects }]);
    const upserted = catalogRenameLifestyle([], 'Ghost', { name: 'Real', color: '#222' });
    expect(upserted).toEqual([{ name: 'Real', color: '#222', subjects: [] }]);
  });
});
