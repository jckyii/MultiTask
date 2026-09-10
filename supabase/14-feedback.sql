-- 14: The in-app feedback form (developer request 2026-09-09). Signed-in
-- users can SUBMIT feedback; nobody can read it back through the API —
-- the developer reads it in the dashboard (Table Editor → feedback).
-- Re-runnable.

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  -- Nullable + set null so feedback survives account deletion (the
  -- delete-account RPC removes the auth user; the words stay, anonymous).
  user_uuid uuid default auth.uid() references auth.users (id) on delete set null,
  message varchar(2000) not null check (char_length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Insert-only for signed-in users, and only as themselves. No select /
-- update / delete policies exist on purpose: submitted feedback is
-- write-only from the app's side.
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
  on public.feedback for insert
  to authenticated
  with check (user_uuid = auth.uid());

grant insert on public.feedback to authenticated;
