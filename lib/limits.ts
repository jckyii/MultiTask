// Server column limits (varchar caps in Postgres), enforced client-side.
//
// Why this matters beyond UX: in sync mode a too-long value inserts fine
// into local SQLite (no varchar there), then the upload fails 22001 —
// the row can never reach the server. Capping at the input/parser keeps
// local and server data in the same domain.
export const TASK_TITLE_MAX = 100; // task.title varchar(100) (Task.java)
export const TASK_DESCRIPTION_MAX = 300; // task.description varchar(300)
export const RECURRING_TITLE_MAX = 100; // recurring_task.title varchar(100)
export const EVENT_TITLE_MAX = 200; // event.title varchar(200)
export const EVENT_LOCATION_MAX = 200; // event.location varchar(200)
export const EVENT_NOTES_MAX = 500; // event.notes varchar(500)
export const FEEDBACK_MAX = 2000; // feedback.message varchar(2000) (supabase/14)
