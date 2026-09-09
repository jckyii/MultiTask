// The generic Mail-style swipe engine (docs/design/04 + the FINAL tuned
// values in docs/design/05). Wraps any row content: task cards and recurring
// daily rows share this one implementation so the physics can never drift
// apart. The wrapper owns gesture, trails, thresholds, haptics, slide-off,
// and the entrance slide-in; what a swipe MEANS (colors, icons, actions) is
// the caller's business.
import * as Haptics from 'expo-haptics';
import { useEffect, type ComponentProps, type PropsWithChildren } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/lib/theme/use-theme';

// Golden-ratio threshold (developer's pick): 16.18% of screen width.
const THRESHOLD_FRACTION = 0.1618;

// High damping: the release snap-back settles fast with barely any sway.
const SETTLE_SPRING = { damping: 26, stiffness: 240 };

// Entrance (FINAL after the 2026-07-10 tuning session): glide in and stop
// dead — pure deceleration, no bounce. 647.2ms = 400 × φ.
const ENTER_DURATION_MS = 647.2;

// Trails reveal only once the row has actually moved — a resting or
// barely-wiggled row must never flash the action colors behind it.
const TRAIL_REVEAL_PX = 4;

type IconName = ComponentProps<typeof IconSymbol>['name'];

export type SwipeAction = {
  color: string;
  icon: IconName;
};

type Props = PropsWithChildren<{
  rightAction: SwipeAction;
  /** Omit both left props to disable the left swipe entirely: the row
   *  resists leftward drags and springs back (recurring rows since
   *  2026-09-09 — their removal moved to long-press / right-click). */
  leftAction?: SwipeAction;
  onSwipeRight: () => void;
  onSwipeLeft?: () => void;
  /** Changes whenever the row's logical state changes (e.g. completed flag)
   *  so a recycled cell resets its gesture position. */
  resetKey: string | number;
  enterFrom?: 'left' | 'right' | null;
  onEntered?: () => void;
  /** Programmatic exit (bulk clear / empty trash): the row slides off-screen
   *  exactly like a committed swipe, optionally delayed for a cascade. The
   *  caller runs the actual mutation after the animation window. */
  exit?: { to: 'left' | 'right'; delayMs: number } | null;
  /** Web/desktop hover aura (status-colored glow ring). Touch platforms
   *  ignore it — hover doesn't exist here. */
  hoverAuraColor?: string;
  hoverAuraRadius?: number;
}>;

export function SwipeableRow({
  rightAction,
  leftAction,
  onSwipeRight,
  onSwipeLeft,
  resetKey,
  enterFrom,
  onEntered,
  exit,
  children,
}: Props) {
  const { colors, radius } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const crossedDirection = useSharedValue(0); // -1 | 0 | 1, one haptic per crossing

  // Recycle guard — declared BEFORE the entrance effect so that, in the same
  // commit, the entrance wins.
  useEffect(() => {
    translateX.value = 0;
    crossedDirection.value = 0;
  }, [resetKey, translateX, crossedDirection]);

  // Entrance: slide in from the side the row left through.
  useEffect(() => {
    if (enterFrom) {
      translateX.value = (enterFrom === 'left' ? -1 : 1) * screenWidth * 0.6;
      translateX.value = withTiming(0, { duration: ENTER_DURATION_MS, easing: Easing.out(Easing.cubic) });
      onEntered?.();
    }
  }, [enterFrom, screenWidth, translateX, onEntered]);

  // Programmatic exit: same slide-off as a committed swipe (240ms ease-out),
  // staggerable for batch cascades.
  useEffect(() => {
    if (exit) {
      translateX.value = withDelay(
        exit.delayMs,
        withTiming((exit.to === 'left' ? -1 : 1) * screenWidth, {
          duration: 240,
          easing: Easing.out(Easing.cubic),
        })
      );
    }
  }, [exit, screenWidth, translateX]);

  function thresholdHaptic(direction: number) {
    Haptics.impactAsync(
      direction > 0 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );
  }

  function fire(direction: number) {
    if (direction > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSwipeRight();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSwipeLeft?.();
    }
  }

  const hasLeft = onSwipeLeft != null;
  const pan = Gesture.Pan()
    // Horizontal intent only — vertical scrolling must always win.
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      // No left action: leftward drags meet rubber-band resistance instead
      // of tracking 1:1, so the row itself teaches that nothing lives there.
      translateX.value =
        !hasLeft && event.translationX < 0 ? event.translationX * 0.18 : event.translationX;
      const threshold = screenWidth * THRESHOLD_FRACTION;
      const direction =
        event.translationX > threshold ? 1 : hasLeft && event.translationX < -threshold ? -1 : 0;
      if (direction !== crossedDirection.value) {
        crossedDirection.value = direction;
        if (direction !== 0) runOnJS(thresholdHaptic)(direction);
      }
    })
    .onEnd(() => {
      const threshold = screenWidth * THRESHOLD_FRACTION;
      if (Math.abs(translateX.value) > threshold && (hasLeft || translateX.value > 0)) {
        const direction = translateX.value > 0 ? 1 : -1;
        translateX.value = withTiming(
          direction * screenWidth,
          { duration: 240, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(fire)(direction);
          }
        );
      } else {
        translateX.value = withSpring(0, SETTLE_SPRING);
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rightTrailStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > TRAIL_REVEAL_PX ? 1 : 0,
  }));
  const rightIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, screenWidth * 0.1], [0, 1], 'clamp'),
    transform: [
      { scale: interpolate(translateX.value, [0, screenWidth * THRESHOLD_FRACTION], [0.85, 1], 'clamp') },
    ],
  }));

  const leftTrailStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -TRAIL_REVEAL_PX ? 1 : 0,
  }));
  const leftIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [0, screenWidth * 0.1], [0, 1], 'clamp'),
    transform: [
      { scale: interpolate(-translateX.value, [0, screenWidth * THRESHOLD_FRACTION], [0.85, 1], 'clamp') },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View
          style={[styles.trail, { backgroundColor: rightAction.color, borderRadius: radius.card }, rightTrailStyle]}>
          <Animated.View style={[styles.trailIconLeft, rightIconStyle]}>
            <IconSymbol name={rightAction.icon} size={22} color={colors.textOnAccent} />
          </Animated.View>
        </Animated.View>
        {leftAction && (
          <Animated.View
            style={[styles.trail, { backgroundColor: leftAction.color, borderRadius: radius.card }, leftTrailStyle]}>
            <Animated.View style={[styles.trailIconRight, leftIconStyle]}>
              <IconSymbol name={leftAction.icon} size={22} color={colors.textOnAccent} />
            </Animated.View>
          </Animated.View>
        )}
        <Animated.View style={contentStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  trail: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  trailIconLeft: {
    position: 'absolute',
    left: 20,
  },
  trailIconRight: {
    position: 'absolute',
    right: 20,
  },
});
