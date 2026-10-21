// Couleur d'accent d'une entreprise : variantes clair/sombre et garde-fou de contraste AA.
// Utilisé au build Nix (vérification) et par nova-daemon (theme.css servi à l'interface).

const BG = { light: "#FFFFFF", dark: "#111113" };
const ON = { light: "#FFFFFF", dark: "#111113" };
export const MIN_CONTRAST = 4.5;

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Couleur invalide : « ${hex} ». Format attendu : #RRGGBB.`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Mélange vers une cible (blanc pour éclaircir, noir pour foncer).
const mix = (hex, target, t) => {
  const a = hexToRgb(hex), b = hexToRgb(target);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
};

// Plus petit ajustement qui atteint le contraste voulu face au fond et au texte posé dessus.
const fit = (hex, mode) => {
  const toward = mode === "light" ? "#000000" : "#FFFFFF";
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = mix(hex, toward, t);
    if (contrast(c, BG[mode]) >= MIN_CONTRAST && contrast(c, ON[mode]) >= MIN_CONTRAST) return c;
  }
  return null;
};

export function accentPalette(hex) {
  const base = rgbToHex(hexToRgb(hex));
  const okLight = contrast(base, BG.light) >= MIN_CONTRAST && contrast(base, ON.light) >= MIN_CONTRAST;
  const dark = fit(base, "dark");
  return {
    ok: okLight && dark !== null,
    light: base,
    dark,
    onLight: ON.light,
    onDark: ON.dark,
    contrastLight: Math.round(contrast(base, BG.light) * 100) / 100,
    suggestion: okLight ? null : fit(base, "light"),
  };
}

export function accentCss(hex) {
  const p = accentPalette(hex);
  return `:root{--accent:${p.light};--on-accent:${p.onLight}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--accent:${p.dark};--on-accent:${p.onDark}}}
:root[data-theme="dark"]{--accent:${p.dark};--on-accent:${p.onDark}}
`;
}
