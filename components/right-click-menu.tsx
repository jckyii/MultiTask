// Native passthrough. Right-click doesn't exist on touch - long-press
// (plus the VoiceOver delete action) already covers deletion there. The
// real implementation is right-click-menu.web.tsx.
import type { PropsWithChildren } from 'react';

export type RightClickItem = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export function RightClickMenu({ children }: PropsWithChildren<{ items: RightClickItem[] }>) {
  return <>{children}</>;
}
