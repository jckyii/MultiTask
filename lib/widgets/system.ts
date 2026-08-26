// The widget data bridge — the ONLY file that touches @bacons/apple-targets'
// ExtensionStorage (App Group UserDefaults). Same soft-fail gateway pattern
// as lib/sync/system.ts: dynamic import + try/catch, so the currently
// installed build (whose binary lacks the native module) just reports false
// and the app runs on. iOS-only by nature.
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/sync/system';

export const APP_GROUP = 'group.com.abuljean.multitask';
const SNAPSHOT_KEY = 'widget.snapshot';
const PENDING_KEY = 'widget.pendingCompletions';

export async function writeWidgetSnapshot(payload: unknown): Promise<boolean> {
  if (Platform.OS !== 'ios' || isExpoGo) return false;
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(APP_GROUP);
    storage.set(SNAPSHOT_KEY, JSON.stringify(payload));
    ExtensionStorage.reloadWidget();
    return true;
  } catch {
    return false;
  }
}

export type PendingToggle = { id: number; done: boolean };

/** Check-off toggles the widget queued while the app was away — each carries
 *  the DESIRED state (done true/false) so the widget can both complete and
 *  un-complete. Read-and-clear; the caller runs them through the normal
 *  mutation path. Tolerates the legacy plain-number format (= complete). */
export async function drainPendingToggles(): Promise<PendingToggle[]> {
  if (Platform.OS !== 'ios' || isExpoGo) return [];
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(APP_GROUP);
    const raw = await Promise.resolve(storage.get(PENDING_KEY) as unknown);
    storage.remove(PENDING_KEY);
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list
      .map((v): PendingToggle | null => {
        if (typeof v === 'number' && Number.isInteger(v) && v > 0) return { id: v, done: true };
        if (v && typeof v === 'object' && Number.isInteger((v as PendingToggle).id)) {
          return { id: (v as PendingToggle).id, done: Boolean((v as PendingToggle).done) };
        }
        return null;
      })
      .filter((v): v is PendingToggle => v !== null && v.id > 0);
  } catch {
    return [];
  }
}
