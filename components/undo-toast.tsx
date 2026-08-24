// Undo toast (docs/design/02): every destructive action shows one for 5
// seconds. Bottom of screen above the tab bar, surface-elevated with a real
// shadow (toasts ARE elevated), radius.card. Copy is factual — "Task
// deleted." — never apologetic. One provider at the root; screens call
// useUndoToast().show(...).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { useTheme } from '@/lib/theme/use-theme';

const TOAST_DURATION_MS = 5000;

type ToastContent = {
  message: string;
  onUndo?: () => void;
  /** 'edge' hugs the bottom of the screen - for toasts that outlive the tab
   *  bar (account deleted lands on the sign-in screen, where the default
   *  above-bar offset floated mid-air; developer report 2026-08-18). */
  placement?: 'above-bar' | 'edge';
};

const UndoToastContext = createContext<{ show: (content: ToastContent) => void }>({
  show: () => {},
});

export function useUndoToast() {
  return useContext(UndoToastContext);
}

export function UndoToastProvider({ children }: PropsWithChildren) {
  const [content, setContent] = useState<ToastContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const show = useCallback(
    (next: ToastContent) => {
      clearTimer();
      setContent(next);
      // Screen readers can't see the toast — announce it (HIG audit fix).
      AccessibilityInfo.announceForAccessibility(
        next.onUndo ? `${next.message} Undo button available.` : next.message
      );
      timer.current = setTimeout(() => setContent(null), TOAST_DURATION_MS);
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <UndoToastContext.Provider value={{ show }}>
      {children}
      {content && (
        <Toast
          content={content}
          onDismiss={() => {
            clearTimer();
            setContent(null);
          }}
        />
      )}
    </UndoToastContext.Provider>
  );
}

function Toast({ content, onDismiss }: { content: ToastContent; onDismiss: () => void }) {
  const { colors, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(22).stiffness(260)}
      exiting={SlideOutDown.duration(260)}
      style={[
        styles.toast,
        {
          // Clears the tab bar AND the FAB (doc 02: toast sits ABOVE the
          // FAB). The FAB tops out at insets.bottom+24+56=80; below 96 the
          // toast covered its upper half for 5s after every swipe.
          // 'edge' placement hugs the screen bottom instead - for screens
          // with no tab bar (sign-in after account deletion).
          bottom: content.placement === 'edge' ? insets.bottom + 16 : insets.bottom + 96,
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
          borderRadius: radius.card,
          paddingHorizontal: space.s4,
          paddingVertical: space.s3,
        },
      ]}>
      <Text style={[type.body, styles.message, { color: colors.textPrimary }]} numberOfLines={1}>
        {content.message}
      </Text>
      {content.onUndo && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={12}
          onPress={() => {
            content.onUndo?.();
            onDismiss();
          }}>
          <Text style={[type.body, { color: colors.accent, fontWeight: '600' }]}>Undo</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    // Toasts are genuinely elevated, so they get a real shadow.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  message: {
    flex: 1,
  },
});
