// Ce que la Phase 2 doit prouver : les heures gagnées (relevé hebdomadaire) et le coût de l'IA (journal).
// Visible par le dirigeant seulement (D-016 : l'employé ne voit pas de compteur).

import { useEffect, useState } from "react";
import type { State } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { Page } from "../components/Shell";
import { Bloc, Button, Phrase } from "../components/ui";

interface Releve {
  semaine: string;
  heures: number;
  date: string;
}

export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Tuile du relevé hebdomadaire : deux minutes le vendredi, la base de la mesure avant/après. */
export function ReleveTile({ now }: { now: Date }) {
  const semaine = isoWeek(now);
  const [releves, setReleves] = useState<Releve[] | null>(null);
  const [heures, setHeures] = useState("");
  const load = () =>
    fetch("/api/releves")
      .then((r) => (r.ok ? r.json() : []))
      .then(setReleves)
      .catch(() => setReleves([]));
  useEffect(() => void load(), []);
  if (!releves) return null;
  const done = releves.find((r) => r.semaine === semaine);
  const label = `semaine ${Number(semaine.slice(6))}`;
  return (
    <Bloc title="Relevé de la semaine" id="releve">
      {done ? (
        <Phrase meta={`${releves.length} semaine${releves.length > 1 ? "s" : ""} relevée${releves.length > 1 ? "s" : ""}`}>
          {label} : {done.heures} h d'administratif relevées. Merci.
        </Phrase>
      ) : (
        <form
          className="stack"
          style={{ gap: "var(--space-2)" }}
          onSubmit={(e) => {
            e.preventDefault();
            void act("releves", { semaine, heures: Number(heures) }).then(load);
          }}
        >
          <label htmlFor="heures">Combien d'heures l'équipe a-t-elle passées sur l'administratif cette {label} ?</label>
          <div className="actions">
            <input id="heures" className="field" type="number" min={0} max={400} step={0.5} inputMode="decimal" value={heures} onChange={(e) => setHeures(e.target.value)} required />
            <Button variant="principal" onClick={() => act("releves", { semaine, heures: Number(heures) }).then(load)} disabled={heures === ""}>
              Enregistrer
            </Button>
          </div>
          <p className="caption">Deux minutes par semaine. C'est ce qui prouvera les heures gagnées, avant et après Nova.</p>
        </form>
      )}
    </Bloc>
  );
}

interface Couts {
  mois: string;
  totalUSD: number;
  appels: number;
  parAgent: Record<string, number>;
  questionsParPersonne: Record<string, number>;
}

const usd = (n: number) => `${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

export function CoutsScreen({ state }: { state: State }) {
  const [c, setC] = useState<Couts | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch("/api/couts")
      .then(async (r) => (r.ok ? setC(await r.json()) : setError((await r.json()).erreur)))
      .catch(() => setError("Le service Nova ne répond pas."));
  }, []);
  const names = Object.fromEntries(state.agents.map((a) => [a.id, a.name]));
  const people = Math.max(1, new Set(Object.keys(c?.questionsParPersonne ?? {})).size, 1);
  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Coûts de l'IA</h1>
        <p className="muted">Ce que les agents et les questions ont coûté ce mois-ci, lu dans le journal. Les employés ne voient pas ce compteur.</p>
      </header>
      <div className="stack" style={{ maxWidth: 880 }}>
        {error && <p className="state-attention">{error}</p>}
        {c && (
          <>
            <Bloc title={`Mois de ${new Date(`${c.mois}-01`).toLocaleDateString("fr-CH", { month: "long", year: "numeric" })}`} className="glass-strong">
              <div className="phrase">
                <p className="chiffre">{usd(c.totalUSD)}</p>
                <p className="caption">
                  {c.appels} appels au modèle · environ {usd(c.totalUSD / people)} par poste actif
                </p>
              </div>
            </Bloc>
            <Bloc title="Par agent">
              <ul className="list">
                {Object.entries(c.parAgent).length === 0 && <li className="muted">Aucun travail d'agent ce mois-ci.</li>}
                {Object.entries(c.parAgent).map(([id, v]) => (
                  <li key={id}>
                    <Phrase>
                      <span className="strong">{names[id] ?? id}</span> : {usd(v)}
                    </Phrase>
                  </li>
                ))}
              </ul>
            </Bloc>
            <Bloc title="Questions">
              <ul className="list">
                {Object.entries(c.questionsParPersonne).length === 0 && <li className="muted">Aucune question ce mois-ci.</li>}
                {Object.entries(c.questionsParPersonne).map(([id, v]) => (
                  <li key={id}>
                    <Phrase>
                      <span className="strong">{id}</span> : {usd(v)}
                    </Phrase>
                  </li>
                ))}
              </ul>
            </Bloc>
          </>
        )}
      </div>
    </Page>
  );
}
