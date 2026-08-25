// The tour overlay (v4 — developer feedback 2026-08-11). THREE instances
// render the same shared tour state (index lives in TourContext): the root
// layout ('tabs'), the quick-add sheet ('quick-add'), and the day page
// ('day') — native modal screens paint above any root-level sibling, so the
// card was invisible/underneath while the sheet was open (the phone bug).
// Exactly one instance is live at a time: the one whose host matches the
// current pathname AND the current step's host.
//
// Action steps GATE the app: with `dim`, everything except the ringed
// target is darkened and blocked (root is box-none, panes eat touches, the
// hole passes them) — the user completes the instructed action or presses
// "Skip step". The ring RE-MEASURES continuously (350ms) so scrolling can't
// strand it (the "outline gets messed up when I scroll" bug).
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keyboard, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutRectangle } from 'react-native';

import { useTour } from '@/components/tour/tour-context';
import { onTourEvent } from '@/lib/tour/events';
import { TOUR_STEPS, type TourHost } from '@/lib/tour/steps';
import { useTheme } from '@/lib/theme/use-theme';

const PAD = 8;
const DIM_SPOTLIGHT = 'rgba(0,0,0,0.72)';
const DIM_ACTION = 'rgba(0,0,0,0.55)';
const SEEN_KEY = 'tour.seen';
const TAB_PATHS = ['/', '/daily', '/calendar', '/settings'];

function hostForPath(pathname: string): TourHost {
  if (pathname === '/quick-add') return 'quick-add';
  if (pathname.startsWith('/day')) return 'day';
  return 'tabs';
}

export function TourOverlay({ host = 'tabs' }: { host?: TourHost }) {
  const { active, stop, index, setIndex, measureAnchor, anchorVersion, setRingColor } = useTour();
  const { colors, space, radius, type, monoFont } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [rect, setRect] = useState<LayoutRectangle | null>(null);
  const [selfRing, setSelfRing] = useState(false);
  // Keyboard-aware card: never hide behind the keyboard (developer report
  // 2026-08-14: the step card vanished while typing the title).
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const step = TOUR_STEPS[index];
  useEffect(() => setRingColor(colors.accent), [colors.accent, setRingColor]);

  // This instance is live only when BOTH the route and the step belong to
  // it — otherwise its effects stay quiet so nothing runs twice.
  const live = active && !!step && hostForPath(pathname) === host && step.host === host;

  const finish = useCallback(() => {
    stop();
    void AsyncStorage.setItem(SEEN_KEY, 'true');
  }, [stop]);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0) return;
      if (nextIndex >= TOUR_STEPS.length) {
        finish();
        return;
      }
      Keyboard.dismiss();
      setRect(null);
      setIndex(nextIndex);
    },
    [finish, setIndex]
  );

  // Tab placement — only the tabs instance navigates, and only FROM a tab
  // (never while a modal is open/closing — the v3 freeze fix).
  useEffect(() => {
    if (!active || host !== 'tabs' || !step?.tab) return;
    if (step.host !== 'tabs') return;
    if (pathname !== step.tab && TAB_PATHS.includes(pathname)) {
      router.navigate(step.tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, pathname]);

  // Route-based advancing. The instance that OWNS the new route fires (the
  // route being left may unmount its own instance mid-pop, so gating on the
  // step's host would drop the advance).
  useEffect(() => {
    if (!active || !step || hostForPath(pathname) !== host) return;
    if (step.advanceOnPath && pathname === step.advanceOnPath) goTo(index + 1);
    else if (step.advanceOnPathPrefix && pathname.startsWith(step.advanceOnPathPrefix)) goTo(index + 1);
  }, [active, step, host, pathname, index, goTo]);

  // Recovery: the user bailed out of the surface a step lives on (closed
  // the sheet mid-form, left the day page early). The tabs instance walks
  // the tour to a step that makes sense from a tab — back to "tap +" for
  // form steps, forward to the next tab step after the day pair. Debounced
  // so route transitions can't trigger it.
  useEffect(() => {
    if (!active || !step || host !== 'tabs') return;
    if (step.host === 'tabs' || hostForPath(pathname) !== 'tabs') return;
    const timer = setTimeout(() => {
      if (step.host === 'quick-add') {
        goTo(TOUR_STEPS.findIndex((s) => s.id === 'add'));
      } else {
        let next = index + 1;
        while (next < TOUR_STEPS.length && TOUR_STEPS[next].host !== 'tabs') next += 1;
        goTo(next);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [active, step, host, pathname, index, goTo]);

  // Continuous anchor measurement while live — follows scrolling.
  useEffect(() => {
    if (!live || !step.anchor) {
      setRect(null);
      return;
    }
    let cancelled = false;
    const loop = async () => {
      // Let entrance animations settle before the first ring.
      await new Promise((r) => setTimeout(r, 350));
      while (!cancelled) {
        const result = await measureAnchor(step.anchor as string);
        if (cancelled) return;
        const measured = result?.rect ?? null;
        if (result) setSelfRing(result.selfRing);
        setRect((prev) => {
          if (!measured) return prev;
          if (
            prev &&
            Math.abs(prev.x - measured.x) < 1 &&
            Math.abs(prev.y - measured.y) < 1 &&
            Math.abs(prev.width - measured.width) < 1 &&
            Math.abs(prev.height - measured.height) < 1
          ) {
            return prev;
          }
          return measured;
        });
        await new Promise((r) => setTimeout(r, 33));
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, index, anchorVersion]);

  // Event-based advancing — only the live instance listens.
  useEffect(() => {
    if (!live || (!step.advanceOn && !step.advanceOnAny)) return;
    return onTourEvent((event) => {
      if (event === step.advanceOn || step.advanceOnAny?.includes(event)) goTo(index + 1);
    });
  }, [live, step, index, goTo]);

  if (!live) return null;

  const isAction = step.kind === 'action';
  const counter = `${index + 1} / ${TOUR_STEPS.length}`;
  const body = Platform.OS === 'web' ? (step.webBody ?? step.body) : step.body;
  const primaryLabel =
    index === TOUR_STEPS.length - 1 ? 'Done' : isAction ? 'Skip step' : 'Next';

  // Phones get a tighter card - the s4 version ate too much of the screen
  // (developer report 2026-08-17). The counter shares the title row instead
  // of its own line; web keeps the roomier layout.
  const compact = Platform.OS !== 'web';
  const card = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
          borderRadius: radius.card,
          padding: compact ? space.s3 : space.s4,
          gap: compact ? space.s1 : space.s2,
        },
      ]}>
      <View style={styles.titleRow}>
        <Text style={[type.h2, { color: colors.textPrimary, flexShrink: 1 }]}>{step.title}</Text>
        <Text style={{ fontFamily: monoFont, fontSize: 11, color: colors.textTertiary }}>{counter}</Text>
      </View>
      <Text style={[type.body, { color: colors.textSecondary }]}>{body}</Text>
      <View style={styles.buttonRow}>
        <Pressable onPress={finish} hitSlop={8} accessibilityRole="button">
          <Text style={[type.body, { color: colors.textTertiary }]}>End tour</Text>
        </Pressable>
        <View style={styles.rightButtons}>
          {index > 0 && (
            <Pressable
              onPress={() => goTo(index - 1)}
              hitSlop={8}
              accessibilityRole="button"
              style={[styles.navButton, { borderColor: colors.borderSubtle, borderRadius: radius.button }]}>
              <Text style={[type.body, { color: colors.textSecondary, fontWeight: '600' }]}>Back</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => goTo(index + 1)}
            hitSlop={8}
            accessibilityRole="button"
            style={[styles.navButton, { backgroundColor: colors.accent, borderRadius: radius.button }]}>
            <Text style={[type.body, { color: colors.textOnAccent, fontWeight: '600' }]}>
              {primaryLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const ring = rect && !selfRing ? (
    <View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: rect.x - PAD,
          top: rect.y - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderColor: colors.accent,
          borderRadius: radius.card,
        },
      ]}
    />
  ) : null;

  // Action-step panes are VISUAL ONLY (pointerEvents none): the target may
  // sit below the fold, so the user must be able to scroll to it — the dim
  // guides, the ring points, and only the right action advances (developer
  // feedback 2026-08-14). Spotlight panes still block (Next-driven).
  const panes = (dimColor: string, blocking: boolean) =>
    rect ? (
      <>
        <View pointerEvents={blocking ? 'auto' : 'none'} style={[styles.dim, { backgroundColor: dimColor, left: 0, right: 0, top: 0, height: Math.max(0, rect.y - PAD) }]} />
        <View pointerEvents={blocking ? 'auto' : 'none'} style={[styles.dim, { backgroundColor: dimColor, left: 0, right: 0, top: rect.y + rect.height + PAD, bottom: 0 }]} />
        <View pointerEvents={blocking ? 'auto' : 'none'} style={[styles.dim, { backgroundColor: dimColor, left: 0, width: Math.max(0, rect.x - PAD), top: rect.y - PAD, height: rect.height + PAD * 2 }]} />
        <View pointerEvents={blocking ? 'auto' : 'none'} style={[styles.dim, { backgroundColor: dimColor, left: rect.x + rect.width + PAD, right: 0, top: rect.y - PAD, height: rect.height + PAD * 2 }]} />
      </>
    ) : null;

  const usableHeight = windowHeight - keyboardHeight;
  const placeTop = step.cardPin
    ? step.cardPin === 'top'
    : rect
      ? rect.y + rect.height / 2 > usableHeight / 2
      : step.placement === 'top';
  const bottomOffset = keyboardHeight > 0 ? keyboardHeight + 12 : 96;
  // Wide web, quick-add steps: the sheet is a centered 560pt dialog, so the
  // card sits just to its RIGHT with a small gap — NEXT TO the sheet, not
  // parked at the window edge (developer round 4, 2026-08-25) — but only
  // when the gutter is actually wide enough to hold a readable card.
  const sheetRightEdge = windowWidth / 2 + 280;
  const asideWidth = Math.min(420, windowWidth - sheetRightEdge - 24 - 16);
  const wideAside = Platform.OS === 'web' && host === 'quick-add' && asideWidth >= 280;
  const holder = (
    <View
      pointerEvents="box-none"
      style={
        wideAside
          ? // Own style, NOT an override of cardHolder: `left: undefined` in
            // a later array entry does not clear the base left:16, and
            // left+width beats right (the card silently stayed left).
            [styles.cardHolderAside, { left: sheetRightEdge + 24, width: asideWidth }]
          : [styles.cardHolder, placeTop ? styles.holderTop : { bottom: bottomOffset }]
      }>
      {card}
    </View>
  );

  if (isAction) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.overlayRoot]} pointerEvents="box-none">
        {step.dim ? panes(DIM_ACTION, false) : null}
        {ring}
        {holder}
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlayRoot]} pointerEvents="box-none">
      {rect ? (
        <>
          {panes(DIM_SPOTLIGHT, true)}
          {ring}
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.dim, { backgroundColor: DIM_SPOTLIGHT }]} />
      )}
      {holder}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: { zIndex: 10000, elevation: 10000 },
  dim: { position: 'absolute' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  card: {
    borderWidth: 1,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  cardHolder: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  cardHolderAside: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  holderTop: { top: 64 },
  holderBottom: { bottom: 96 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rightButtons: { flexDirection: 'row', gap: 10 },
  navButton: {
    minHeight: 40,
    minWidth: 76,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
