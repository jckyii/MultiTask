// Settings — the web app's settings carried over with developer adjustments
// (2026-07-10): password changes go through a reset EMAIL (no in-app form);
// display-name and email changes require re-entering the password; timezone
// is always the phone's own (shown, not editable — all date math already
// runs on device-local time); avatars are new. The style-packs picker will
// hide at the bottom of this screen in the far future.
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InputPromptDialog, type PromptRequest } from '@/components/input-prompt';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { TourAnchor, useTour } from '@/components/tour/tour-context';
import { useUndoToast } from '@/components/undo-toast';
import { useAuth } from '@/hooks/use-auth';
import { useCalendarSyncEnabled } from '@/hooks/use-calendar-sync-enabled';
import { useDroppedOpCount } from '@/hooks/use-dropped-ops';
import { useNotificationLead } from '@/hooks/use-notification-lead';
import { useUrgencyThreshold } from '@/hooks/use-urgency-threshold';
import { base64ToBytes } from '@/lib/base64';
import { confirmDialog } from '@/lib/confirm';
import { removeDeviceCalendar } from '@/lib/device-calendar/sync';
import {
  getCalendarPermissionState,
  requestCalendarAccess,
  type CalendarPermissionState,
} from '@/lib/device-calendar/system';
import {
  ensureNotificationPermission,
  getNotificationPermissionStatus,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/telemetry/system';
import { pageContent } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

const THRESHOLD_OPTIONS = [12, 24, 48, 72];
const LEAD_OPTIONS = [30, 60, 120]; // minutes before the deadline

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space, radius, type } = useTheme();
  const { session } = useAuth();
  const toast = useUndoToast();
  const tour = useTour();
  const threshold = useUrgencyThreshold();
  const leadMinutes = useNotificationLead();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const calendarSyncEnabled = useCalendarSyncEnabled();
  const droppedOps = useDroppedOpCount();
  const [calendarPermission, setCalendarPermission] = useState<CalendarPermissionState>('unavailable');
  // Metadata round-trips through Supabase before the switch value updates —
  // this bridges the gap so the toggle answers the finger immediately.
  const [calendarPending, setCalendarPending] = useState<boolean | null>(null);

  useEffect(() => {
    getNotificationPermissionStatus().then(setNotifStatus);
    getCalendarPermissionState().then(setCalendarPermission);
  }, []);

  useEffect(() => {
    setCalendarPending(null);
  }, [calendarSyncEnabled]);

  async function toggleCalendarSync(next: boolean) {
    setCalendarPending(next);
    if (next) {
      const granted = await requestCalendarAccess();
      const state = await getCalendarPermissionState();
      setCalendarPermission(state);
      if (!granted) {
        setCalendarPending(null);
        toast.show({
          message:
            state === 'unavailable'
              ? 'Calendar needs the latest app build.'
              : 'Allow calendar access for Multitask in your phone’s Settings.',
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({ data: { calendar_sync_enabled: true } });
      if (error) {
        setCalendarPending(null);
        toast.show({ message: 'Couldn’t save the setting.' });
        return;
      }
      // The calendar-sync hook reconciles as soon as the session updates.
      toast.show({ message: 'Tasks will appear in your calendar.' });
    } else {
      const { error } = await supabase.auth.updateUser({ data: { calendar_sync_enabled: false } });
      if (error) {
        setCalendarPending(null);
        toast.show({ message: 'Couldn’t save the setting.' });
        return;
      }
      await removeDeviceCalendar();
      toast.show({ message: 'Multitask events removed from your calendar.' });
    }
  }

  const user = session?.user;
  const email = user?.email ?? '';
  const displayName = (user?.user_metadata?.display_name as string | undefined) ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Text prompts: iOS gets the native Alert.prompt; Android gets our
  // cross-platform dialog (Alert.prompt doesn't exist there).
  const [promptRequest, setPromptRequest] = useState<{
    request: PromptRequest;
    resolve: (value: string | null) => void;
  } | null>(null);

  function prompt(title: string, message: string, secure = false): Promise<string | null> {
    if (Platform.OS === 'ios') {
      return new Promise((resolve) => {
        Alert.prompt(
          title,
          message,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
            { text: 'OK', onPress: (value?: string) => resolve(value?.trim() || null) },
          ],
          secure ? 'secure-text' : 'plain-text'
        );
      });
    }
    return new Promise((resolve) => {
      setPromptRequest({ request: { title, message, secure }, resolve });
    });
  }

  /** Sensitive changes require the password again (web-app parity). */
  async function reauthenticate(): Promise<boolean> {
    const password = await prompt('Confirm password', 'Enter your password to continue.', true);
    if (!password) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.show({ message: 'Incorrect password.' });
      return false;
    }
    return true;
  }

  async function changeDisplayName() {
    if (!(await reauthenticate())) return;
    const name = await prompt('Display name', 'Enter your new display name.');
    if (!name) return;
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    toast.show({ message: error ? 'Couldn’t update the name.' : 'Display name updated.' });
  }

  async function changeEmail() {
    if (!(await reauthenticate())) return;
    const newEmail = await prompt('Change email', 'Enter your new email address.');
    if (!newEmail) return;
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    toast.show({
      message: error
        ? 'Couldn’t start the email change.'
        : 'Check your new inbox to confirm the change.',
    });
  }

  // Apple guideline 5.1.1(v): account deletion must be available IN the
  // app, and it must actually delete. Two confirms, then the RPC removes
  // every owned row, the avatar files, and the auth user itself
  // (supabase/11-delete-account.sql).
  async function deleteAccount() {
    const first = await confirmDialog({
      title: 'Delete your account?',
      message: 'This permanently deletes your account, all tasks, events, and daily tasks on every device. There is no undo.',
      confirmLabel: 'Continue',
      destructive: true,
    });
    if (!first) return;
    const second = await confirmDialog({
      title: 'Are you sure?',
      message: 'Everything will be gone for good.',
      confirmLabel: 'Delete everything',
      destructive: true,
    });
    if (!second) return;
    // Remove the avatar files FIRST, as the signed-in user - the RPC can't
    // reliably touch storage (schema owned by supabase_storage_admin), and
    // Supabase refuses to delete an auth user who still owns storage
    // objects. Best-effort: an account with no avatar has nothing to do.
    try {
      const uid = user?.id;
      if (uid) {
        const { data: files } = await supabase.storage.from('avatars').list(uid);
        if (files && files.length > 0) {
          await supabase.storage.from('avatars').remove(files.map((f) => `${uid}/${f.name}`));
        }
      }
    } catch (e) {
      captureError(e, { where: 'deleteAccount.avatarCleanup' });
    }
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      // Show the REAL reason - the generic connection copy hid a server-side
      // permission failure for days (TestFlight 2026-08-17).
      captureError(error, { where: 'deleteAccount.rpc' });
      toast.show({ message: `Couldn’t delete the account: ${error.message}` });
      return;
    }
    // Confirm it plainly - the screen is about to swap to sign-in and a
    // silent swap reads as "did that work?" (developer request 2026-08-17).
    // The toast provider sits above the auth guard, so it survives the swap.
    toast.show({ message: 'Account deleted. Everything has been removed.', placement: 'edge' });
    // The auth user is gone server-side. Local sign-out wipes the device
    // copy (sync db, cache, notifications) through the existing hooks.
    await supabase.auth.signOut();
  }

  async function sendPasswordReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    toast.show({
      message: error ? 'Couldn’t send the reset email.' : `Password reset email sent to ${email}.`,
    });
  }

  async function pickAvatar() {
    const userUuid = user?.id;
    if (!userUuid || uploadingAvatar) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setUploadingAvatar(true);
    try {
      const bytes = base64ToBytes(result.assets[0].base64);
      const path = `${userUuid}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes.buffer as ArrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust: same path every upload, so stale CDN copies linger.
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: saveError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (saveError) throw saveError;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      toast.show({ message: 'Couldn’t upload the picture — is the avatars bucket set up?' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function setThreshold(hours: number) {
    const { error } = await supabase.auth.updateUser({ data: { urgent_threshold_hours: hours } });
    if (error) toast.show({ message: 'Couldn’t save the setting.' });
  }

  function sectionTitle(label: string) {
    return (
      <Text style={[type.h2, { color: colors.textSecondary, marginTop: space.s6, marginBottom: space.s2 }]}>
        {label}
      </Text>
    );
  }

  function actionRow(label: string, onPress: () => void, color = colors.accent) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: space.s2 }}>
        <Text style={[type.body, { color }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s6 }]}>
        <View style={styles.titleRow}>
          <Text style={[type.h1, { color: colors.textPrimary, paddingVertical: space.s3 }]}>Settings</Text>
          <TourAnchor id="theme-toggle">
            <ThemeToggleButton />
          </TourAnchor>
        </View>

        {/* ---------------------------- Profile ---------------------------- */}
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.borderSubtle,
              borderRadius: radius.card,
              padding: space.s4,
              gap: space.s4,
            },
          ]}>
          <Pressable
            onPress={pickAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
            style={[styles.avatar, { backgroundColor: colors.accentMuted, opacity: uploadingAvatar ? 0.5 : 1 }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Text style={[type.h1, { color: colors.accent }]}>
                {(displayName || email).charAt(0).toUpperCase()}
              </Text>
            )}
          </Pressable>
          <View style={styles.profileText}>
            <Text style={[type.h2, { color: colors.textPrimary }]} numberOfLines={1}>
              {displayName || 'No display name'}
            </Text>
            <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

        {sectionTitle('Account')}
        {actionRow('Change display name', changeDisplayName)}
        {actionRow('Change email', changeEmail)}
        {actionRow('Send password reset email', sendPasswordReset)}

        {sectionTitle('Urgency')}
        <Text style={[type.body, { color: colors.textSecondary, marginBottom: space.s2 }]}>
          Tasks turn urgent this long before their due time.
        </Text>
        <View style={[styles.chipRow, { gap: space.s2 }]}>
          {THRESHOLD_OPTIONS.map((hours) => {
            const selected = threshold === hours;
            return (
              <Pressable
                key={hours}
                onPress={() => setThreshold(hours)}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent : colors.borderSubtle,
                  backgroundColor: selected ? colors.accentMuted : 'transparent',
                  borderRadius: radius.button,
                  paddingHorizontal: space.s4,
                  minHeight: 40,
                  justifyContent: 'center',
                }}>
                <Text style={[type.body, { color: selected ? colors.accent : colors.textPrimary }]}>
                  {hours}h
                </Text>
              </Pressable>
            );
          })}
        </View>

        {sectionTitle('Notifications')}
        <Text style={[type.body, { color: colors.textSecondary, marginBottom: space.s2 }]}>
          {notifStatus === 'granted'
            ? Platform.OS === 'web'
              ? 'On — while Multitask is open, you’ll be notified when a task turns urgent, and before its deadline.'
              : 'On — you’ll be notified when a task turns urgent, and before its deadline.'
            : notifStatus === 'denied'
              ? Platform.OS === 'web'
                ? 'Off — allow notifications for this site in your browser’s settings.'
                : 'Off — enable notifications for Multitask in your phone’s Settings.'
              : 'Not set up yet.'}
        </Text>
        {notifStatus !== 'granted' &&
          actionRow('Enable notifications', async () => {
            const granted = await ensureNotificationPermission();
            setNotifStatus(await getNotificationPermissionStatus());
            if (granted) toast.show({ message: 'Notifications enabled.' });
          })}
        <Text style={[type.body, { color: colors.textSecondary, marginTop: space.s2, marginBottom: space.s2 }]}>
          Remind me before a deadline:
        </Text>
        <View style={[styles.chipRow, { gap: space.s2 }]}>
          {LEAD_OPTIONS.map((minutes) => {
            const selected = leadMinutes === minutes;
            const label = minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
            return (
              <Pressable
                key={minutes}
                onPress={async () => {
                  const { error } = await supabase.auth.updateUser({
                    data: { notification_lead_minutes: minutes },
                  });
                  if (error) toast.show({ message: 'Couldn’t save the setting.' });
                }}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent : colors.borderSubtle,
                  backgroundColor: selected ? colors.accentMuted : 'transparent',
                  borderRadius: radius.button,
                  paddingHorizontal: space.s4,
                  minHeight: 40,
                  justifyContent: 'center',
                }}>
                <Text style={[type.body, { color: selected ? colors.accent : colors.textPrimary }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {Platform.OS !== 'web' && (
          <>
            {sectionTitle('Calendar')}
            <View style={[styles.switchRow, { minHeight: 44 }]}>
              <Text style={[type.body, { color: colors.textPrimary, flex: 1 }]}>
                Add tasks to my calendar
              </Text>
              <Switch
                value={calendarPending ?? calendarSyncEnabled}
                onValueChange={toggleCalendarSync}
                trackColor={{ true: colors.accent }}
                accessibilityLabel="Add tasks to my calendar"
              />
            </View>
            <Text style={[type.caption, { color: colors.textTertiary, marginTop: space.s1 }]}>
              {calendarSyncEnabled
                ? 'Open tasks with a due date appear as 30-minute events in a “Multitask” calendar.'
                : calendarPermission === 'denied'
                  ? 'Off — allow calendar access for Multitask in your phone’s Settings first.'
                  : calendarPermission === 'unavailable'
                    ? 'Needs the latest app build.'
                    : 'Off — nothing is written to your calendar.'}
            </Text>
          </>
        )}

        {sectionTitle('Timezone')}
        <Text style={[type.body, { color: colors.textSecondary }]}>
          Follows your phone: {deviceTimezone}. Due times are wall-clock — they don’t shift when you
          travel.
        </Text>

        {/* Low-key by design (docs/design/09): styles must never compete
            with the productivity settings above. */}
        {sectionTitle('Styles')}
        <Pressable
          onPress={() => router.push('/styles')}
          accessibilityRole="button"
          style={{ paddingVertical: space.s2 }}>
          <Text style={[type.body, { color: colors.accent }]}>Browse styles</Text>
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: space.s1 }]}>
            New looks are coming soon.
          </Text>
        </Pressable>

        {sectionTitle('Help')}
        {actionRow('Replay the tour', () => tour.start())}
        {actionRow('How to use Multitask', () => router.push('/guide'))}
        {actionRow('What’s new', () => router.push('/updates'))}
        {actionRow('Support', () => router.push('/support'))}
        {actionRow('Privacy policy', () => router.push('/privacy'))}
        {actionRow('Terms of service', () => router.push('/terms'))}

        {sectionTitle('Session')}
        {droppedOps > 0 && (
          <Text style={[type.caption, { color: colors.textTertiary, marginBottom: space.s2 }]}>
            {droppedOps === 1
              ? '1 change couldn’t sync and was skipped.'
              : `${droppedOps} changes couldn’t sync and were skipped.`}
          </Text>
        )}
        {actionRow('Sign out', () => supabase.auth.signOut(), colors.statusOverdueAccent)}
        {actionRow('Delete account', deleteAccount, colors.statusOverdueAccent)}

        <Text style={[type.caption, { color: colors.textTertiary, marginTop: space.s8 }]}>
          Multitask (development build)
        </Text>
      </ScrollView>

      <InputPromptDialog
        request={promptRequest?.request ?? null}
        onDone={(value) => {
          promptRequest?.resolve(value);
          setPromptRequest(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
