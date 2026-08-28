-- 13: The lifestyle revamp's one-time data cleanup (developer spec
-- 2026-08-26). Categories BECOME lifestyles (a rename, no data change) and
-- subjects live UNDER a lifestyle, so a subject on a task with no category
-- has no home: "any other subjects that are left unspecified unfortunately
-- are deleted" (developer). Re-runnable; touches only rows that violate the
-- new rule.
--
-- The hierarchy itself is DERIVED from tasks (subject X belongs to
-- lifestyle Y when they co-occur on a task), so no new tables and the web
-- app keeps reading the same columns.

update public.task
   set subject = null,
       subject_color = null
 where subject is not null
   and (category is null or category = '' or category = 'Uncategorized');
