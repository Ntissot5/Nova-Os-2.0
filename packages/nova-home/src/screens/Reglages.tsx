// Réglages : tout ce qu'on règle rarement, au même endroit, pour que l'espace de travail reste léger.

import { couleurs, Icone, Symbole, type NomIcone } from "../components/Icones";
import { Page } from "../components/Shell";
import { ReleveTile } from "./Mesures";

// Comme les Réglages d'Apple : une liste, un symbole de couleur par entrée, un chevron.
const ENTREES: { href: string; titre: string; texte: string; icone: NomIcone; couleur: string }[] = [
  { href: "#/atelier", titre: "Atelier", texte: "Tes agents, tes départements et les règles de l'entreprise.", icone: "atelier", couleur: "#6E56CF" },
  { href: "#/connecteurs", titre: "Connecteurs", texte: "Microsoft 365 et tous les services de l'entreprise.", icone: "prise", couleur: "#0B5FD9" },
  { href: "#/couts", titre: "Coûts de l'IA", texte: "Ce que les agents et les questions coûtent ce mois-ci.", icone: "billet", couleur: "#1A7F37" },
  { href: "#/flotte", titre: "Flotte", texte: "Les postes, leur version, et qui a accès à Nova.", icone: "ecran", couleur: "#5E5E63" },
];

export function Reglages({ now }: { now: Date }) {
  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Réglages</h1>
        <p className="muted">Ce qu'on règle de temps en temps. Le reste du temps, Nova se fait oublier.</p>
      </header>
      <div className="grid">
        <nav className="span-8 tile groupe" aria-label="Réglages">
          <ul className="list">
            {ENTREES.map((e) => (
              <li key={e.href}>
                <a className="ligne-lien" href={e.href}>
                  <Symbole nom={e.icone} style={couleurs(e.couleur)} />
                  <span className="phrase">
                    <span className="strong">{e.titre}</span>
                    <span className="caption">{e.texte}</span>
                  </span>
                  <Icone nom="chevron" taille={16} className="chevron" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="span-4 stack">
          <ReleveTile now={now} />
        </div>
      </div>
    </Page>
  );
}
