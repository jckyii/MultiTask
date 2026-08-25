// The changelog the Updates page renders (newest first). Add an entry per
// released batch of changes - plain language, user-visible changes only,
// house style (no semicolons, no em dashes). An entry can carry an optional
// image (require() a bundled asset) once update posts start shipping
// screenshots.
import type { ImageSourcePropType } from 'react-native';

export type UpdateEntry = {
  /** Shown in the mono dateline, e.g. 'August 18, 2026'. */
  date: string;
  title: string;
  points: string[];
  image?: ImageSourcePropType;
};

export const UPDATE_ENTRIES: UpdateEntry[] = [
  {
    date: 'August 18, 2026',
    title: 'Version 1.0 goes to the App Store',
    points: [
      'Submitted for App Store review. The web app you are reading this on is the same product with the same account.',
      'Deleting your account now confirms with a banner, and the tour starts by itself for brand new accounts.',
      'Sign up emails match the app design, and the confirmation link hands you straight back into the app on your phone.',
      'The interactive tour rings fit the add task form properly and the tour card takes less of the screen on phones.',
      'Days with overdue tasks on the calendar are tinted individually, so a rough week no longer reads as one red blob.',
    ],
  },
  {
    date: 'August 15, 2026',
    title: 'Store readiness',
    points: [
      'Terms of service, a rewritten privacy policy, and a support page, all readable without an account.',
      'Delete account in Settings removes everything permanently, with no waiting period.',
      'A 22 step interactive tour teaches the whole app by doing, from your first task to the calendar views.',
      'Siri can add tasks by voice, and the day page shows a full day timeline with quiet hours compressed.',
    ],
  },
  {
    date: 'July 2026',
    title: 'The app takes shape',
    points: [
      'Offline first sync. Create, complete, and edit with no connection, and it all lands on your other devices when you are back online.',
      'Tasks, Daily, and Calendar views with year, month, week, and day levels.',
      'Home and lock screen widgets with check off from the widget, notifications when tasks turn urgent, and your tasks in the iPhone Calendar app.',
      'CSV import for schedules, as read only events or as real tasks.',
      'Swipe right to complete, left to delete, undo on everything, dark mode everywhere.',
    ],
  },
];
