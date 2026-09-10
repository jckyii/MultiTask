// Imported calendar event (docs/design/02: visually DISTINCT from tasks —
// event-accent blue, dashed border instead of a solid status bar, no pills,
// no swipe actions). Events are a schedule, not a to-do: nothing to
// complete, nothing to edit.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CalendarEvent } from '@/lib/events/use-events';
import { readableTextColor } from '@/lib/theme/pill-colors';
import { useTheme } from '@/lib/theme/use-theme';

export function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return event.end ? `${fmt(event.start)} – ${fmt(event.end)}` : fmt(event.start);
}

export function EventCard({
  event,
  onPress,
  showNotes,
}: {
  event: CalendarEvent;
  onPress?: (event: CalendarEvent) => void;
  /** No-op since 2026-09-10: notes now always render on the card's right
   *  side, on every surface (mirroring the task card). Kept so existing
   *  call sites don't churn. */
  showNotes?: boolean;
}) {
  const { colors, space, radius, type, monoFont, isDark } = useTheme();
  const timeLabel = eventTimeLabel;
  const accent = event.color ?? colors.statusEventAccent;
  // The raw CSV color stays on the border (decorative); TEXT gets the same
  // lightness clamp as pills — a pale-yellow event otherwise renders
  // illegible time text on a light surface.
  const timeColor = event.color ? readableTextColor(event.color, isDark) : colors.statusEventAccent;
  const hasNotes = !!event.notes;
  return (
    <Pressable
      onPress={onPress && (() => onPress(event))}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Event: ${event.title}, ${timeLabel(event)}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: accent,
          borderRadius: radius.card,
          padding: space.s4,
        },
      ]}>
      {/* Notes on the right 40%, top-down, clipped at the bottom edge —
          the same treatment as task cards (developer 2026-09-10). */}
      {hasNotes && (
        <View pointerEvents="none" style={styles.notesColumn}>
          <Text
            maxFontSizeMultiplier={1.2}
            style={[type.caption, { color: colors.textTertiary, fontWeight: '400', textAlign: 'right' }]}>
            {event.notes}
          </Text>
        </View>
      )}

      <View style={[styles.content, hasNotes && { paddingRight: '42%' }]}>
        <Text numberOfLines={2} style={[type.h2, { color: colors.textPrimary }]}>
          {event.title}
        </Text>
        <Text style={{ fontFamily: monoFont, fontSize: 12, lineHeight: 16, color: timeColor }}>
          {timeLabel(event)}
        </Text>
        {/* Location anchors the card's BOTTOM LEFT (developer 2026-09-10:
            "it is very important") — the last row of the column, first
            thing the eye lands on after the title and time. */}
        {event.location && (
          <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary }]}>
            {event.location}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  content: {
    gap: 4,
  },
  notesColumn: {
    position: 'absolute',
    right: 12,
    top: 12,
    bottom: 12,
    width: '40%',
    justifyContent: 'flex-start',
    overflow: 'hidden', // long notes stop at the card's bottom edge
  },
});
