// Manual event creation (developer request 2026-08-17 — events were
// CSV-import-only by design until now). Same sheet shell as the import
// sheet, same event model: title + date required, all-day or start/end
// times, optional location/notes, color swatch (null = theme event blue).
// Inserts through the SAME dual-mode path as import (useImportEvents with
// one row, source 'manual'), so sync mode and Expo Go both just work, and
// events stay non-editable after creation (delete + re-add, like imports).
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { InlineDatePicker } from '@/components/inline-date-picker';
import { useUndoToast } from '@/components/undo-toast';
import { useWideNative } from '@/hooks/use-wide-layout';
import { NAMED_EVENT_COLORS } from '@/lib/events/csv';
import { useImportEvents } from '@/lib/events/use-events';
import { EVENT_LOCATION_MAX, EVENT_NOTES_MAX, EVENT_TITLE_MAX } from '@/lib/limits';
import { tabletSheet } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

const isWeb = Platform.OS === 'web';

const COLOR_CHOICES = ['red', 'orange', 'yellow', 'green', 'teal', 'indigo', 'purple', 'pink'].map(
  (name) => ({ name, hex: NAMED_EVENT_COLORS[name] })
);

/** Next quarter hour — the same friendly default quick-add uses. */
function nextQuarterHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
  return d;
}

export default function AddEventScreen() {
  const router = useRouter();
  const { colors, space, radius, type, monoFont } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const onTablet = useWideNative();
  const toast = useUndoToast();
  const importEvents = useImportEvents();

  const [title, setTitle] = useState('');
  const [start, setStart] = useState<Date>(nextQuarterHour());
  const [end, setEnd] = useState<Date | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [picker, setPicker] = useState<'date' | 'start' | 'end' | null>(null);

  // Sheet enter/exit — same shell as the import sheet.
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

  const canAdd = title.trim().length > 0 && !importEvents.isPending;

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    // End before start reads as an input slip — drop the end rather than
    // storing a negative-length event (matches the CSV parser's tolerance).
    const cleanEnd = !allDay && end && end.getTime() > start.getTime() ? end : null;
    importEvents.mutate(
      {
        events: [
          {
            title: trimmed,
            start,
            end: cleanEnd,
            allDay,
            location: location.trim() ? location.trim().slice(0, EVENT_LOCATION_MAX) : null,
            notes: notes.trim() ? notes.trim().slice(0, EVENT_NOTES_MAX) : null,
            color,
          },
        ],
        source: 'manual',
        defaultColor: null,
      },
      {
        onSuccess: () => toast.show({ message: 'Event added to the calendar.' }),
        onError: () => toast.show({ message: 'Couldn’t add the event — check your connection.' }),
      }
    );
    close();
  }

  function timeLabel(d: Date | null): string {
    if (!d) return 'Add end';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  const chipStyle = {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    paddingHorizontal: space.s3,
    minHeight: 40,
    justifyContent: 'center' as const,
  };

  function onPickerChange(selected: Date | null, dismissed: boolean) {
    if (dismissed || !selected) {
      if (Platform.OS === 'android') setPicker(null);
      return;
    }
    if (picker === 'date') {
      const next = new Date(start);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setStart(next);
      if (end) {
        const e = new Date(end);
        e.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        setEnd(e);
      }
    } else if (picker === 'start') {
      const next = new Date(start);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setStart(next);
    } else if (picker === 'end') {
      const e = new Date(start);
      e.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setEnd(e);
    }
    if (Platform.OS === 'android') setPicker(null);
  }

  return (
    <View
      style={[styles.container, isWeb && styles.containerWeb]}
      pointerEvents={importEvents.isPending ? 'none' : 'auto'}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Pressable style={styles.backdropTouch} onPress={close} accessibilityLabel="Close add event" />
      <Animated.View
        style={[
          sheetStyle,
          styles.sheet,
          isWeb && styles.sheetWeb,
          onTablet && tabletSheet,
          {
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            padding: space.s4,
            paddingBottom: Math.max(insets.bottom, space.s4),
          },
          isWeb && {
            borderBottomLeftRadius: radius.card,
            borderBottomRightRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
          },
        ]}>
        <ScrollView
          style={{ maxHeight: screenHeight * 0.8 }}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={[type.h2, { color: colors.textPrimary, marginBottom: space.s3 }]}>New event</Text>

          <TextInput
            style={[
              styles.titleInput,
              {
                borderColor: colors.borderSubtle,
                borderRadius: radius.button,
                color: colors.textPrimary,
                paddingHorizontal: space.s3,
              },
            ]}
            placeholder="Event title"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={EVENT_TITLE_MAX}
            autoFocus={!isWeb}
            returnKeyType="done"
          />

          <View style={[styles.chipRow, { gap: space.s2, marginTop: space.s3 }]}>
            <Pressable
              onPress={() => setPicker(picker === 'date' ? null : 'date')}
              accessibilityRole="button"
              accessibilityLabel="Event date"
              style={chipStyle}>
              <Text style={{ fontFamily: monoFont, fontSize: 13, color: colors.textPrimary }}>
                {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </Pressable>
            {!allDay && (
              <>
                <Pressable
                  onPress={() => setPicker(picker === 'start' ? null : 'start')}
                  accessibilityRole="button"
                  accessibilityLabel="Start time"
                  style={chipStyle}>
                  <Text style={{ fontFamily: monoFont, fontSize: 13, color: colors.textPrimary }}>
                    {timeLabel(start)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPicker(picker === 'end' ? null : 'end')}
                  accessibilityRole="button"
                  accessibilityLabel={end ? 'End time' : 'Add end time'}
                  style={chipStyle}>
                  <Text style={{ fontFamily: monoFont, fontSize: 13, color: end ? colors.textPrimary : colors.textSecondary }}>
                    {timeLabel(end)}
                  </Text>
                </Pressable>
                {end && (
                  <Pressable
                    onPress={() => setEnd(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear end time"
                    style={[chipStyle, { paddingHorizontal: space.s2 }]}>
                    <Text style={{ color: colors.textSecondary }}>✕</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          {picker && (
            <View style={{ paddingTop: space.s2 }}>
              <InlineDatePicker
                mode={picker === 'date' ? 'date' : 'time'}
                value={picker === 'end' ? (end ?? start) : start}
                onChange={onPickerChange}
              />
            </View>
          )}

          <View style={[styles.allDayRow, { marginTop: space.s3 }]}>
            <Text style={[type.body, { color: colors.textPrimary }]}>All day</Text>
            <Switch
              value={allDay}
              onValueChange={(v) => {
                setAllDay(v);
                if (v && (picker === 'start' || picker === 'end')) setPicker(null);
              }}
              trackColor={{ true: colors.accent }}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: space.s3 }]}>Location</Text>
          <TextInput
            style={[
              styles.titleInput,
              {
                borderColor: colors.borderSubtle,
                borderRadius: radius.button,
                color: colors.textPrimary,
                paddingHorizontal: space.s3,
                marginTop: space.s1,
              },
            ]}
            placeholder="Optional"
            placeholderTextColor={colors.textTertiary}
            value={location}
            onChangeText={setLocation}
            maxLength={EVENT_LOCATION_MAX}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: space.s3 }]}>Notes</Text>
          <TextInput
            style={[
              styles.notesInput,
              {
                borderColor: colors.borderSubtle,
                borderRadius: radius.button,
                color: colors.textPrimary,
                padding: space.s3,
                marginTop: space.s1,
              },
            ]}
            placeholder="Optional"
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            maxLength={EVENT_NOTES_MAX}
            multiline
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: space.s3 }]}>Color</Text>
          <View style={[styles.swatchRow, { gap: space.s2, marginTop: space.s1 }]}>
            <Pressable
              onPress={() => setColor(null)}
              hitSlop={7}
              accessibilityRole="button"
              accessibilityLabel="Default blue"
              accessibilityState={{ selected: color === null }}
              style={[
                styles.swatch,
                {
                  backgroundColor: colors.statusEventAccent,
                  borderColor: color === null ? colors.textPrimary : 'transparent',
                },
              ]}
            />
            {COLOR_CHOICES.map((c) => (
              <Pressable
                key={c.name}
                onPress={() => setColor(c.hex)}
                hitSlop={7}
                accessibilityRole="button"
                accessibilityLabel={`Color ${c.name}`}
                accessibilityState={{ selected: color === c.hex }}
                style={[
                  styles.swatch,
                  { backgroundColor: c.hex, borderColor: color === c.hex ? colors.textPrimary : 'transparent' },
                ]}
              />
            ))}
          </View>
        </ScrollView>

        <Pressable
          onPress={submit}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="Add event"
          style={({ pressed }) => [
            styles.submitButton,
            {
              backgroundColor: colors.accent,
              borderRadius: radius.button,
              marginTop: space.s3,
              opacity: !canAdd ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}>
          <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>Add event</Text>
        </Pressable>
      </Animated.View>
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
  sheet: {
    width: '100%',
  },
  sheetWeb: {
    maxWidth: 560,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  titleInput: {
    borderWidth: 1,
    minHeight: 44,
    fontSize: 16,
  },
  notesInput: {
    borderWidth: 1,
    minHeight: 72,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  allDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
  },
  submitButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
