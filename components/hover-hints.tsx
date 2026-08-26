// Native no-op. Hover doesn't exist on touch; the same strings this feature
// surfaces on the web already serve VoiceOver/TalkBack via
// accessibilityLabel. See hover-hints.web.tsx for the real one.
export function HoverHints() {
  return null;
}
