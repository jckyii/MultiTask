// Siri/Control-Center request drains — the App Group queue the intents
// write (modules/multitask-native/ios/SiriIntents.swift + the widget
// target's Control). Same ExtensionStorage gateway as the widget queues.
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/sync/system';

const APP_GROUP = 'group.com.abuljean.multitask';
const PENDING_TASKS_KEY = 'siri.pendingTasks';
const OPEN_QUICK_ADD_KEY = 'siri.openQuickAdd';

export type SiriPendingTask = { title: string };

/** Tasks queued by "Add a task in Multitask" while the app was away.
 *  Read-and-clear; caller creates them through the normal mutation path. */
export async function drainSiriTasks(): Promise<SiriPendingTask[]> {
  if (Platform.OS !== 'ios' || isExpoGo) return [];
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(APP_GROUP);
    const raw = await Promise.resolve(storage.get(PENDING_TASKS_KEY) as unknown);
    storage.remove(PENDING_TASKS_KEY);
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return [];
    return list
      .map((v) => (v && typeof v === 'object' && typeof v.title === 'string' ? { title: v.title } : null))
      .filter((v): v is SiriPendingTask => v !== null && v.title.trim().length > 0);
  } catch {
    return [];
  }
}

/** True once if "Quick add" (Siri or Control Center) asked to open the sheet. */
export async function consumeQuickAddRequest(): Promise<boolean> {
  if (Platform.OS !== 'ios' || isExpoGo) return false;
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(APP_GROUP);
    const flag = await Promise.resolve(storage.get(OPEN_QUICK_ADD_KEY) as unknown);
    storage.remove(OPEN_QUICK_ADD_KEY);
    return flag === true || flag === 'true' || flag === 1;
  } catch {
    return false;
  }
}
