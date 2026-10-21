#!/usr/bin/env node
// Usage :
//   node design/build.mjs css <sortie.css>   Génère les variables CSS depuis tokens.json
//   node design/build.mjs check <#RRGGBB>    Vérifie qu'une couleur d'accent respecte le contraste AA
//   node design/build.mjs theme <#RRGGBB> <sortie.css>   Vérifie puis génère le thème de l'entreprise
import { readFileSync, writeFileSync } from "node:fs";
import { accentCss, accentPalette, MIN_CONTRAST } from "./accent.mjs";

const tokens = JSON.parse(readFileSync(new URL("./tokens.json", import.meta.url), "utf8"));
const v = (t) => t.$value;

function css() {
  const lines = [];
  for (const [k, t] of Object.entries(tokens.space)) lines.push(`--space-${k}:${v(t)}`);
  lines.push(`--measure:${v(tokens.measure)}`);
  lines.push(`--font-family:${v(tokens.font.family)}`);
  for (const name of ["display", "title", "body", "body-strong", "caption"]) {
    const f = tokens.font[name];
    lines.push(`--text-${name}:${v(f.weight)} ${v(f.size)}/${v(f.line)} var(--font-family)`);
  }
  lines.push(`--radius:${v(tokens.radius)}`, `--radius-tile:${v(tokens["radius-tile"])}`, `--radius-panel:${v(tokens["radius-panel"])}`, `--radius-full:${v(tokens["radius-full"])}`);
  lines.push(`--glass-blur:${v(tokens.glass.blur)}`);
  lines.push(`--shadow-1:${v(tokens.shadow["1"])}`, `--shadow-2:${v(tokens.shadow["2"])}`);
  lines.push(`--motion-fast:${v(tokens.motion.fast)}`, `--motion-base:${v(tokens.motion.base)}`, `--ease:${v(tokens.motion.ease)}`);
  const colors = (mode) =>
    [
      ...Object.entries(tokens.color[mode]).map(([k, t]) => `--${k}:${v(t)}`),
      ...Object.entries(tokens.glass[mode]).map(([k, t]) => `--glass-${k}:${v(t)}`),
      ...Object.entries(tokens.backdrop[mode]).map(([k, t]) => `--backdrop-${k}:${v(t)}`),
    ].join(";");
  return `/* Généré par design/build.mjs depuis design/tokens.json — ne pas modifier à la main. */
:root{${lines.join(";")};color-scheme:light dark;${colors("light")}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${colors("dark")}}}
:root[data-theme="dark"]{${colors("dark")}}
@media (prefers-reduced-motion:reduce){:root{--motion-fast:0ms;--motion-base:0ms}}
`;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "css" && arg) {
  writeFileSync(arg, css());
} else if ((cmd === "check" || cmd === "theme") && arg) {
  const p = accentPalette(arg);
  if (!p.ok) {
    console.error(`La couleur d'accent ${p.light} n'est pas assez contrastée (${p.contrastLight}:1, minimum ${MIN_CONTRAST}:1).`);
    if (p.suggestion) console.error(`Proposition : ${p.suggestion}, la même teinte en plus foncé. À mettre dans nova.brand.accent.`);
    process.exit(1);
  }
  if (cmd === "theme") writeFileSync(process.argv[4] ?? "/dev/stdout", accentCss(arg));
  else console.log(`Accent ${p.light} conforme AA (clair ${p.contrastLight}:1, sombre ${p.dark}).`);
} else {
  console.error("Usage : build.mjs css <sortie.css> | check <#RRGGBB> | theme <#RRGGBB> <sortie.css>");
  process.exit(2);
}
