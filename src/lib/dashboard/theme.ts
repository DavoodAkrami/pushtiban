import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// The three appearance choices, declared once. Three surfaces offer them — the
// sidebar's account menu, the top bar's, and the command palette — and a copy
// per surface is how the labels drift apart.
// ---------------------------------------------------------------------------

export type ThemeOption = {
  value: "light" | "dark" | "system";
  label: string;
  icon: LucideIcon;
};

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: "light", label: "روشن", icon: Sun },
  { value: "dark", label: "تاریک", icon: Moon },
  { value: "system", label: "سیستم", icon: Monitor },
];
