// Privacy policy — a PUBLIC route (no account needed): the App Store/Play
// listing links here, reviewers open it signed-out, and Settings links it
// for users. Factual and specific (doc 06 voice) — it describes what the
// app actually does, verified against the codebase, not boilerplate.
import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { pageContent } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

const UPDATED = 'August 15, 2026';
const CONTACT = 'yijack56@gmail.com';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What Multitask collects',
    body: 'Your account email and password, the things you create in the app such as tasks, events, lifestyles and recurring tasks, and a profile photo if you choose to add one. Passwords are handled by our sign in provider and we never see them. That is the whole list. There are no ads in the app, no tracking across other apps or websites, and your data is never sold.',
  },
  {
    title: 'Where your data lives',
    body: 'Your data is stored with Supabase, our database and sign in provider, on servers in the United States. Access rules on the server make sure each account can only read its own rows. A copy also lives on your own device so the app works offline. Signing out removes that local copy.',
  },
  {
    title: 'Services we rely on',
    body: 'A few companies process data on our behalf to make the app work. Supabase stores your account and your content. PowerSync moves your changes between your devices. Sentry receives crash reports. GitHub stores our encrypted nightly database backups. Render hosts the website. None of them are allowed to use your data for their own purposes.',
  },
  {
    title: 'Profile photos are public',
    body: 'One honest caveat. If you add a profile photo it is stored at a web address that is not password protected, so anyone who somehow has that exact link could view the image. Only your account normally sees it, but do not upload a photo you would not want visible outside the app. Everything else you create is private to your account.',
  },
  {
    title: 'Crash reports',
    body: 'If the app crashes, a technical report with the error, your device model and the system version is sent to Sentry so the problem can be found and fixed. These reports are set up to leave out your tasks, your events and your personal details. They describe the failure, not your data.',
  },
  {
    title: 'No AI processing',
    body: 'The app does not send your data to any artificial intelligence service. The optional helper text in the calendar import screen is something you copy and paste into a tool of your own choosing, entirely outside the app.',
  },
  {
    title: 'Device permissions',
    body: 'Notifications are optional and only remind you about your own tasks. Reminders are scheduled on your device. Calendar access is optional and off by default. If you turn on calendar sync the app writes your tasks into a calendar it creates and removes that calendar when you turn the setting off. It does not read your other calendars beyond what the sync needs. Photo access only opens when you pick a profile picture.',
  },
  {
    title: 'Backups',
    body: 'The database is backed up every night so your data can be restored after a failure. Backups are kept for 90 days and then deleted automatically. Because backups are snapshots, data you delete can remain inside old backups until those backups expire.',
  },
  {
    title: 'Deleting your data',
    body: `Deleting a task or event in the app deletes it from the server, and emptying the trash is permanent. You can delete your whole account yourself in Settings under Delete account. That removes your account, your content and your profile photo right away. You can also email ${CONTACT} from your account address and we will do it for you.`,
  },
  {
    title: 'Your rights',
    body: `Wherever you live, you can ask what data we hold about you, ask for a copy, ask for corrections, or ask for deletion. Email ${CONTACT} and we will respond within 30 days.`,
  },
  {
    title: 'Children',
    body: 'Multitask is not aimed at children under 13 and we do not knowingly keep accounts for them. If you believe a child has an account, contact us and we will remove it.',
  },
  {
    title: 'Changes and contact',
    body: `If this policy changes in a meaningful way, the date above changes and we will note it in the app. Questions and requests go to ${CONTACT}.`,
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space, radius, type, monoFont } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s8 }]}
        showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backButton, { paddingVertical: space.s3 }]}>
          <IconSymbol name="chevron.left" size={20} color={colors.accent} />
          <Text style={[type.body, { color: colors.accent, fontWeight: '600' }]}>Back</Text>
        </Pressable>

        <Text style={[type.display, { color: colors.textPrimary }]}>Privacy policy</Text>
        <Text style={[type.caption, { fontFamily: monoFont, color: colors.textTertiary, marginTop: space.s1, marginBottom: space.s5 }]}>
          Multitask Manager · updated {UPDATED}
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
              <Text style={[type.body, { color: colors.textSecondary }]}>{s.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
});
