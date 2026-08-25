// Measured-height collapsible: children render at natural size (absolutely,
// clipped) and the container's height animates between 0 and that size —
// a plain slide, no bounce. Shared by the task form's Details section and
// the search bar's filter panel.
import { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const SLIDE = { duration: 220, easing: Easing.inOut(Easing.cubic) } as const;

export function CollapsibleReveal({ open, children }: PropsWithChildren<{ open: boolean }>) {
  const contentHeight = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, SLIDE);
  }, [open, progress]);

  const style = useAnimatedStyle(() => ({
    height: contentHeight.value * progress.value,
    opacity: progress.value,
    // Clip only while animating. At rest-open the clip box was the
    // "invisible border" chopping the tour rings inside the Details section
    // (developer round 5, 2026-08-25) — fully open there is nothing to clip,
    // so let the rings breathe.
    overflow: progress.value >= 1 ? 'visible' : 'hidden',
  }));

  return (
    <Animated.View style={style}>
      <View
        style={styles.inner}
        // Collapsed content stays MOUNTED (the height just animates to 0),
        // so without these, screen-reader focus could land on invisible
        // chips/inputs inside a closed section.
        aria-hidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        onLayout={(e) => {
          contentHeight.value = e.nativeEvent.layout.height;
        }}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
