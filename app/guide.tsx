// First-run guide — opens once per device after sign-in (new signups AND
// web users whose account just migrated), and lives in Settings forever
// after. Factual and dense per docs/design/06: no illustrations, no
// "You've got this!" — each section is what the feature does and the one
// gesture that drives it. Platform-aware copy (phone vs web).
import { Stack, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pageContent } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

const isWeb = Platform.OS === 'web';

const SECTIONS: { title: string; body: string; webBody?: string }[] = [
  {
    title: 'Add a task fast',
    body: 'Tap the + button. A task only needs a title and a time. Everything else, like lifestyle, subject, priority, and notes, lives under Details. Long-press a lifestyle or subject chip there to delete it.',
    webBody: 'Click the + button. A task only needs a title and a time — everything else (lifestyle, subject, priority, notes) lives under Details. Long-press a lifestyle or subject chip there to delete it.',
  },
  {
    title: 'Complete and delete by swiping',
    body: 'Swipe a task right to complete it, left to delete. Every action shows an undo for 5 seconds. Completed tasks collect at the top, and "Clear all" moves them to the trash in one go.',
    webBody: 'Hover a task and use the edge zones: right side completes, left side deletes. Every action shows an undo for 5 seconds. Completed tasks collect at the top; "Clear all" moves them to the trash in one go.',
  },
  {
    title: 'Colors mean status',
    body: 'Green means ongoing. Orange means urgent, which is anything inside your urgency window (set it in Settings). Red means overdue. The same colors run through the whole app: cards, calendar, widgets.',
  },
  {
    title: 'Daily',
    body: 'Recurring tasks that reset every day, like medication or practice. Check them off today and they come back tomorrow. They stay off the calendar on purpose.',
  },
  {
    title: 'Calendar',
    body: 'Month view with your tasks and events. Tap the year to zoom out. Tap any day for its timeline, where events are sized by length and tasks line up by time with one-tap complete.',
  },
  {
    title: 'Import your schedule',
    body: 'Calendar → the tray icon imports a CSV. The built-in AI prompt makes one from a pasted schedule and asks about anything missing. Each row can become a read-only event or a real task. Your pick, even per row.',
  },
  {
    title: 'Search and filter',
    body: 'Pull down a little on the task list to open search. Filter narrows by urgency, lifestyle, or subject.',
    webBody: 'The search bar is always at the top of Tasks. Filter narrows by urgency, lifestyle, or subject.',
  },
  {
    title: 'Works offline',
    body: 'Everything works with no connection and syncs when it returns. The small dot by the title: blue = live, accent = syncing, red ring = offline (nothing is lost).',
  },
  {
    title: 'On your phone (iOS)',
    body: 'Widgets for home and lock screen (check tasks off right on the widget), long-press the app icon for Quick add, a Complete button on reminders, and Settings can mirror tasks into your device calendar.',
    webBody: 'The iPhone/Android app adds home & lock-screen widgets, Quick add from the app icon, notification actions, and device-calendar sync. Same account, same data, everywhere.',
  },
  {
    title: 'Coming from the old website?',
    body: 'Sign up here with the SAME email you used on the old site and confirm it. Your existing tasks link to the new account automatically. The old site keeps working during the transition.',
  },
  {
    title: 'Make it yours',
    body: 'The sun/moon button flips light and dark anywhere. Notifications, urgency window, reminder lead time, and profile live in Settings. More looks arrive with Styles.',
  },
];

export default function GuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space, radius, type, monoFont } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s8 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={[type.display, { color: colors.textPrimary, marginTop: space.s6 }]}>
          How Multitask works
        </Text>
        <Text style={{ fontFamily: monoFont, fontSize: 12, color: colors.textTertiary, marginTop: space.s1, marginBottom: space.s5 }}>
          2 minutes, everything that matters
        </Text>

        <View style={{ gap: space.s3 }}>
          {SECTIONS.map((s) => (
            <View
              key={s.title}
              style={{
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                borderWidth: 1,
                borderRadius: radius.card,
                padding: space.s4,
                gap: space.s1,
              }}>
              <Text style={[type.h2, { color: colors.textPrimary }]}>{s.title}</Text>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                {isWeb && s.webBody ? s.webBody : s.body}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.doneButton,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.button,
              marginTop: space.s6,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>Got it</Text>
        </Pressable>
        <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400', marginTop: space.s3, textAlign: 'center' }]}>
          This guide stays in Settings whenever you need it.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  doneButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
