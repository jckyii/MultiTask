// Home-screen quick actions (long-press the app icon), behind the same
// soft-fail gateway pattern as lib/sync/system.ts and lib/device-calendar.
// IMPORTANT: expo-quick-actions calls requireNativeModule at module scope,
// so even a static JS import crashes a build whose binary lacks the native
// module — every touch, including the router wiring, stays behind dynamic
// import() here. The current installed build simply reports false and the
// app runs on.
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/sync/system';

let subscription: { remove: () => void } | null = null;

/** Register the "Quick add" action and route action presses (warm + cold
 *  start) through the supplied navigator. Returns availability. */
export async function initQuickActions(navigate: (href: string) => void): Promise<boolean> {
  // Expo Go lacks the native module, and dev's lazy module loading redboxes
  // on a throwing import even inside try/catch - never attempt it there.
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const QuickActions = await import('expo-quick-actions');

    // Runtime registration is ANDROID ONLY. iOS gets the action from the
    // static Info.plist config (app.json iosActions) — and on iOS static and
    // dynamic shortcuts are two separate lists shown TOGETHER, so setItems
    // here produced a duplicate "Quick add" (TestFlight, 2026-08-17). The
    // press listener below handles static items fine.
    if (Platform.OS === 'android') {
      await QuickActions.setItems([
        {
          id: 'quick-add',
          title: 'Quick add',
          params: { href: '/quick-add' },
        },
      ]);
    }

    const initialHref = QuickActions.initial?.params?.href;
    if (typeof initialHref === 'string') {
      // Cold start from the shortcut: let the router settle first.
      setTimeout(() => navigate(initialHref), 0);
    }

    subscription?.remove();
    subscription = QuickActions.addListener((action) => {
      const href = action?.params?.href;
      if (typeof href === 'string') navigate(href);
    });
    return true;
  } catch {
    return false;
  }
}

export function teardownQuickActions(): void {
  subscription?.remove();
  subscription = null;
}
