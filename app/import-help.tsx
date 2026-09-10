// "How do I make a CSV?" — plain instructions plus a ready-made prompt the
// user can paste into any AI to generate a correctly-formatted schedule CSV
// (the app deliberately has no event-creation UI; the CSV is made elsewhere).
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { TourOverlay } from '@/components/tour/tour-overlay';
import { useUndoToast } from '@/components/undo-toast';
import { useWideNative } from '@/hooks/use-wide-layout';
import { tabletSheet } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

const AI_PROMPT = `You are helping me turn my schedule into a CSV file for my calendar app. I will paste my events in my NEXT message. For now, just read these rules and reply "Ready — paste your events."

Each event has these values:
- title  (REQUIRED) — what the event is called
- date   (REQUIRED) — the day it happens
- start time (optional) — leave out for an all-day event
- end time   (optional)
- location   (optional)
- notes      (optional)
- color      (optional) — a hex code like #22c55e, or one of: red, orange, yellow, green, teal, blue, indigo, purple, pink, gray

When I paste my events:
1. Read every one.
2. If ANY event is missing a REQUIRED value (a title or a date), do NOT guess. List exactly which events are missing which value and ASK me for it, then wait for my reply.
3. Only once every event has a title and a date, output the CSV.

CSV output rules (when you finally write it):
- Output ONLY raw CSV text — no explanation, no code fences.
- First line, exactly: title,date,start time,end time,location,notes,color
- date as YYYY-MM-DD. Times as 24-hour HH:MM or h:mm AM/PM.
- One row per event (repeat rows for anything recurring — one row per date).
- If a field contains a comma, wrap that whole field in double quotes.

Reply "Ready — paste your events" now, and nothing else.`;

export default function ImportHelpScreen() {
  const router = useRouter();
  const { colors, space, radius, type, monoFont } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const onTablet = useWideNative();
  const toast = useUndoToast();

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

  async function copyPrompt() {
    await Clipboard.setStringAsync(AI_PROMPT);
    toast.show({ message: 'Prompt copied — paste it into any AI.' });
  }

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Pressable style={styles.backdropTouch} onPress={close} accessibilityLabel="Close help" />
      <Animated.View
        style={[
          sheetStyle,
          // Desktop/web: centered dialog like every other sheet (polish
          // pass 2026-08-02).
          Platform.OS === 'web' && styles.sheetWeb,
          onTablet && tabletSheet,
          {
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            padding: space.s4,
            paddingBottom: Math.max(insets.bottom, space.s4),
            maxHeight: screenHeight * 0.85,
          },
          Platform.OS === 'web' && {
            borderBottomLeftRadius: radius.card,
            borderBottomRightRadius: radius.card,
            borderColor: colors.borderSubtle,
          },
        ]}>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ gap: space.s3 }}>
          <Text style={[type.h2, { color: colors.textPrimary }]}>Importing a schedule</Text>

          <Text style={[type.body, { color: colors.textSecondary }]}>
            The app doesn’t create events itself — you bring a CSV file (a plain spreadsheet format)
            and import it. Three ways to get one:
          </Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>
            1. Ask an AI (easiest): copy the prompt below and send it FIRST. Then paste your events
            when it asks. It’ll check for anything required that’s missing (a title or a date), ask
            you for it, and then reply with the CSV to save as a .csv file.{'\n'}
            2. Export from a spreadsheet: build columns in Excel/Google Sheets and use File → Download
            → CSV.{'\n'}
            3. Write it by hand in any text editor — it’s just comma-separated lines.
          </Text>

          <Text style={[type.body, { color: colors.textSecondary }]}>
            Then get the file onto your phone (Files, iCloud, AirDrop, email attachment) and pick it
            from the import screen.
          </Text>

          <Text style={[type.h2, { color: colors.textPrimary, marginTop: space.s2 }]}>The AI prompt</Text>
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: radius.button,
              padding: space.s3,
            }}>
            <Text style={{ fontFamily: monoFont, fontSize: 12, lineHeight: 18, color: colors.textSecondary }}>
              {AI_PROMPT}
            </Text>
          </View>

          <Pressable
            onPress={copyPrompt}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.accent, borderRadius: radius.button, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>Copy prompt</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
      {/* The tour's AI-prompt steps render from inside this route (native
          modals paint above the root overlay). */}
      <TourOverlay host="import-help" />
    </View>
  );
}

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
  sheetWeb: {
    width: '100%',
    maxWidth: 640,
    borderWidth: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  primaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
