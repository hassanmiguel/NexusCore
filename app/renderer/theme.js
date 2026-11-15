export const THEMES = [
  { id: "crimson", label: "Crimson", rgb: "255 27 61" },
  { id: "blood-orange", label: "Blood Orange", rgb: "255 96 40" },
  { id: "venom-green", label: "Venom Green", rgb: "57 255 120" },
  { id: "toxic-purple", label: "Toxic Purple", rgb: "178 78 255" },
  { id: "cyber-cyan", label: "Cyber Cyan", rgb: "0 229 255" }
];

export function isValidTheme(value) {
  return THEMES.some(theme => theme.id === value);
}

export function themeRgb(id, fallback = "255 27 61") {
  const theme = THEMES.find(item => item.id === id);
  return theme ? theme.rgb : fallback;
}

export const DEFAULT_FONT_SIZE = 1;