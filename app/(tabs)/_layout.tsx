import { Tabs, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useCalendarSync } from '@/hooks/use-calendar-sync';
import { useDroppedOpCount } from '@/hooks/use-dropped-ops';
import { useFirstRunGuide } from '@/hooks/use-first-run-guide';
import { useNotificationNavigation } from '@/hooks/use-notification-navigation';
import { useNotificationSync } from '@/hooks/use-notification-sync';
import { useQuickActions } from '@/hooks/use-quick-actions';
import { useSiriActions } from '@/hooks/use-siri-actions';
import { useSpotlightSync } from '@/hooks/use-spotlight-sync';
import { useWidgetSnapshot } from '@/hooks/use-widget-snapshot';
import { useTheme } from '@/lib/theme/use-theme';

const TAB_ORDER = ['/', '/daily', '/calendar', '/settings'] as const;
// Screen-EDGE strips where the tab swipe recognizes — the middle of the
// screen belongs to the task-card swipes (developer request 2026-08-11:
// swipe between pages without breaking card gestures).
const EDGE = 32;

/** Runs inside TourProvider (mounted at the root) so the first-run hook can
 *  start the tour. */
function FirstRunTour() {
  useFirstRunGuide();
  return null;
}

/** Tab label with an underline on the active tab (developer request:
 *  make it clearer which page you are on). */
function tabLabel(title: string) {
  return function TabLabel({ focused, color }: { focused: boolean; color: string }) {
    return (
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 10, fontWeight: focused ? '700' : '400', color }}>{title}</Text>
        <View
          style={{
            height: 2,
            borderRadius: 1,
            alignSelf: 'stretch',
            backgroundColor: focused ? color : 'transparent',
          }}
        />
      </View>
    );
  };
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  // Tabs only render when signed in, so these run exactly when they should.
  useNotificationSync();
  useNotificationNavigation();
  useCalendarSync();
  useQuickActions();
  useWidgetSnapshot();
  useSpotlightSync();
  useSiriActions();
  useDroppedOpCount({ notify: true });

  // Web ≥1024 gets a LEFT nav rail (developer decision, moved from right
  // 2026-07-11 after seeing the right rail live; docs/design/08 updated) —
  // the bottom bar is a phone pattern. React Navigation 7 requires the
  // 'material' variant for side positions.
  const sideNav = Platform.OS === 'web' && width >= 1024;

  // Edge-swipe between tabs: a pan that only recognizes in the outer EDGE
  // strips (hitSlop shrinks the active area), so task-card swipes in the
  // middle of the screen never fight it.
  function goNeighbor(direction: 1 | -1) {
    const current = TAB_ORDER.indexOf(pathname as (typeof TAB_ORDER)[number]);
    if (current < 0) return;
    const next = TAB_ORDER[current + direction];
    if (next) router.navigate(next);
  }
  const fromRightEdge = Gesture.Pan()
    .hitSlop({ left: -(width - EDGE) })
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onEnd((event) => {
      if (event.translationX < -40) runOnJS(goNeighbor)(1);
    });
  const fromLeftEdge = Gesture.Pan()
    .hitSlop({ right: -(width - EDGE) })
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onEnd((event) => {
      if (event.translationX > 40) runOnJS(goNeighbor)(-1);
    });
  const tabSwipe = Gesture.Race(fromRightEdge, fromLeftEdge);

  return (
    <>
    <GestureDetector gesture={tabSwipe}>
    <View style={{ flex: 1 }} collapsable={false}>
    <Tabs
      screenOptions={{
        // Token accent, NOT the Expo template's teal — the active tab is the
        // most-seen accent in the app and must match the brand color.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        headerShown: false,
        tabBarButton: HapticTab,
        ...(sideNav
          ? ({
              tabBarPosition: 'left',
              tabBarVariant: 'material',
              tabBarLabelPosition: 'below-icon',
            } as const)
          : null),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          tabBarLabel: tabLabel('Tasks'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checklist" color={color} />,
        }}
      />
      <Tabs.Screen
        name="daily"
        options={{
          title: 'Daily',
          tabBarLabel: tabLabel('Daily'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sun.max.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarLabel: tabLabel('Calendar'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Updates',
          tabBarLabel: tabLabel('Updates'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sparkles" color={color} />,
          // A visible tab only on the computer (developer request
          // 2026-08-18) - phones keep four tabs and reach this from
          // Settings > Help > What's new (href null hides the button but
          // the route stays navigable).
          href: Platform.OS === 'web' ? '/updates' : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: tabLabel('Settings'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
    </View>
    </GestureDetector>
    <FirstRunTour />
    </>
  );
}
