// Référence vivante du système de design : tous les tokens et composants, en clair et en sombre.

import { useState } from "react";
import type { AgentState, Autonomy, Task } from "../../../nova-daemon/src/types";
import { Feed } from "../components/Feed";
import { Page } from "../components/Shell";
import { AutonomyPicker, Bloc, Button, Chiffre, Doc, Monogram, Phrase } from "../components/ui";

const COLORS = ["glass-bg", "glass-strong", "text", "text-muted", "accent", "positive", "attention", "critical"];
const SPACES = ["0-5", "1", "2", "3", "4", "6", "8"];
const TYPES = ["display", "title", "body", "body-strong", "caption"];

const agent: AgentState = {
  id: "exemple",
  name: "Relances",
  description: "",
  autonomy: "je-valide-l-important",
  connectors: {},
  status: "travaille",
  appsInUse: [],
  pending: 2,
  streak: 0,
};

const steps: Task["steps"] = [
  { at: "2026-10-21T08:00:00Z", text: "J'ouvre les paiements de novembre.", app: "compta" },
  { at: "2026-10-21T08:00:02Z", text: "3 locataires ont plus de 10 jours de retard.", app: "compta" },
];

export function Design() {
  const [autonomy, setAutonomy] = useState<Autonomy>("je-valide-l-important");
  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Système de design</h1>
        <p className="muted">Source : design/tokens.json. Lecture humaine : DESIGN-SYSTEM.md.</p>
      </header>
      <div className="stack" style={{ maxWidth: 880 }}>
        <Bloc title="Couleurs">
          <div className="swatches">
            {COLORS.map((c) => (
              <div key={c} className="phrase">
                <div className="swatch" style={{ background: `var(--${c})` }} />
                <p className="caption">--{c}</p>
              </div>
            ))}
          </div>
        </Bloc>
        <Bloc title="Typographie">
          {TYPES.map((t) => (
            <p key={t} style={{ font: `var(--text-${t})` }}>
              {t} — 3 locataires en retard, relance prête.
            </p>
          ))}
        </Bloc>
        <Bloc title="Espacement (grille de 8 px)">
          {SPACES.map((s) => (
            <div key={s} className="actions">
              <div style={{ width: `var(--space-${s})`, height: 16, background: "var(--accent)", borderRadius: 4 }} />
              <span className="caption">--space-{s}</span>
            </div>
          ))}
        </Bloc>
        <Bloc title="Boutons">
          <div className="actions">
            <Button variant="principal">Valider</Button>
            <Button variant="secondaire">Voir</Button>
            <Button variant="discret">Refuser</Button>
          </div>
        </Bloc>
        <Bloc title="Phrase et chiffre">
          <Phrase meta="Compta · il y a 3 min">18 paiements rapprochés, aucune différence.</Phrase>
          <Phrase state="attention" meta="Relances">3 loyers en retard.</Phrase>
          <Chiffre value="6 h 20">de travail administratif cette semaine.</Chiffre>
        </Bloc>
        <Bloc title="Agent, pastille et autonomie">
          <div className="actions">
            <Monogram agent={agent} />
            <Monogram agent={{ ...agent, pending: 0, status: "pause" }} />
            <Monogram agent={{ ...agent, pending: 0 }} large />
          </div>
          <AutonomyPicker agent={{ ...agent, autonomy }} onChange={setAutonomy} />
        </Bloc>
        <Bloc title="Fil en direct et document">
          <div className="inset">
            <div className="live">
              <Feed steps={steps} working label="Exemple de fil" />
              <Doc title="Relance — premier rappel" body={"Bonjour,\n\nSauf erreur de notre part, "} writing />
            </div>
          </div>
        </Bloc>
      </div>
    </Page>
  );
}
