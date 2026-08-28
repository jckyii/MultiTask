// Category/subject pills and the priority tier badge (docs/design/02).
// Small, unobtrusive — present on cards but never competing with the title.
import { StyleSheet, Text, View } from 'react-native';

import { pillColors } from '@/lib/theme/pill-colors';
import { priorityTiers } from '@/lib/theme/tokens';
import { useTheme } from '@/lib/theme/use-theme';

export function Pill({ label, color }: { label: string; color: string }) {
  const { isDark } = useTheme();
  const palette = pillColors(color, isDark);
  return (
    <View style={[styles.pill, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** The lifestyle + subject badge (developer revamp, corrected round 2
 *  2026-08-27): ONE combined badge shaped `( lifestyle )  subject )` — the
 *  lifestyle pill is SOLID in its own color and sits ON TOP at the left,
 *  fully closed; the subject pill runs BEHIND it, its tail and text
 *  showing to the right ("more looks like a venn diagram" was the round-1
 *  overlap of two pastel pills). Subject-less tasks fall back to the plain
 *  lifestyle pill. */
/** Black-or-white for text sitting ON a solid user color (the pastel
 *  pillColors math is for tinted surfaces, not raw fills). */
function textOnSolid(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Perceived luminance (ITU-R BT.601) — enough to pick black vs white.
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 150 ? '#1A1A1D' : '#FFFFFF';
}

export function LifestylePill({
  lifestyle,
  lifestyleColor,
  subject,
  subjectColor,
}: {
  lifestyle: string;
  lifestyleColor: string;
  subject: string | null;
  subjectColor: string;
}) {
  const { isDark } = useTheme();
  if (!subject) return <Pill label={lifestyle} color={lifestyleColor} />;
  const sub = pillColors(subjectColor, isDark);
  return (
    <View style={styles.combinedRow}>
      {/* Solid lifestyle color, auto-contrast text, ABOVE the subject. */}
      <View
        style={[
          styles.pill,
          styles.combinedLifestyle,
          { backgroundColor: lifestyleColor, borderColor: lifestyleColor },
        ]}>
        <Text
          style={[styles.label, { color: textOnSolid(lifestyleColor) }]}
          numberOfLines={1}>
          {lifestyle}
        </Text>
      </View>
      {/* Runs underneath; paddingLeft keeps its text clear of the overlap
          so only the tail shows: ( lifestyle )  subject ) */}
      <View
        style={[
          styles.pill,
          styles.combinedSubject,
          { backgroundColor: sub.background, borderColor: sub.border },
        ]}>
        <Text style={[styles.label, { color: sub.text }]} numberOfLines={1}>
          {subject}
        </Text>
      </View>
    </View>
  );
}

/** "1st" / "2nd" / "3rd" — tier colors fixed by the design, not user-picked. */
export function PriorityBadge({ priority }: { priority: number }) {
  const { isDark, colors } = useTheme();
  const tier = priorityTiers[priority];
  const color = tier ? (isDark ? tier.dark : tier.light) : colors.textSecondary;
  const label = tier?.label ?? `${priority}th`;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 20, // grows with Dynamic Type instead of clipping
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  combinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  combinedLifestyle: {
    zIndex: 2,
  },
  combinedSubject: {
    zIndex: 1,
    // Slides under the lifestyle pill; the padding keeps the subject text
    // out in the visible tail.
    marginLeft: -16,
    paddingLeft: 24,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
