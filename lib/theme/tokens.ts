// Design tokens — the typed transcription of docs/design/03-layout-type-color.md.
// Everything visual derives from these scales. If a needed value isn't here,
// add it to the design doc first, then here. No ad-hoc values in components.

// ---------------------------------------------------------------------------
// Spacing scale — space.4 (16) is the workhorse.
// ---------------------------------------------------------------------------
export const space = {
  s0: 0,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
} as const;

// ---------------------------------------------------------------------------
// Radius scale — hierarchy comes from the CONTRAST between tight and card.
// ---------------------------------------------------------------------------
export const radius = {
  tight: 6, // input borders, small chips
  button: 10, // buttons, inputs, small controls
  card: 16, // task cards, sheets, modals
  pill: 999, // full round (pills, badges, dots)
} as const;

// ---------------------------------------------------------------------------
// Type scale — 5 sizes with defined roles. System font for UI (SF Pro / Roboto,
// free and native-feeling); JetBrains Mono for time chips and timestamps (the
// small identifying touch). Inter is deliberately NOT used.
// ---------------------------------------------------------------------------
export const type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

/** Font family for time chips / timestamps. Loaded in app/_layout.tsx. */
export const monoFont = 'JetBrainsMono_500Medium';

// ---------------------------------------------------------------------------
// Motion vocabulary (docs/design/05-motion.md) — used from the gestures slice
// onward. Springs for user-driven interaction, curves for autonomous moves.
// ---------------------------------------------------------------------------
export const motion = {
  instant: 100,
  quick: 180,
  standard: 260,
  emphasis: 360,
  deliberate: 500,
  spring: {
    snappy: { damping: 22, stiffness: 260 },
    gentle: { damping: 18, stiffness: 180 },
    bouncy: { damping: 12, stiffness: 200 }, // reserved for delight moments
  },
} as const;

// ---------------------------------------------------------------------------
// Color tokens — semantic names, resolved per theme. Components never see hex.
// The accent is a PLACEHOLDER (desaturated indigo) — swap it here once and
// everything inherits; see the design doc for vetted alternatives.
// ---------------------------------------------------------------------------
export type ThemeColors = {
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnAccent: string;
  borderSubtle: string;
  accent: string;
  accentMuted: string;
  statusOngoingBg: string;
  statusOngoingAccent: string;
  statusUrgentBg: string;
  statusUrgentAccent: string;
  statusOverdueBg: string;
  statusOverdueAccent: string;
  statusEventAccent: string;
};

export const lightColors: ThemeColors = {
  surface: '#FBFBFA', // warm off-white, NOT pure white
  surfaceElevated: '#FFFFFF',
  surfaceSunken: '#F4F3F0',
  textPrimary: '#1A1A1D',
  textSecondary: '#5C5A55',
  // Darkened from #8A857D (3.2:1) on 2026-07-10 — tertiary text appears at
  // caption sizes, which need 4.5:1 (HIG audit). Now ≈4.8:1 on surface.
  textTertiary: '#75706A',
  textOnAccent: '#FFFFFF',
  borderSubtle: '#E8E5DE',
  // Cleaner, brighter indigo (2026-07-21) — the old #3D4A7A was too dark and
  // desaturated on white ("mushy" filled buttons). White text = ~6.3:1, clear
  // of 4.5. Dark-mode accent is unchanged (already lightened + approved).
  accent: '#4954C7',
  accentMuted: 'rgba(73, 84, 199, 0.12)',
  // One saturation step up from the web-app originals (F0FDF4/FFF7ED/FEF2F2
  // — the 50-level tints): "too opaque, give it just a bit more colour" in
  // light mode (developer, TestFlight 2026-08-17). Same hue family, 100s.
  statusOngoingBg: '#DCFCE7',
  statusOngoingAccent: '#16A34A',
  statusUrgentBg: '#FFEDD5',
  statusUrgentAccent: '#EA580C',
  statusOverdueBg: '#FEE2E2',
  statusOverdueAccent: '#DC2626',
  statusEventAccent: '#2563EB',
};

export const darkColors: ThemeColors = {
  surface: '#16171A', // NOT pure black (halation)
  surfaceElevated: '#1E1F23', // elevation = lighter, never shadow, in dark
  surfaceSunken: '#0F1013',
  textPrimary: '#E8E6E1', // NOT pure white
  textSecondary: '#A6A29B',
  // Lightened from #7A756D (4.0:1) on 2026-07-10 for 4.5:1+ at caption sizes.
  textTertiary: '#8F8A82',
  textOnAccent: '#FFFFFF',
  borderSubtle: '#2A2B30',
  accent: '#7C8BC4', // lightened indigo, still desaturated
  accentMuted: 'rgba(124, 139, 196, 0.15)',
  statusOngoingBg: '#14261C', // re-designed for dark, not tinted
  statusOngoingAccent: '#4ADE80',
  statusUrgentBg: '#2E1D14',
  statusUrgentAccent: '#FB923C',
  statusOverdueBg: '#2E1518',
  statusOverdueAccent: '#F87171',
  statusEventAccent: '#60A5FA',
};

// Priority tier badges (1st / 2nd / 3rd) — matches the web app's tiers.
export const priorityTiers: Record<number, { label: string; light: string; dark: string }> = {
  1: { label: '1st', light: '#B91C1C', dark: '#F87171' },
  2: { label: '2nd', light: '#C2410C', dark: '#FB923C' },
  3: { label: '3rd', light: '#A16207', dark: '#FACC15' },
};
