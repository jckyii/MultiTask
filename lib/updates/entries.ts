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
    date: 'September 9, 2026',
    title: 'Picking a lifestyle feels right now',
    points: [
      'Choosing a lifestyle is a preview first. Tap one and it opens to show its subjects without committing you to anything. Tap a subject to lock in both, or tap the lifestyle again to take it on its own. On the computer just moving the mouse over a lifestyle opens it, and moving away closes it.',
      'Tapping the subject you already picked unselects just the subject, and tapping your chosen lifestyle again clears the whole pick.',
      'Every lifestyle now has a pencil for editing its name and color right in place, and the color palette only offers colors no other lifestyle is using, for new ones and edits alike.',
      'A task with only a lifestyle now wears the full solid color on its badge, so lifestyles always read solid and subjects always read soft.',
      'Notes on a task now show quietly on the right side of the card, so you can read them without opening the task.',
      'Pressing enter in the notes field or a name field now just puts the keyboard away instead of doing anything surprising.',
      'Daily tasks are called recurring tasks now, which is what they always were.',
      'Removing a recurring task is deliberate now. On the phone hold the row and confirm, on the computer right click it. The left swipe no longer deletes, so a nudge can never throw one away.',
      'The day view shows all 24 hours at true scale now, with every hour line drawn even where nothing sits. It opens at your first item of the day, and dragging down only closes the page when you started the drag from the very top.',
      'The week button now opens the block view first, showing all seven days on the phone just like the computer. Tap it again for the list view, and use the calendar icon beside it to return to the month. The phone icon matches the web one now.',
      'The Daily page reads top to bottom now: recurring tasks, then today’s tasks as slim one line bars with the title, time and badges, then your schedule. Tap a bar to open the full task. On the computer the schedule sits on the left and your tasks on the right, so cards swipe cleanly off the screen.',
      'There is a feedback form in Settings under Help now. Concerns, improvements and ideas all welcome, they shape what gets built next.',
      'The tour got a full rewrite, now 54 small steps. It explains each part before asking you to try it, walks the whole lifestyle flow including creating, unselecting and reconfirming, covers Clear all and Empty trash, the recurring task rhythm, the week views, and importing events with the AI prompt, and most pages now stay fully visible instead of being greyed out.',
    ],
  },
  {
    date: 'August 27, 2026',
    title: 'Lifestyles',
    points: [
      'Categories are now lifestyles, and every subject lives inside one. When you add a task you pick a lifestyle first, its subjects drop down underneath, and new subjects are created right there with the +new chip.',
      'Each lifestyle shows its color as a solid bar across the top of its box. Once you have picked, the choice collapses into one compact box with the lifestyle bar on top and the subject inside.',
      'Task cards now show one combined badge. The lifestyle sits in front in its solid color, and the subject pill runs behind it with its tail showing.',
      'Your existing tasks came along automatically. Categories became lifestyles, and each subject moved in under the lifestyle it was already on a task with.',
      'On the computer you can right click a lifestyle or subject to delete it. On the phone, long press works as before.',
    ],
  },
  {
    date: 'August 26, 2026',
    title: 'The week gets a real grid',
    points: [
      'Week view now has a Google Calendar style grid: seven day columns over a time axis, with your tasks and events as blocks placed at their actual times. Overlapping items share the column side by side. The toggle between the grid and the classic list lives in the top bar while you are in week view, and your pick is remembered.',
      'You can add events by hand now. The plus button on the Calendar tab takes a title, date, times or all day, location, notes, and a color. Imports still work exactly as before.',
      'Switching in and out of the Calendar tab is much faster.',
    ],
  },
  {
    date: 'August 26, 2026',
    title: 'Feel and polish, from your feedback',
    points: [
      'Swiping between tabs on the phone now follows your finger, like the day pages. Release past a third of the screen or flick to change pages, let go early and it springs back. Task cards always win on their own surface.',
      'Every action confirms with a banner now, undo included. Complete, un-complete, delete, restore, each one tells you what happened and can be reversed.',
      'The banner glides in slowly with no bounce, the tab underline grows gently, and the light mode status colors are richer, with the urgent tint moved from amber to peach.',
      'You can drag anywhere on the task list, even the empty space below a short list, and the pull down search works from there too.',
      'On the computer, hovering any button shows a small tag explaining what it does, and the tour bubble now sits beside the add task form instead of covering it.',
    ],
  },
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
