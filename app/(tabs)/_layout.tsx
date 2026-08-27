import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { isReduceMotionEnabled } from '@/lib/reduced-motion';

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

/** Runs inside TourProvider (mounted at the root) so the first-run hook can
 *  start the tour. */
function FirstRunTour() {
  useFirstRunGuide();
  return null;
}

/** Tab label with an underline on the active tab (developer request:
 *  make it clearer which page you are on). The line EXPANDS OUTWARD from
 *  the center when a tab becomes active (developer request 2026-08-17) —
 *  scaleX from 0, instant under reduced motion. */
function tabLabel(title: string) {
  return function TabLabel({ focused, color }: { focused: boolean; color: string }) {
    const grow = useRef(new Animated.Value(focused ? 1 : 0)).current;
    useEffect(() => {
      if (isReduceMotionEnabled()) {
        grow.setValue(focused ? 1 : 0);
        return;
      }
      Animated.timing(grow, {
        toValue: focused ? 1 : 0,
        // 320: 180 read as a blink (developer, Expo Go review 2026-08-26).
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, [focused, grow]);
    return (
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 10, fontWeight: focused ? '700' : '400', color }}>{title}</Text>
        <Animated.View
          style={{
            height: 2,
            borderRadius: 1,
            alignSelf: 'stretch',
            backgroundColor: color,
            opacity: grow,
            transform: [{ scaleX: grow }],
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

  // FULL-SURFACE swipe between tabs (developer request 2026-08-17: "swipe
  // anywhere that doesn't have a swipe action" — was edge-strips only).
  // Deconfliction is by ACTIVATION DISTANCE, not by zones: everything that
  // owns a horizontal gesture (task/recurring card swipes, the week and day
  // pagers) activates at ±16, this pan not until ±48 — so on their surface
  // they always claim the gesture first and this one is cancelled, while on
  // free surface (Settings, month grid, headers, blank space) nothing
  // competes and the tab pan wins. failOffsetY keeps vertical scrolling
  // untouched: 16px of vertical travel fails the pan long before 48px of
  // horizontal can arm it.
  function goNeighbor(direction: 1 | -1) {
    const current = TAB_ORDER.indexOf(pathname as (typeof TAB_ORDER)[number]);
    if (current < 0) return;
    const next = TAB_ORDER[current + direction];
    if (next) router.navigate(next);
  }
  const tabSwipe = Gesture.Pan()
    .activeOffsetX([-48, 48])
    .failOffsetY([-16, 16])
    .onEnd((event) => {
      if (event.translationX < -56) runOnJS(goNeighbor)(1);
      else if (event.translationX > 56) runOnJS(goNeighbor)(-1);
    });

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
        // Direction-aware page slide on tab changes — the day-view feel for
        // left/right travel, for swipes and taps alike (developer request
        // 2026-08-26). Rule 5: instant under reduced motion.
        animation: isReduceMotionEnabled() ? 'none' : 'shift',
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
          // A visible tab only on the computer's SIDE RAIL (developer
          // request 2026-08-18) - phones AND narrow web keep four tabs
          // (a 390pt browser was showing five, caught 2026-08-25) and
          // reach this from Settings > Help > What's new (href null hides
          // the button but the route stays navigable).
          href: sideNav ? '/updates' : null,
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
