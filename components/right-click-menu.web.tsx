// Desktop context menu (developer request 2026-08-27): right-click a
// lifestyle or subject and "normal clicker options come up" - a small
// themed menu at the cursor with the delete action. Web-only; the native
// file passes children through (long-press covers touch).
//
// Mechanics: a real <div> wrapper (display:contents keeps layout
// untouched) catches contextmenu, and the menu renders through a PORTAL to
// document.body so no ScrollView/collapsible clip box can cut it off (the
// tour-ring lesson). Click-away, Escape, scroll, or picking an item closes.
import { useEffect, useState, type PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';

import { useTheme } from '@/lib/theme/use-theme';

export type RightClickItem = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export function RightClickMenu({ items, children }: PropsWithChildren<{ items: RightClickItem[] }>) {
  const { colors } = useTheme();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Delay so the opening right-click's own mousedown doesn't insta-close.
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close, true);
      document.addEventListener('scroll', close, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [at]);

  const menu =
    at &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          left: Math.min(at.x, window.innerWidth - 200),
          top: Math.min(at.y, window.innerHeight - 16 - items.length * 40),
          zIndex: 99999,
          minWidth: 180,
          background: colors.surfaceElevated,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          padding: 4,
          overflow: 'hidden',
        }}>
        {items.map((item) => (
          <div
            key={item.label}
            role="menuitem"
            onMouseDown={(e) => {
              // mousedown, not click: the document capture listener closes
              // on mousedown, so click would never arrive.
              e.stopPropagation();
              setAt(null);
              item.onPress();
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = colors.surfaceSunken;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
            style={{
              padding: '10px 14px',
              borderRadius: 7,
              cursor: 'pointer',
              font: '500 14px -apple-system, "Segoe UI", Roboto, sans-serif',
              color: item.destructive ? colors.statusOverdueAccent : colors.textPrimary,
              userSelect: 'none',
            }}>
            {item.label}
          </div>
        ))}
      </div>,
      document.body
    );

  return (
    <div
      style={{ display: 'contents' }}
      onContextMenu={(e) => {
        if (!items.length) return;
        e.preventDefault();
        e.stopPropagation();
        setAt({ x: e.clientX, y: e.clientY });
      }}>
      {children}
      {menu}
    </div>
  );
}
