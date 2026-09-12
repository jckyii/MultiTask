// The persistent lifestyle catalog (developer 2026-09-12: "lifestyles and
// subjects should not be deleted when all of its tasks no longer exist").
// The hierarchy used to be purely DERIVED from tasks, so a lifestyle died
// with its last task. The catalog fixes that: it lives in Supabase Auth
// user metadata (`lifestyle_catalog`, the display-name/urgency pattern —
// per-user, synced across devices, no new table and no sync-rule work).
// Tasks stay a SOURCE of entries — anything found on tasks is adopted into
// the catalog — but the catalog is the memory that outlives them.
import type { LifestyleGroup, NamedColor } from '@/lib/tasks/lifestyles';

export type CatalogLifestyle = {
  name: string;
  color: string;
  subjects: NamedColor[];
};

function isNamedColor(x: unknown): x is NamedColor {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as NamedColor).name === 'string' &&
    (x as NamedColor).name.length > 0 &&
    typeof (x as NamedColor).color === 'string'
  );
}

/** Tolerant decode of the metadata value — malformed entries are dropped,
 *  never thrown on (metadata can be edited from anywhere). */
export function parseCatalog(raw: unknown): CatalogLifestyle[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogLifestyle[] = [];
  for (const entry of raw) {
    if (!isNamedColor(entry)) continue;
    const subjects = Array.isArray((entry as CatalogLifestyle).subjects)
      ? (entry as CatalogLifestyle).subjects.filter(isNamedColor).map((s) => ({ name: s.name, color: s.color }))
      : [];
    out.push({ name: entry.name, color: entry.color, subjects });
  }
  return out;
}

/** Catalog ∪ task-derived groups, alphabetical like lifestyleGroups. The
 *  catalog's colors win (it carries the user's edits); derived entries and
 *  subjects the catalog doesn't know yet are included so nothing on a real
 *  task can ever be invisible. */
export function mergeGroups(catalog: CatalogLifestyle[], derived: LifestyleGroup[]): LifestyleGroup[] {
  const byName = new Map<string, LifestyleGroup>(
    catalog.map((c) => [c.name, { name: c.name, color: c.color, subjects: [...c.subjects] }])
  );
  for (const g of derived) {
    const existing = byName.get(g.name);
    if (!existing) {
      byName.set(g.name, { name: g.name, color: g.color, subjects: [...g.subjects] });
      continue;
    }
    for (const s of g.subjects) {
      if (!existing.subjects.some((x) => x.name === s.name)) existing.subjects.push(s);
    }
  }
  return [...byName.values()]
    .map((g) => ({ ...g, subjects: [...g.subjects].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True when tasks carry a lifestyle or subject the catalog doesn't know —
 *  the signal to adopt them so they survive their tasks. */
export function catalogIsMissing(catalog: CatalogLifestyle[], derived: LifestyleGroup[]): boolean {
  for (const g of derived) {
    const entry = catalog.find((c) => c.name === g.name);
    if (!entry) return true;
    for (const s of g.subjects) {
      if (!entry.subjects.some((x) => x.name === s.name)) return true;
    }
  }
  return false;
}

export function catalogUpsertLifestyle(catalog: CatalogLifestyle[], option: NamedColor): CatalogLifestyle[] {
  const existing = catalog.find((c) => c.name === option.name);
  if (!existing) return [...catalog, { name: option.name, color: option.color, subjects: [] }];
  return catalog.map((c) => (c.name === option.name ? { ...c, color: option.color } : c));
}

export function catalogUpsertSubject(
  catalog: CatalogLifestyle[],
  lifestyle: NamedColor,
  subject: NamedColor
): CatalogLifestyle[] {
  const withLifestyle = catalogUpsertLifestyle(catalog, lifestyle);
  return withLifestyle.map((c) => {
    if (c.name !== lifestyle.name) return c;
    const subjects = c.subjects.some((s) => s.name === subject.name)
      ? c.subjects.map((s) => (s.name === subject.name ? { ...s, color: subject.color } : s))
      : [...c.subjects, subject];
    return { ...c, subjects };
  });
}

export function catalogRemoveLifestyle(catalog: CatalogLifestyle[], name: string): CatalogLifestyle[] {
  return catalog.filter((c) => c.name !== name);
}

/** Subjects delete by NAME across every lifestyle — matching the form's
 *  removeOption/useDeleteSubject semantics. */
export function catalogRemoveSubject(catalog: CatalogLifestyle[], name: string): CatalogLifestyle[] {
  return catalog.map((c) => ({ ...c, subjects: c.subjects.filter((s) => s.name !== name) }));
}

export function catalogRenameLifestyle(
  catalog: CatalogLifestyle[],
  from: string,
  option: NamedColor
): CatalogLifestyle[] {
  if (!catalog.some((c) => c.name === from)) return catalogUpsertLifestyle(catalog, option);
  return catalog.map((c) => (c.name === from ? { ...c, name: option.name, color: option.color } : c));
}
