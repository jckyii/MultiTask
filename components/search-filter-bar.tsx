// The search + filter bar for the task list. Lives as the list's header,
// hidden above the fold — a small pull-down reveals it (iOS Mail pattern);
// a bigger pull still triggers refresh. "Filter" slides open a panel with
// urgency / category / subject chips; any active criterion switches the
// list to a results-only view.
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CollapsibleReveal } from '@/components/collapsible-reveal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { type TaskFilters, type UrgencyFilter } from '@/lib/tasks/filter';
import { priorityTiers } from '@/lib/theme/tokens';
import { useTheme } from '@/lib/theme/use-theme';

export type FilterOption = { name: string; color: string };

type Props = {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  categories: FilterOption[];
  subjects: FilterOption[];
};

const URGENCY_OPTIONS: { value: UrgencyFilter; label: string }[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'ongoing', label: 'Ongoing' },
];

export function SearchFilterBar({ filters, onChange, panelOpen, onTogglePanel, categories, subjects }: Props) {
  const { colors, space, radius, type, isDark } = useTheme();

  const urgencyColor: Record<UrgencyFilter, string> = {
    overdue: colors.statusOverdueAccent,
    urgent: colors.statusUrgentAccent,
    ongoing: colors.statusOngoingAccent,
  };

  function chip(label: string, selected: boolean, onPress: () => void, dotColor?: string) {
    return (
      <Pressable
        key={label}
        onPress={onPress}
        // 36pt visual height + slop = the 44pt HIG minimum without changing
        // the tuned look.
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{
          borderWidth: 1.5,
          borderColor: selected ? colors.accent : colors.borderSubtle,
          backgroundColor: selected ? colors.accentMuted : 'transparent',
          borderRadius: radius.button,
          paddingHorizontal: space.s3,
          minHeight: 36,
          justifyContent: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s2,
        }}>
        {dotColor && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />}
        <Text style={[type.caption, { color: selected ? colors.accent : colors.textPrimary, fontSize: 13 }]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  function label(text: string) {
    return (
      <Text style={[type.caption, { color: colors.textSecondary, marginTop: space.s2 }]}>{text}</Text>
    );
  }

  return (
    <View style={{ paddingBottom: space.s2 }}>
      <View style={[styles.barRow, { gap: space.s2 }]}>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.borderSubtle,
              borderRadius: radius.button,
              color: colors.textPrimary,
              paddingHorizontal: space.s3,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
          placeholder="Search tasks"
          placeholderTextColor={colors.textTertiary}
          value={filters.query}
          onChangeText={(query) => onChange({ ...filters, query })}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <Pressable
          onPress={onTogglePanel}
          accessibilityRole="button"
          accessibilityState={{ expanded: panelOpen }}
          accessibilityLabel={
            panelOpen
              ? 'Hide the urgency, lifestyle, and subject filters'
              : 'Filter tasks by urgency, lifestyle, or subject'
          }
          style={[styles.filterButton, { gap: 2 }]}>
          <Text style={[type.body, { color: colors.accent }]}>Filter</Text>
          <IconSymbol name={panelOpen ? 'chevron.down' : 'chevron.right'} size={13} color={colors.accent} />
        </Pressable>
      </View>

      <CollapsibleReveal open={panelOpen}>
        <View style={{ gap: space.s2, paddingTop: space.s2 }}>
          {label('Urgency')}
          <View style={[styles.wrapRow, { gap: space.s2 }]}>
            {URGENCY_OPTIONS.map((option) =>
              chip(
                option.label,
                filters.urgency === option.value,
                () =>
                  onChange({
                    ...filters,
                    urgency: filters.urgency === option.value ? null : option.value,
                  }),
                urgencyColor[option.value]
              )
            )}
          </View>

          {label('Priority')}
          <View style={[styles.wrapRow, { gap: space.s2 }]}>
            {[1, 2, 3].map((tier) =>
              chip(
                priorityTiers[tier].label,
                filters.priority === tier,
                () => onChange({ ...filters, priority: filters.priority === tier ? null : tier }),
                isDark ? priorityTiers[tier].dark : priorityTiers[tier].light
              )
            )}
            {chip('None', filters.priority === 0, () =>
              onChange({ ...filters, priority: filters.priority === 0 ? null : 0 })
            )}
          </View>

          {categories.length > 0 && (
            <>
              {label('Lifestyle')}
              <View style={[styles.wrapRow, { gap: space.s2 }]}>
                {categories.map((c) =>
                  chip(
                    c.name,
                    filters.category === c.name,
                    () =>
                      onChange({ ...filters, category: filters.category === c.name ? null : c.name }),
                    c.color
                  )
                )}
              </View>
            </>
          )}

          {subjects.length > 0 && (
            <>
              {label('Subject')}
              <View style={[styles.wrapRow, { gap: space.s2 }]}>
                {subjects.map((s) =>
                  chip(
                    s.name,
                    filters.subject === s.name,
                    () => onChange({ ...filters, subject: filters.subject === s.name ? null : s.name }),
                    s.color
                  )
                )}
              </View>
            </>
          )}
        </View>
      </CollapsibleReveal>
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
