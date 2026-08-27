// "Updates" - what changed recently (developer request 2026-08-18). On the
// computer this is a real tab on the side rail. On phones the tab button is
// hidden (href null in the layout) to keep the bar at four - Settings >
// Help > "What's new" routes here instead. Content lives in
// lib/updates/entries.ts; the card anatomy matches the policy pages.
import { Image, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { TabPage } from '@/components/tab-pager';
import { UPDATE_ENTRIES } from '@/lib/updates/entries';
import { pageContent } from '@/lib/theme/layout';
import { useTheme } from '@/lib/theme/use-theme';

export default function UpdatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, space, radius, type, monoFont } = useTheme();

  return (
    <TabPage>
    <View style={[styles.screen, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[pageContent, { paddingHorizontal: space.s4, paddingBottom: insets.bottom + space.s8 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={[type.display, { color: colors.textPrimary, marginTop: space.s3 }]}>Updates</Text>
        <Text style={[type.caption, { fontFamily: monoFont, color: colors.textTertiary, marginTop: space.s1, marginBottom: space.s5 }]}>
          what changed recently
        </Text>

        <View style={{ gap: space.s3 }}>
          {UPDATE_ENTRIES.map((entry) => (
            <View
              key={entry.title}
              style={{
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.borderSubtle,
                borderWidth: 1,
                borderLeftWidth: 4,
                borderLeftColor: colors.accent,
                borderRadius: radius.card,
                padding: space.s4,
                gap: space.s2,
              }}>
              <Text style={[type.caption, { fontFamily: monoFont, color: colors.textTertiary }]}>{entry.date}</Text>
              <Text style={[type.h2, { color: colors.textPrimary }]}>{entry.title}</Text>
              {entry.image && (
                <Image
                  source={entry.image}
                  style={{ width: '100%', height: 220, borderRadius: radius.tight }}
                  resizeMode="cover"
                />
              )}
              <View style={{ gap: space.s1 }}>
                {entry.points.map((point) => (
                  <View key={point} style={styles.pointRow}>
                    <Text style={[type.body, { color: colors.accent }]}>·</Text>
                    <Text style={[type.body, styles.pointText, { color: colors.textSecondary }]}>{point}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push('/guide')}
          accessibilityRole="button"
          accessibilityLabel="How to use Multitask"
          style={[styles.guideRow, { borderColor: colors.borderSubtle, borderRadius: radius.card, padding: space.s4, marginTop: space.s3 }]}>
          <Text style={[type.body, { color: colors.textPrimary, fontWeight: '600' }]}>
            New here? The full guide walks through everything.
          </Text>
          <IconSymbol name="chevron.right" size={18} color={colors.accent} />
        </Pressable>
      </ScrollView>
    </View>
    </TabPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pointRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  pointText: { flex: 1 },
  guideRow: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
