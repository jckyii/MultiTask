// Desktop hover hints (developer request 2026-08-18): every control gets a
// small tag explaining what it does, because new users don't know what the
// tray icon or the sync dot means. ONE document-level listener instead of a
// wrapper on every call site: any focusable control carrying an aria-label
// (which RN Web renders from accessibilityLabel) gets a themed bubble, so
// the hints can never drift from the screen-reader strings and every future
// button inherits them automatically.
//
// Skipped on purpose:
// - controls whose visible text IS the label (the bubble would just repeat
//   the button), and
// - huge surfaces (backdrops, swipeable cards) where a bubble reads as
//   noise - the size guard below.
import { useEffect } from 'react';

import { useTheme } from '@/lib/theme/use-theme';

const SELECTOR = '[role="button"][aria-label], [role="link"][aria-label], a[aria-label], button[aria-label]';
const SHOW_DELAY_MS = 450;
const MAX_TARGET_W = 400;
const MAX_TARGET_H = 160;

export function HoverHints() {
  const { colors, monoFont } = useTheme();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let bubble: HTMLDivElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: Element | null = null;

    function hide() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      current = null;
      if (bubble) {
        bubble.remove();
        bubble = null;
      }
    }

    function show(target: Element, label: string) {
      hide();
      current = target;
      const rect = target.getBoundingClientRect();
      const el = document.createElement('div');
      el.textContent = label;
      Object.assign(el.style, {
        position: 'fixed',
        zIndex: '99999',
        maxWidth: '260px',
        padding: '6px 10px',
        borderRadius: '8px',
        border: `1px solid ${colors.borderSubtle}`,
        background: colors.surfaceElevated,
        color: colors.textPrimary,
        font: `500 12px/16px ${monoFont}, ui-monospace, monospace`,
        pointerEvents: 'none',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        left: '0px',
        top: '0px',
        visibility: 'hidden',
      } as CSSStyleDeclaration);
      document.body.appendChild(el);
      bubble = el;
      // Measure, then place: centered below the control, clamped to the
      // viewport, flipped above when there is no room underneath.
      const b = el.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - b.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - b.width - 8));
      let top = rect.bottom + 8;
      if (top + b.height > window.innerHeight - 8) top = rect.top - b.height - 8;
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
      el.style.visibility = 'visible';
    }

    function onOver(event: MouseEvent) {
      const target = (event.target as Element | null)?.closest?.(SELECTOR);
      if (!target) {
        hide();
        return;
      }
      if (target === current) return;
      const label = (target.getAttribute('aria-label') ?? '').trim();
      if (!label) {
        hide();
        return;
      }
      // Redundant bubble: the control already says exactly this.
      const visible = (target.textContent ?? '').trim();
      if (visible === label) {
        hide();
        return;
      }
      // Backdrops / whole cards: a tooltip on a huge surface is noise.
      const rect = target.getBoundingClientRect();
      if (rect.width > MAX_TARGET_W || rect.height > MAX_TARGET_H) {
        hide();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => show(target, label), SHOW_DELAY_MS);
    }

    // Any press or scroll means the user moved on - drop the hint.
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mousedown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mousedown', hide, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      hide();
    };
  }, [colors, monoFont]);

  return null;
}
