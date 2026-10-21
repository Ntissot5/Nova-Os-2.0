// Les symboles de Nova : dessinés sur une grille de 24, trait de 1,7, bouts arrondis, comme SF Symbols.
// Un agent ou un département n'a pas une lettre mais un symbole, choisi d'après son nom (D-033).

import type { CSSProperties, ReactNode } from "react";

export type NomIcone =
  | "maison"
  | "etincelle"
  | "loupe"
  | "atelier"
  | "reglages"
  | "immeuble"
  | "cle"
  | "outil"
  | "billet"
  | "cloche"
  | "personnes"
  | "plateau"
  | "calendrier"
  | "badge"
  | "bulles"
  | "document"
  | "carton"
  | "avion"
  | "plus"
  | "chevron"
  | "info"
  | "coche"
  | "prise"
  | "ecran";

const TRACES: Record<NomIcone, ReactNode> = {
  maison: (
    <>
      <path d="M3.5 10.6 12 3.8l8.5 6.8" />
      <path d="M5.5 9.2V19a1.2 1.2 0 0 0 1.2 1.2h3.6v-5.4a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v5.4h3.6a1.2 1.2 0 0 0 1.2-1.2V9.2" />
    </>
  ),
  etincelle: (
    <>
      <path d="M10 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
      <path d="M17.5 14.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z" />
    </>
  ),
  loupe: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 5.1 5.1" />
    </>
  ),
  atelier: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="3.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <path d="M17 14v6M14 17h6" />
    </>
  ),
  reglages: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  immeuble: (
    <>
      <path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 5v15.5" />
      <path d="M15 9.5h2.5A1.5 1.5 0 0 1 19 11v9.5M3.5 20.5h17" />
      <path d="M8.5 7.5h3M8.5 11h3M8.5 14.5h3" />
    </>
  ),
  cle: (
    <>
      <circle cx="8" cy="15.5" r="4.5" />
      <path d="m11.2 12.3 8.3-8.3M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  outil: <path d="M14.7 6.3a4.2 4.2 0 0 0-5.4 5.4L4 17a2.1 2.1 0 0 0 3 3l5.3-5.3a4.2 4.2 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5Z" />,
  billet: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  cloche: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  personnes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.4-3.6 3-5.5 6.5-5.5s6.1 1.9 6.5 5.5" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2.3.6 3.7 2.4 4 5.2" />
    </>
  ),
  plateau: (
    <>
      <path d="M3.5 13.5 6 5.3A1.5 1.5 0 0 1 7.4 4.3h9.2A1.5 1.5 0 0 1 18 5.3l2.5 8.2V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z" />
      <path d="M3.5 13.5h4.5l1 2h6l1-2h4.5" />
    </>
  ),
  calendrier: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" strokeWidth="2.4" />
    </>
  ),
  badge: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2.2" />
      <path d="M5.8 16.5c.5-1.6 1.6-2.4 3.2-2.4s2.7.8 3.2 2.4M14.5 10h3M14.5 13.5h3" />
    </>
  ),
  bulles: (
    <>
      <path d="M14.5 9.5V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v4.5a2 2 0 0 0 2 2H6v3l3.2-3" />
      <path d="M11 10.5h7.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H18v2.5L15 19h-4a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2Z" />
    </>
  ),
  document: (
    <>
      <path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z" />
      <path d="M13.5 3.5v5h5M9 12.5h6M9 16h4" />
    </>
  ),
  carton: (
    <>
      <path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9M7.8 5.3l8.5 4.5" />
    </>
  ),
  avion: (
    <>
      <path d="M20.5 3.5 3.5 10.3l6.8 3.4 3.4 6.8Z" />
      <path d="m10.3 13.7 4.2-4.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),
  coche: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  prise: (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 16v4.5" />
    </>
  ),
  ecran: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
};

export function Icone({ nom, taille = 20, className }: { nom: NomIcone; taille?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRACES[nom]}
    </svg>
  );
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Du plus précis au plus général : « Relances » parle de factures, mais c'est une cloche.
const MOTS: [RegExp, NomIcone][] = [
  [/locatair|habitant|resident|occupant/, "personnes"],
  [/relance|rappel|impaye|retard/, "cloche"],
  [/fournisseur|achat|commande|stock|livraison/, "carton"],
  [/compta|factur|paiement|banque|financ|fiduc|tresor|salaire/, "billet"],
  [/\bppe\b|copropri|proprietair/, "cle"],
  [/facility|techni|entretien|concierg|maintenance|travaux|chantier/, "outil"],
  [/geran|immeubl|regie|immobil|batiment/, "immeuble"],
  [/agenda|rendez|calendri|planning|reunion/, "calendrier"],
  [/candidat|recrut|\brh\b|ressources humaines|personnel|embauche/, "badge"],
  [/client|commercial|vente|devis|prospect|support/, "bulles"],
  [/rapport|direction|synthese|semaine|contrat|juridique|bail/, "document"],
  [/mail|boite|courrier|reception|accueil/, "plateau"],
];

/** Le symbole d'un agent ou d'un département : d'après son nom d'abord, puis sa description. */
export function iconePour(nom: string, description = ""): NomIcone {
  for (const texte of [norm(nom), norm(description)]) for (const [re, icone] of MOTS) if (re.test(texte)) return icone;
  return "etincelle";
}

/** Les couleurs d'un département : son accent, et du blanc dessus (contraste AA vérifié par l'Atelier). */
export const couleurs = (couleur: string) => ({ "--accent": couleur, "--on-accent": "#fff" }) as CSSProperties;

/**
 * Le symbole sur sa pastille arrondie (une « squircle », comme les icônes des Réglages d'Apple).
 * La couleur vient de --accent : celle du département, ou l'accent de l'entreprise.
 */
export function Symbole({
  nom,
  taille = "m",
  style,
  actif,
  doux,
  children,
}: {
  nom: NomIcone;
  taille?: "s" | "m" | "l" | "xl";
  style?: CSSProperties;
  actif?: boolean;
  /** Teinté plutôt que plein : pour un modèle, pas encore un vrai agent. */
  doux?: boolean;
  children?: ReactNode;
}) {
  const px = { s: 15, m: 18, l: 22, xl: 34 }[taille];
  return (
    <span className={`symbole symbole-${taille}${doux ? " symbole-doux" : ""}${actif ? " is-working" : ""}`} style={style} aria-hidden="true">
      <Icone nom={nom} taille={px} />
      {children}
    </span>
  );
}
