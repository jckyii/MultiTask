# App Store submission pack — Multitask Manager v1.0

Everything App Store Connect asks for, written out so it can be pasted in.
Written 2026-08-15. **iPhone only for v1** (iPad decision below).

---

## 0. Decisions locked for this release

| Thing | Decision |
|---|---|
| Platforms | **iPhone only.** iPad code is written and merged but `ios.supportsTablet` is `false`, because App Store Connect requires 13-inch iPad screenshots and no iPad was available to verify on or shoot with. Flipping the flag back to `true` is the whole v1.1 iPad release. |
| iOS version reach | **iOS 15.1 and up** — the floor of Expo SDK 54 / React Native 0.81, pinned explicitly in `app.json` via `expo-build-properties`. Nothing in the native stack requires more. |
| Widgets / Siri on old iOS | Widgets need iOS 17, Siri intents need iOS 16. Both are availability-guarded, so on iOS 15 and 16 they are simply absent and the app is otherwise complete. |
| Google Play | Deferred to v2 (CLAUDE.md decision 2026-07-26). |

---

## 1. App information

- **Name:** `Multitask Manager` (17 of 30 characters)
- **Subtitle:** `Tasks that work offline` (23 of 30)
- **Primary category:** Productivity
- **Secondary category:** Utilities
- **Bundle ID:** `com.abuljean.multitask`
- **SKU:** `multitask-ios-1`
- **Age rating:** 4+ — no objectionable content, no user-generated content shared between users, no unrestricted web access, no gambling, no ads.
- **Content rights:** contains no third-party content.

### URLs

| Field | Value |
|---|---|
| Support URL (required) | `https://multitask-web.onrender.com/support` |
| Privacy Policy URL (required) | `https://multitask-web.onrender.com/privacy` |
| Marketing URL (optional) | `https://multitask-web.onrender.com` |
| Terms (EULA) | Standard Apple EULA. `https://multitask-web.onrender.com/terms` also applies and is linked in-app. |

All three pages render without an account — verified signed out.

---

## 2. Listing copy

### Promotional text (170 max, editable without a new build)

```
Add a task in seconds, on a plane or on the subway. Everything syncs to your other devices the moment you are back online.
```

### Description

```
Multitask Manager is a task manager you'll actually keep using.

Adding a task takes about five seconds. Type the title, pick a time, done. Category, subject, priority and notes are all there if you want them, but they stay out of your way until you go looking.

WORKS OFFLINE

Everything saves to your device first, so you can add tasks on a plane and check them off on the subway. When you get a signal back it syncs to your other devices. It's the same app either way.

SEE WHAT'S URGENT

Every task has a status: ongoing, urgent, or overdue. As a deadline gets closer the card changes colour, weight and icon, so you can tell where things stand at a glance. You decide how many hours ahead counts as urgent.

FOUR VIEWS

Tasks groups everything by due date. Daily covers your repeating tasks plus whatever's due today. Calendar zooms from a year to a month to a single day on a real timeline. And there's search and filtering for when you just need to find one thing.

SMALLER STUFF

Swipe right to complete, left to delete. Undo works on both.
Notifications when a task turns urgent, and another shortly before it's due.
Home screen and lock screen widgets, and you can check a task off without opening the app.
Ask Siri to add a task.
Your tasks can show up in the iPhone Calendar app.
Import a schedule from CSV as either events or tasks.
Dark mode, with a light/dark toggle on every screen.
Full VoiceOver labels, Dynamic Type and reduced motion support.

YOUR DATA

No ads, no tracking, nothing sold. Ever. You can delete your account and everything in it from inside the app whenever you want.

Multitask Manager is free. I'm one developer, working on it on my own.
```

### Keywords (100 character limit, no spaces after commas)

```
todo,to-do,task list,planner,reminders,offline,due date,checklist,daily,productivity,deadline
```

(93 characters. Do not repeat words already in the app name or subtitle — Apple indexes those separately.)

### What's New (first release)

```
First release.
```

---

## 3. App Privacy answers (the nutrition label)

Answer **Yes** to "Do you or your third-party partners collect data from this app?", then declare exactly these. Everything below is **linked to the user's identity** except the diagnostics, and **nothing** is used for tracking.

| Data type | Collected | Linked to user | Purpose | Why |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App Functionality | The account identifier. |
| Contact Info → Name | Yes | Yes | App Functionality | The optional display name set in Settings, stored in auth metadata. Optional still counts as collected. |
| User Content → Photos or Videos | Yes | Yes | App Functionality | Optional profile picture only. |
| User Content → Other User Content | Yes | Yes | App Functionality | Task and event titles, notes, categories. |
| Identifiers → User ID | Yes | Yes | App Functionality | The Supabase auth user id that owns every row. |
| Diagnostics → Crash Data | Yes | **No** | App Functionality | Sentry. `delete event.user`, `sendDefaultPii: false`, console breadcrumbs stripped, so crashes arrive with no identity and no task text attached. |

**Not collected** — say No to all of these: phone number, physical address, location, contacts, health, financial info, browsing history, search history, purchases, usage data, advertising data, sensitive info, device ID, and any other diagnostics beyond crash data. Do **not** tick Performance Data next to Crash Data either — `tracesSampleRate` is 0, so no traces are ever sent.

**Tracking:** No. The app has no advertising identifier, no ad networks, no analytics SDK, and shares nothing with data brokers. Answer "No" to the tracking question, which produces the "Data Not Used to Track You" section.

Two disclosures the privacy policy already makes honestly, in case a reviewer cross-checks: profile photos live in a **public** storage bucket (anyone with the exact URL can view one, which is why the app says so before you upload), and deleted data can persist in encrypted database backups until those backups expire.

---

## 4. App Review information

### Demo account (required — the app is behind sign-in)

```
Email:    multitask.uitest.claude@gmail.com
Password: uitest-2026-multitask
```

Verified working 2026-08-15. It is email-confirmed and carries sample tasks.
**Do not delete this account until the app is approved.**

### Notes for the reviewer

```
Sign-in is required because the app's core purpose is keeping one person's
tasks in sync across their iPhone, other devices and the web app. There is
no per-device local-only mode; the account IS the sync.

The demo account above is ready to use and already contains sample tasks.

Account deletion: Settings tab, at the bottom, "Delete account". It asks for
confirmation twice and then permanently removes the account and all of its
data, with no waiting period and no need to contact us.

Optional permissions, all requested in context and all declinable without
losing core functionality:
- Notifications: reminders when a task becomes urgent and shortly before it
  is due.
- Calendar: OFF by default. Settings has a toggle that writes your tasks into
  a separate "Multitask" calendar and removes them when tasks are completed.
- Photos: only when choosing a profile picture.

There are no in-app purchases, no subscriptions, no ads, and no third-party
login providers, so Sign in with Apple does not apply.
```

### Export compliance

`ITSAppUsesNonExemptEncryption` is already `false` in `app.json`, so App Store Connect will not ask again. The app uses only standard HTTPS.

---

## 5. Screenshots

**iPhone 6.9-inch is the only required size** now that iPad is off. Apple scales these down for smaller iPhones automatically.

Six are ready in `store-assets/screenshots/` at exactly 1320x2868:

1. `01-tasks` — the task list with live statuses
2. `02-quick-add` — quick add open
3. `03-daily` — the Daily view
4. `04-calendar` — month calendar
5. `05-day-timeline` — a single day on the timeline
6. `06-week-list` — the week view

Upload in that order; the first two are what most people ever see.

---

## 6. The actual submission, in order

1. **Create the app record.** `eas submit` can do it, but doing it by hand at appstoreconnect.apple.com is clearer the first time: My Apps → + → New App → iOS → name, primary language, bundle ID `com.abuljean.multitask`, SKU `multitask-ios-1`.
2. **Fill in everything from sections 1 to 5 above.**
3. **Build for production:**
   ```bash
   npx eas build --platform ios --profile production
   ```
   `autoIncrement` is on and `appVersionSource` is `remote`, so the build number takes care of itself.
4. **Upload it:**
   ```bash
   npx eas submit --platform ios --latest
   ```
   It will ask for the Apple ID and, the first time, create the App Store Connect API key.
5. **TestFlight first.** Install on the developer's own iPhone from TestFlight and use it for a few real days. Everything in this repo has been verified on a dev build, never on a release build, and release builds differ (minified JS, no dev client, real notification entitlements).
6. **Submit for review** once TestFlight looks right.

### Before pressing submit — sanity checks

- [ ] `supabase/11-delete-account.sql` has been run (done 2026-08-15) and Delete account has been tried once on a throwaway account
- [ ] "Confirm email" is still ON in Supabase Auth — it is a security invariant, see REVIEW-REPORT.md
- [ ] PowerSync instance is running (it silently stopped once, on 2026-07-28)
- [ ] The Render site is live, since the store links to /support and /privacy
- [ ] Sign up as a brand-new user on a clean install and confirm the first-run tour works

---

## 7. Known review risks, and the honest answer to each

| Risk | Likelihood | Answer if it comes up |
|---|---|---|
| **5.1.1(v)** account deletion missing | Low — it is built | Point to Settings → Delete account. It is in the review notes. |
| **5.1.1** requiring sign-up for a task app | Low to medium | Cross-device sync is the product. The review note above says this up front. |
| **2.1** reviewer cannot get in | Low | The demo account is verified. Keep it alive. |
| **4.2** minimum functionality | Very low | It is a complete app with widgets, Siri, offline sync and import. |
| **2.3.10** screenshots showing non-app content | Very low | Every screenshot is the real app on real data. |

---

## 8. Guideline 2.1 "Information Needed" — the reply (rejection of 2026-08-26)

Apple's extra-scrutiny pass for first submissions from new accounts. Nothing
in the app was found wrong; they want a demo video and written answers.
Decision: fold the v1.1 batch into the resubmission (marketing version stays
1.0.0, build number auto-increments) and answer everything at once.

Paste items 2–7 below into the reply in App Store Connect (Resolution
Center) AND into App Review Information > Notes for future submissions.

### Item 1 — the screen recording (developer records this, on the iPhone)

Control Center > Screen Recording, latest iOS, one continuous take, no
editing needed. Apple watches for the exact flows they listed. Shot list:

1. Launch the app cold (show the app icon being tapped).
2. Sign OUT if signed in, then SIGN UP with a throwaway email (e.g.
   yijack56+asc.demo@gmail.com) — show the confirmation email arriving in
   Mail, tap the link, land on the confirmed page, return to the app,
   sign in. The first-run tour will start — do 3 or 4 steps, then End tour
   (shows onboarding exists without a 5-minute video).
3. When the notification permission prompt appears, tap Allow (that is a
   "sensitive capability prompt" — they want to see it in the flow).
4. Create a task with quick-add (title + time), swipe right to complete,
   swipe left to delete another, tap Undo once.
5. Daily tab: check off a daily task.
6. Calendar: month view, tap a day, show the day timeline, back out.
7. Settings: show the urgency threshold chips, toggle dark mode.
8. Settings > Delete account: delete the THROWAWAY account made in step 2
   (both confirms, the banner, landing back on sign-in). Never the demo
   account.

Upload the video in the Resolution Center reply (attachments allowed) or a
link. Keep it under ~4 minutes.

### Item 2 — devices and OS tested (fill in the exact model/OS)

```
iPhone [MODEL], iOS [VERSION] — physical device, via TestFlight and ad hoc
development builds throughout development.
Web companion (same account system) tested on desktop Chrome, macOS/Windows.
```

### Item 3 — function, audience, problem, value

```
Multitask Manager is a personal task manager for people who use one every
day: students and working professionals tracking deadlines. The problem it
solves is fragmentation: tasks, repeating daily routines, and imported
schedule events live in one place, are visible at a glance by urgency
(each task's card changes color and icon as its deadline approaches), and
follow the user across their iPhone and the web app through one account.
It works fully offline; changes sync when a connection returns. It is
free, with no ads, no purchases, and no tracking.
```

### Item 4 — setup instructions and credentials

```
The app requires sign-in because cross-device sync is its core purpose.

Demo account (also in the App Review Information credentials fields):
  Email:    multitask.uitest.claude@gmail.com
  Password: uitest-2026-multitask

Steps: launch the app, sign in with the demo account, and the task list
is immediately populated with sample tasks. Quick-add is the + button
(title and time only). Swipe a task right to complete, left to delete.
The Daily tab holds repeating daily tasks. The Calendar tab zooms from
year to month to a single day. CSV import lives in the Calendar tab's
tray icon; a sample CSV can be generated from the in-app "How do I make
a CSV" helper. Account deletion is at the bottom of Settings.

No sample files are required; all features work with the demo account as
provided.
```

### Item 5 — external services

```
- Supabase (supabase.com): authentication (email/password) and the
  Postgres database that stores each user's tasks, events, and settings,
  protected by row-level security.
- PowerSync (powersync.com): offline-first synchronization between the
  on-device SQLite database and Postgres.
- Sentry (sentry.io): crash reporting only. Reports are anonymized (no
  user identity, no user content) and are declared as Crash Data not
  linked to identity in App Privacy.
- Render (render.com): hosts the companion web app and the public
  support/privacy/terms pages.
No payment processors, no ad networks, no analytics SDKs, no AI services.
```

### Item 6 — regional differences

```
None. The app's features and content are identical in all regions. All
dates and times use the device's locale and time zone.
```

### Item 7 — regulated industry / protected material

```
Not applicable. The app is a general-purpose personal task manager. It
operates in no regulated industry and contains no third-party protected
material; all content is created by the user or the developer.
```

### Resubmission checklist

- [ ] v1.1 batch merged and verified on the preview build
- [ ] Production build (`npx eas build --platform ios --profile production`)
- [ ] `npx eas submit --platform ios --latest`
- [ ] On the version page: select the NEW build
- [ ] Paste items 2–7 into App Review Information > Notes (keep the
      existing why-sign-in-is-required note too)
- [ ] Record the video per item 1, attach it in the Resolution Center
      reply, paste items 2–7 there as well
- [ ] Submit for review
