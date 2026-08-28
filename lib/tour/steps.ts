// The interactive tour script (v4, developer feedback 2026-08-11): guided
// and GATED — during an action step everything except the target is dimmed
// and blocked, so the user completes the instructed action (or presses
// "Skip step"). Deep coverage: build a task field by field inside the
// quick-add sheet, delete/undo/complete it, ADD and CHECK a real daily,
// open a real day timeline, then week list + CSV and Settings.
//
// `host` = which overlay instance shows the step: native modal screens
// (quick-add, day page) paint above the root overlay, so those routes
// render their own overlay instance.
// Copy rules: simple words, short sentences, no semicolons.
import type { TourEvent } from './events';

export type TourHost = 'tabs' | 'quick-add' | 'day';

export type TourStep = {
  id: string;
  kind: 'action' | 'spotlight';
  host: TourHost;
  anchor?: string;
  tab?: '/' | '/daily' | '/calendar' | '/settings';
  title: string;
  body: string;
  webBody?: string;
  placement: 'top' | 'bottom';
  /** Pin the card to one edge regardless of the ring (e.g. the date
   *  picker expands BELOW the chips — the card must stay out of its way). */
  cardPin?: 'top' | 'bottom';
  /** Action steps: dim + block everything except the anchor hole. */
  dim?: boolean;
  advanceOn?: TourEvent;
  /** Failsafe: any of these ALSO advances (wrong-but-close actions). */
  advanceOnAny?: TourEvent[];
  advanceOnPath?: string;
  advanceOnPathPrefix?: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'add',
    kind: 'action',
    host: 'tabs',
    anchor: 'fab',
    tab: '/',
    title: 'Make your first task',
    body: 'Tap the + button.',
    placement: 'top',
    dim: true,
    advanceOnPath: '/quick-add',
  },
  {
    id: 'when',
    kind: 'action',
    host: 'quick-add',
    anchor: 'form-when',
    title: 'Name it, time it',
    cardPin: 'top',
    body: 'Type a name for your task. The chips below set the day and the time. A task only needs those two things. Change the time now, or press Skip step.',
    placement: 'top',
    advanceOn: 'form-date-set',
  },
  {
    id: 'details',
    kind: 'action',
    host: 'quick-add',
    anchor: 'form-details',
    title: 'Open the extras',
    body: 'Tap Details. Everything optional lives in there.',
    placement: 'top',
    advanceOn: 'form-details-open',
  },
  {
    id: 'priority',
    kind: 'action',
    host: 'quick-add',
    anchor: 'form-priority',
    title: 'Priority',
    body: 'Priority ranks the task. 1st, 2nd, or 3rd shows a badge on the card so it stands out. Pick one.',
    placement: 'top',
    advanceOn: 'form-priority-set',
  },
  {
    id: 'lifestyle',
    kind: 'action',
    host: 'quick-add',
    anchor: 'form-lifestyle',
    title: 'Lifestyle',
    body: 'The part of your life this task belongs to, like School, Work, or Home. Tap one to open it and pick a subject inside, like Chemistry inside School, or add your own with +new. Pick a lifestyle to continue.',
    placement: 'top',
    // Either pick advances - a lifestyle alone is a complete choice.
    advanceOn: 'form-category-set',
    advanceOnAny: ['form-category-set', 'form-subject-set'],
  },
  {
    id: 'notes',
    kind: 'action',
    host: 'quick-add',
    anchor: 'form-notes',
    title: 'Notes',
    body: 'Anything extra you want to remember goes here. Totally optional.',
    placement: 'top',
  },
  {
    id: 'create',
    kind: 'action',
    host: 'quick-add',
    anchor: 'form-submit',
    title: 'Add it',
    body: 'Press Add task.',
    placement: 'top',
    dim: true,
    advanceOn: 'task-created',
  },
  {
    id: 'delete',
    kind: 'action',
    host: 'tabs',
    anchor: 'first-task',
    tab: '/',
    title: 'Delete it',
    body: 'There is your task. Swipe it LEFT to delete it. Nothing is ever lost right away.',
    webBody: 'There is your task. Move the mouse to its LEFT edge and click to delete it. Nothing is ever lost right away.',
    placement: 'bottom',
    dim: true,
    advanceOn: 'task-deleted',
    advanceOnAny: ['task-deleted', 'task-completed'],
  },
  {
    id: 'undo',
    kind: 'action',
    host: 'tabs',
    anchor: 'first-task',
    title: 'Bring it back',
    body: 'Tap Undo in the little toast at the bottom. Missed it? Open the Deleted group up top and swipe the task right.',
    webBody: 'Click Undo in the toast at the bottom. Missed it? Open the Deleted group and use the task’s right edge.',
    placement: 'top',
    advanceOn: 'task-restored',
    advanceOnAny: ['task-restored', 'task-uncompleted'],
  },
  {
    id: 'complete',
    kind: 'action',
    host: 'tabs',
    anchor: 'first-task',
    tab: '/',
    title: 'Complete it',
    body: 'Swipe the task RIGHT to complete it. The same swipe in the Completed group brings it back.',
    webBody: 'Click the task’s RIGHT edge to complete it. The same edge in the Completed group brings it back.',
    placement: 'bottom',
    dim: true,
    advanceOn: 'task-completed',
    advanceOnAny: ['task-completed', 'task-deleted'],
  },
  {
    id: 'daily-intro',
    kind: 'spotlight',
    host: 'tabs',
    anchor: 'daily-header',
    tab: '/daily',
    title: 'Daily',
    body: 'Things you do every day live here, like medication or practice. They reset every morning and stay off the calendar. Tasks due today show at the bottom too.',
    placement: 'bottom',
  },
  {
    id: 'daily-add',
    kind: 'action',
    host: 'tabs',
    anchor: 'daily-add',
    tab: '/daily',
    title: 'Add a daily',
    body: 'Tap the dashed row, give it a name, and add it.',
    placement: 'bottom',
    dim: true,
    advanceOn: 'recurring-added',
  },
  {
    id: 'daily-check',
    kind: 'action',
    host: 'tabs',
    anchor: 'first-daily',
    tab: '/daily',
    title: 'Check it off',
    body: 'Tap the task to mark it done for today. A swipe right does the same. Tomorrow morning it comes back on its own.',
    placement: 'bottom',
    dim: true,
    advanceOn: 'recurring-checked',
  },
  {
    id: 'calendar-intro',
    kind: 'spotlight',
    host: 'tabs',
    anchor: 'calendar-bar',
    tab: '/calendar',
    title: 'Calendar',
    body: 'Every task and event, by day. Dots are tasks, rings are events. Tap the year up top to zoom out to months and years.',
    placement: 'bottom',
  },
  {
    id: 'cal-years',
    kind: 'action',
    host: 'tabs',
    anchor: 'calendar-year-button',
    tab: '/calendar',
    title: 'Zoom out',
    body: 'Tap the year in the corner to see whole months and years at once.',
    placement: 'bottom',
    dim: true,
    advanceOn: 'calendar-year-open',
  },
  {
    id: 'cal-months',
    kind: 'action',
    host: 'tabs',
    tab: '/calendar',
    title: 'Zoom back in',
    body: 'Tap any month block to jump back into it.',
    placement: 'top',
    advanceOn: 'calendar-month-open',
  },
  {
    id: 'day-open',
    kind: 'action',
    host: 'tabs',
    tab: '/calendar',
    title: 'Open a day',
    body: 'Tap any day on the grid to see its timeline.',
    placement: 'top',
    advanceOnPathPrefix: '/day',
  },
  {
    id: 'day-tour',
    kind: 'spotlight',
    host: 'day',
    title: 'The day timeline',
    body: 'Events sit on the hour lines, sized by how long they run. Tasks line up by their due time with a one-tap complete circle. The arrows by the date change days, and you can swipe the page sideways too.',
    webBody: 'Events sit on the hour lines, sized by how long they run. Tasks line up by their due time. The arrows by the date change days.',
    placement: 'bottom',
  },
  {
    id: 'day-back',
    kind: 'action',
    host: 'day',
    title: 'Head back',
    body: 'Swipe down from the top of the page, or tap Calendar in the corner.',
    webBody: 'Click the empty space beside the page, or tap Calendar in the corner.',
    placement: 'bottom',
    advanceOnPath: '/calendar',
  },
  {
    id: 'calendar-tools',
    kind: 'spotlight',
    host: 'tabs',
    anchor: 'calendar-tools',
    tab: '/calendar',
    title: 'Week list and imports',
    body: 'The list button shows your whole week on one page. Swipe sideways to move a week at a time, or tap the dates in the middle to jump far. The tray button imports a schedule from a CSV file and can turn it into events or tasks. Nothing to do now — the sheet inside has an AI prompt that builds the file when you need it.',
    placement: 'bottom',
  },
  {
    id: 'theme',
    kind: 'spotlight',
    host: 'tabs',
    anchor: 'theme-toggle',
    tab: '/settings',
    title: 'Make it yours',
    body: 'The sun and moon button flips light and dark, from every tab. Down here you can change your name and photo, how early tasks turn urgent, reminder timing, and calendar sync. Replay this tour from here anytime.',
    placement: 'bottom',
  },
];
