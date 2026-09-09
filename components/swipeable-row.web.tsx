// WEB/DESKTOP variant of the swipe engine (docs/design/08): hover replaces
// swipe. Hovering the LEFT edge of a row slides it right, revealing the
// complete/restore action; hovering the RIGHT edge slides it left,
// revealing delete. CLICKING the revealed edge commits the action — same
// semantics, undo toasts, and trail visuals as the touch version. Entrance
// and cascade-exit animations match the tuned native values.
import { useEffect, useRef, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/lib/theme/use-theme';

const REVEAL_PX = 88; // how far the row slides aside on hover
const ENTER_DURATION_MS = 647.2; // FINAL tuned value (docs/design/05)

/** Raw DOM mouse events, bypassing RNW's Pressable hover system — which
 *  fails to deliver hover to a pressable that CONTAINS other pressables
 *  (the edge zones + card claimed it; the outer wrapper never hovered on a
 *  real mouse). RNW forwards onMouseEnter/onMouseLeave to the DOM node but
 *  RN's types don't know them, hence the cast. */
function mouseHover(onEnter: () => void, onLeave: () => void) {
  return { onMouseEnter: onEnter, onMouseLeave: onLeave } as Record<string, unknown>;
}

type IconName = ComponentProps<typeof IconSymbol>['name'];

export type SwipeAction = {
  color: string;
  icon: IconName;
};

type Props = PropsWithChildren<{
  rightAction: SwipeAction;
  /** Omit both left props to disable the delete side entirely — no right
   *  edge zone renders (recurring rows since 2026-09-09: removal moved to
   *  the right-click menu on desktop). */
  leftAction?: SwipeAction;
  onSwipeRight: () => void;
  onSwipeLeft?: () => void;
  resetKey: string | number;
  enterFrom?: 'left' | 'right' | null;
  onEntered?: () => void;
  exit?: { to: 'left' | 'right'; delayMs: number } | null;
  /** Hover aura: a glow ring in the row's own color (task status accent,
   *  recurring rows use the theme accent) that fades in with the hover. */
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
  hoverAuraColor,
  hoverAuraRadius,
  children,
}: Props) {
  const { colors, radius } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  // Whole-row hover feedback: a gentle scale so EVERY card visibly
  // acknowledges the pointer (the edge zones alone were undiscoverable —
  // developer feedback 2026-07-11). Calm ceiling: 1.5%, no shadow chase.
  const rowHover = useSharedValue(0);
  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null);
  // While a commit's slide-off runs, the hover-reset effect must NOT touch
  // translateX — it was overriding the exit with a 180ms slide back to 0,
  // which read as "instant disappearance" on every real click (a real
  // pointer is always hovering the zone it clicks; programmatic test
  // clicks weren't, which is how this shipped broken).
  const committing = useRef(false);
  const commitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A commit scheduled right before unmount/recycle must not fire against a
  // stale row.
  useEffect(() => {
    return () => {
      if (commitTimeout.current) clearTimeout(commitTimeout.current);
    };
  }, []);

  // Hover slides the row aside; leaving slides it back. Also frozen during a
  // programmatic `exit` (bulk-clear cascade) — a hover change mid-cascade
  // would replace the slide-off with a timing back to rest.
  useEffect(() => {
    if (committing.current || exit) return;
    const target = hoverSide === 'left' ? REVEAL_PX : hoverSide === 'right' ? -REVEAL_PX : 0;
    translateX.value = withTiming(target, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [exit, hoverSide, translateX]);

  // Reset when the row's logical state changes.
  useEffect(() => {
    committing.current = false;
    translateX.value = 0;
    setHoverSide(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Entrance: same glide-in-and-stop as native.
  useEffect(() => {
    if (enterFrom) {
      translateX.value = (enterFrom === 'left' ? -1 : 1) * screenWidth * 0.6;
      translateX.value = withTiming(0, { duration: ENTER_DURATION_MS, easing: Easing.out(Easing.cubic) });
      onEntered?.();
    }
  }, [enterFrom, screenWidth, translateX, onEntered]);

  // Programmatic exit (bulk clear cascade).
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

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: 1 + rowHover.value * 0.015 }],
  }));
  const rightTrailStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 4 ? 1 : 0,
  }));
  const leftTrailStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -4 ? 1 : 0,
  }));
  // The aura only shows for a RESTING hover — once the row starts sliding
  // toward an action, the trail is the signal and the ring gets out of
  // the way.
  const auraStyle = useAnimatedStyle(() => ({
    opacity: rowHover.value * (Math.abs(translateX.value) < 4 ? 1 : 0),
  }));

  function commit(side: 'left' | 'right') {
    // Re-entry guard: the edge zones stay clickable during the 250ms exit
    // window, so a double-click would fire the mutation (and its toast)
    // twice without this.
    if (committing.current) return;
    committing.current = true;
    setHoverSide(null);
    // Slide off in the action's direction, THEN fire — the handler's
    // optimistic cache update unmounts the row instantly, so firing it
    // immediately skipped the exit animation entirely (the bug the
    // developer caught 2026-07-11). Timing mirrors the touch slide-off.
    const direction = side === 'left' ? 1 : -1;
    translateX.value = withTiming(
      direction * screenWidth,
      { duration: 240, easing: Easing.out(Easing.cubic) },
      () => {}
    );
    if (commitTimeout.current) clearTimeout(commitTimeout.current);
    commitTimeout.current = setTimeout(() => {
      if (side === 'left') onSwipeRight();
      else onSwipeLeft?.();
    }, 250);
  }

  return (
    <View
      {...mouseHover(
        () => {
          rowHover.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
        },
        () => {
          rowHover.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
          setHoverSide(null);
        }
      )}>
      <Animated.View
        style={[styles.trail, { backgroundColor: rightAction.color, borderRadius: radius.card }, rightTrailStyle]}>
        <View style={styles.trailIconLeft}>
          <IconSymbol name={rightAction.icon} size={22} color={colors.textOnAccent} />
        </View>
      </Animated.View>
      {leftAction && (
        <Animated.View
          style={[styles.trail, { backgroundColor: leftAction.color, borderRadius: radius.card }, leftTrailStyle]}>
          <View style={styles.trailIconRight}>
            <IconSymbol name={leftAction.icon} size={22} color={colors.textOnAccent} />
          </View>
        </Animated.View>
      )}

      <Animated.View style={contentStyle}>
        {children}
        {hoverAuraColor && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.hoverRing,
              {
                // A light fade of a glow (developer feedback: full-strength
                // was too heavy) — translucent ring, soft wide shadow.
                borderColor: `${hoverAuraColor}66`,
                borderRadius: (hoverAuraRadius ?? radius.card) + 2,
                boxShadow: `0 0 14px ${hoverAuraColor}2E`,
              },
              auraStyle,
            ]}
          />
        )}
      </Animated.View>

      {/* Invisible hover/click zones on the row's edges. */}
      <Pressable
        style={[styles.edgeZone, styles.edgeLeft]}
        {...mouseHover(
          () => setHoverSide('left'),
          () => setHoverSide(null)
        )}
        onPress={() => commit('left')}
        accessibilityLabel="Complete or restore"
      />
      {onSwipeLeft != null && (
        <Pressable
          style={[styles.edgeZone, styles.edgeRight]}
          {...mouseHover(
            () => setHoverSide('right'),
            () => setHoverSide(null)
          )}
          onPress={() => commit('right')}
          accessibilityLabel="Delete"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trail: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  trailIconLeft: {
    position: 'absolute',
    left: 24,
  },
  trailIconRight: {
    position: 'absolute',
    right: 24,
  },
  edgeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // Generous on desktop (developer feedback): the reveal should trigger
    // well before the pointer reaches the card's edge.
    width: 120,
    zIndex: 10,
  },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },
  hoverRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderWidth: 1.5,
  },
});
