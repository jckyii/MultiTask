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

/** The lifestyle + subject badge (developer revamp 2026-08-26): ONE
 *  combined pill — `( lifestyle ( subject )` — the subject pill starts
 *  where the lifestyle pill would end, overlapping its right cap, both
 *  keeping their own colors. Subject-less tasks fall back to the plain
 *  lifestyle pill. */
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
  const life = pillColors(lifestyleColor, isDark);
  const sub = pillColors(subjectColor, isDark);
  return (
    <View style={styles.combinedRow}>
      <View
        style={[
          styles.pill,
          styles.combinedLifestyle,
          { backgroundColor: life.background, borderColor: life.border },
        ]}>
        <Text style={[styles.label, { color: life.text }]} numberOfLines={1}>
          {lifestyle}
        </Text>
      </View>
      {/* Overlaps the lifestyle pill's right end — its rounded left cap IS
          the lifestyle pill's ending, per the ( a ( b ) sketch. */}
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
    // Room for the subject pill's cap to land on top of this end.
    paddingRight: 18,
  },
  combinedSubject: {
    marginLeft: -14,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
