# Post-release backlog

Developer feedback from TestFlight and desktop review, triaged 2026-08-17/18.
Rule of thumb: nothing here blocks the v1 submission. Web items ship whenever
(Render deploys from main); phone items batch into v1.1; the two big
redesigns get their own design passes.

## Ship with v1.1 (phone, small to medium)

- **Empty space below the task list should scroll/pull** — dragging the blank
  area under a short list does nothing today; make the list fill the screen
  (contentContainer flexGrow) so pull-to-reveal search works from anywhere.
- **Animated tab underline** — the active-tab underline exists; animate it
  sliding/expanding to the newly selected tab.
- **Completed/Deleted banner wobble → basically none** — tone the section
  banner bounce way down (developer: "too disturbing").
- **Light-mode task cards need a bit more colour** — status tints read too
  faint in light mode; nudge the status background saturation up one step.
  Developer approves the exact value by eye.
- **Calendar page lag** — going in/out of the calendar tab stutters; profile
  the month grid (memoize cells, avoid re-render on tab focus).
- **Week ↔ year switching lag + week-view entrance animation** — feels
  heavy; add an appear-from-center transition once the lag is profiled.
- **Manual event creation** — events are CSV-import-only by design today;
  add an "add event" path from the calendar (title, date, start/end,
  location, color). Contained feature, respects the existing event model.
- **Full-surface swipe between tabs** — edge-swipe already exists; extend to
  full-surface on Daily/Calendar/Settings and blank regions of Tasks (cards
  own horizontal swipes — gesture arbitration needed).
- **Tour: ring overlap + wrong-task tracking (phone halves)** — the ring
  gutter fix shipped 2026-08-18 (6c494ef); verify on-phone. The daily-task
  tracking bug (locks on the FIRST row, not the created one) still needs the
  anchor to target the created task id on both platforms.
- **Urgent glow blob (phone half)** — consecutive urgent days' glows merge
  into one blob; shrink radius (web half ships from main).

## Web / desktop (ship any time, no store involvement)

- **Tour bubble repositioning on wide screens** — move the card left of the
  form sheet during quick-add steps (space exists; the ring already guides).
- **Updates page** — a new page listing recent changes with screenshots and
  guides; linked from the nav on web. Phone: same content reachable from
  Settings (keeps tab bar at four).
- **Urgent glow shrink (web half).**
- **Tour daily-task tracking fix (web half).**

## Week view redesign (own design pass — developer spec 2026-08-18)

Reference: Google Calendar's week view.

- **Week joins the zoom hierarchy**: day → week → month → year (replaces the
  week-as-button). Zoom gestures/chevrons move between levels.
- **Grid layout**: 7 day columns, hour rows; tasks AND events render as
  time-positioned blocks in their day column (like Google Calendar class
  blocks). Likely built by generalizing lib/tasks/day-timeline.ts to lay one
  timeline per column.
- **Two formats, user-switchable**: the current scroll/list week AND the new
  grid. The format toggle button appears ONLY while week view is active.
- **Navigation**: swipe left/right = previous/next week (page-slide motion,
  shared with day view); the existing top-bar week switcher stays.
- **Desktop/tablet first** (easier, more space), phone same format
  compressed. Status colours drive block tinting; events keep the dashed
  event-blue identity.

## Hover tooltips everywhere (desktop) — developer spec 2026-08-18

- Every button/icon control gets a hover tag on web/desktop explaining what
  it does (new users don't know the tray icon, sync dot, etc.). Build as a
  small Tooltip wrapper fed by the SAME strings as accessibilityLabel so the
  two can't drift.
- Phone/tablet have no hover; the same strings already serve VoiceOver.
  Explore long-press hints later only if confusion shows up in feedback.

## Lifestyle revamp (v1.2 — own design pass, biggest item)

Categories/subjects become a hierarchy: "lifestyles" contain subjects.
- Only lifestyles show at first in the task form; tapping one expands it
  (subjects alphabetical under it, "+ new" always last, auto-drops open);
  lifestyles below the active one collapse away; tapping the lifestyle again
  clears the selection; on selection the box collapses into a stacked
  overlap (lifestyle bar peeking under the chosen subject).
- Colour indicator becomes a solid bar at the TOP of the lifestyle box (not
  a leading dot).
- Task badge becomes ONE combined pill: `( lifestyle ( subject )` — the
  subject pill overlaps/continues the lifestyle pill, both keeping their
  colours.
- Migration: existing categories auto-become lifestyles; existing tasks keep
  what they have.
- Open questions for the design pass: subject-less tasks' badge; how
  filtering works across the hierarchy; web form parity.
