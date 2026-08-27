// Finger-tracking swipe between tabs (developer request 2026-08-26: the
// day-view feel — "follows how far you swipe" — not a fire-and-forget
// animation). Same physics as hooks/use-page-slide: content rides the
// finger 1:1, releasing past ~40% of the screen or with a flick commits,
// anything less springs back; on commit the old page exits fully and the
// new one enters from the opposite edge.
//
// Mechanics: ONE shared translateX lives here. The layout's pan writes it;
// every tab screen wraps its content in <TabPage>, which applies it. Only
// the focused screen is visible, so the shared value always moves exactly
// one page: the outgoing one before the navigate, the incoming one after.
// The tab bar stays put because screens consume the offset, not the
// navigator. NATIVE ONLY — web keeps the plain pan + 'shift' (its layouts
// are verified around untransformed scrollables).
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { isReduceMotionEnabled } from '@/lib/reduced-motion';

const TabPagerContext = createContext<{ dragX: SharedValue<number> } | null>(null);

export function useTabPagerGesture({
  hasPrev,
  hasNext,
  onCommit,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  /** Apply the tab change for one page in `dir` (+1 = forward/left travel). */
  onCommit: (dir: 1 | -1) => void;
}) {
  const { width } = useWindowDimensions();
  const dragX = useSharedValue(0);

  function commit(dir: 1 | -1) {
    if (isReduceMotionEnabled()) {
      dragX.value = 0;
      onCommit(dir);
      return;
    }
    const remaining = Math.abs(-dir * width - dragX.value);
    const outMs = Math.max(60, Math.min(140, (remaining / width) * 140));
    dragX.value = withTiming(-dir * width, { duration: outMs, easing: Easing.out(Easing.cubic) });
    // Swap on a TIMER (use-page-slide lesson): a janked frame shortens the
    // motion instead of blocking navigation.
    setTimeout(() => {
      onCommit(dir);
      dragX.value = dir * width;
      dragX.value = withTiming(0, { duration: 210, easing: Easing.out(Easing.cubic) });
    }, outMs + 5);
  }

  // Recreated per render so hasPrev/hasNext stay current with the pathname.
  const pan = Gesture.Pan()
    // Late activation (48 vs the cards'/inner pagers' 16): anything that
    // owns a horizontal gesture claims first; free surface pages.
    .activeOffsetX([-48, 48])
    .failOffsetY([-16, 16])
    .onUpdate((event) => {
      const tx = event.translationX;
      // Rubber-band at the ends: a quarter of the drag past the last tab.
      const blocked = (tx > 0 && !hasPrev) || (tx < 0 && !hasNext);
      dragX.value = blocked ? tx * 0.25 : tx;
    })
    .onEnd((event) => {
      const dir: 1 | -1 = event.translationX < 0 ? 1 : -1;
      const allowed = dir === 1 ? hasNext : hasPrev;
      // 30% (vs the day view's 40): tab hops are frequent, so commit a bit
      // easier (developer request 2026-08-26).
      const past = Math.abs(event.translationX) > width * 0.3;
      const flick = Math.abs(event.velocityX) > 800 && Math.abs(event.translationX) > 30;
      if (allowed && (past || flick)) {
        runOnJS(commit)(dir);
      } else {
        dragX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  return { pan, dragX };
}

export function TabPagerProvider({ dragX, children }: PropsWithChildren<{ dragX: SharedValue<number> }>) {
  const value = useMemo(() => ({ dragX }), [dragX]);
  return <TabPagerContext.Provider value={value}>{children}</TabPagerContext.Provider>;
}

/** Wrap a tab screen's content so it rides the shared drag. No-op on web
 *  and outside the provider (day pages, modals). */
export function TabPage({ children }: PropsWithChildren) {
  const ctx = useContext(TabPagerContext);
  const style = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateX: ctx ? ctx.dragX.value : 0 }],
  }));
  if (Platform.OS === 'web' || !ctx) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }
  return <Animated.View style={style}>{children}</Animated.View>;
}
