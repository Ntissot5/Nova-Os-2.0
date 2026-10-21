// Réglages : tout ce qu'on règle rarement, au même endroit, pour que l'espace de travail reste léger.

import { Page } from "../components/Shell";
import { ReleveTile } from "./Mesures";

const ENTREES = [
  { href: "#/atelier", titre: "Atelier", texte: "Tes agents, tes départements et les règles de l'entreprise." },
  { href: "#/connecteurs", titre: "Connecteurs", texte: "Microsoft 365 et tous les services de l'entreprise." },
  { href: "#/couts", titre: "Coûts de l'IA", texte: "Ce que les agents et les questions coûtent ce mois-ci." },
  { href: "#/flotte", titre: "Flotte", texte: "Les postes, leur version, et qui a accès à Nova." },
];

export function Reglages({ now }: { now: Date }) {
  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Réglages</h1>
        <p className="muted">Ce qu'on règle de temps en temps. Le reste du temps, Nova se fait oublier.</p>
      </header>
      <div className="grid">
        <nav className="span-8 cartes" aria-label="Réglages">
          {ENTREES.map((e) => (
            <a key={e.href} className="tile tile-link carte" href={e.href}>
              <strong>{e.titre}</strong>
              <span className="caption">{e.texte}</span>
            </a>
          ))}
        </nav>
        <div className="span-4 stack">
          <ReleveTile now={now} />
        </div>
      </div>
    </Page>
  );
}
