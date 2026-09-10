// The feedback form (developer request 2026-09-09) — a low-ceremony sheet
// reached from Settings → Help. One multiline field, one Send button;
// rows land in the `feedback` table (supabase/14, insert-only RLS) where
// the developer reads them in the dashboard. Online-only on purpose:
// feedback is not synced data, and a clear "couldn't send" beats a
// silently queued message.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useUndoToast } from '@/components/undo-toast';
import { FEEDBACK_MAX } from '@/lib/limits';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme/use-theme';

export default function FeedbackScreen() {
  const router = useRouter();
  const { colors, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const toast = useUndoToast();

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Keep the sheet clear of the keyboard (same pattern as the task form).
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Same sheet shell as the other transparent routes.
  const sheetOffset = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);
  useEffect(() => {
    backdropOpacity.value = withTiming(1, { duration: 220 });
    sheetOffset.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [backdropOpacity, sheetOffset]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetOffset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value * 0.35 }));

  function goBack() {
    router.back();
  }
  function close() {
    backdropOpacity.value = withTiming(0, { duration: 220 });
    sheetOffset.value = withTiming(screenHeight, { duration: 160, easing: Easing.in(Easing.cubic) });
    setTimeout(goBack, 170);
  }

  async function send() {
    const trimmed = message.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    const { error } = await supabase.from('feedback').insert({ message: trimmed });
    setSending(false);
    if (error) {
      toast.show({ message: 'Couldn’t send — check your connection.' });
      return;
    }
    toast.show({ message: 'Feedback sent. Thank you.' });
    close();
  }

  const canSend = message.trim().length > 0 && !sending;

  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Pressable style={styles.backdropTouch} onPress={close} accessibilityLabel="Close feedback" />
      <Animated.View
        style={[
          sheetStyle,
          styles.sheet,
          isWeb && {
            borderBottomLeftRadius: radius.card,
            borderBottomRightRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
          },
          {
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            padding: space.s4,
            paddingBottom:
              !isWeb && keyboardHeight > 0
                ? keyboardHeight + space.s3
                : Math.max(insets.bottom, space.s4),
            gap: space.s3,
          },
        ]}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>Feedback</Text>
        <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400' }]}>
          Concerns, improvements, ideas, anything helps. Sent with your account so a fix can be
          followed up on.
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.borderSubtle,
              borderRadius: radius.button,
              color: colors.textPrimary,
              padding: space.s3,
            },
          ]}
          placeholder="What should be better?"
          placeholderTextColor={colors.textTertiary}
          value={message}
          onChangeText={setMessage}
          maxLength={FEEDBACK_MAX}
          multiline
          autoFocus
          accessibilityLabel="Feedback message"
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          accessibilityLabel="Send feedback"
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: canSend ? colors.accent : colors.surfaceSunken,
              borderRadius: radius.button,
              transform: [{ scale: pressed && canSend ? 0.98 : 1 }],
            },
          ]}>
          <Text
            style={[
              type.body,
              { color: canSend ? colors.textOnAccent : colors.textTertiary, fontWeight: '600' },
            ]}>
            {sending ? 'Sending…' : 'Send feedback'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  containerWeb: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sendButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
