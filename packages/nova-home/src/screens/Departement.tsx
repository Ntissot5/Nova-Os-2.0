// L'espace d'un département : ses agents, ce qui attend une validation, ce qu'il a reçu des autres
// départements, et « Envoyer à… ». Le Hub n'envoie que ce que la personne a le droit de voir.

import { useState } from "react";
import type { Relais, State, Task } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { couleurs, Envoyer } from "../components/Envoyer";
import { Page } from "../components/Shell";
import { Bloc, Button, Phrase, Undo } from "../components/ui";
import { plural, relative } from "../format";
import { AgentTile, Approval } from "./Entreprise";

export function Departement({ state, id, now }: { state: State; id: string; now: Date }) {
  const [envoi, setEnvoi] = useState<{ titre?: string; tache?: string }>();
  const d = state.departements?.find((x) => x.id === id);
  if (!d)
    return (
      <Page>
        <p className="muted">Ce département n'existe pas, ou tu n'en fais pas partie.</p>
      </Page>
    );

  const agents = state.agents.filter((a) => d.agents.includes(a.id));
  const nom = new Map(state.agents.map((a) => [a.id, a.name]));
  const siens = (t: Task) => d.agents.includes(t.agentId);
  const attente = state.tasks.filter((t) => siens(t) && t.status === "en-attente");
  const differe = state.tasks.filter((t) => siens(t) && t.status === "differe");
  const fait = state.tasks.filter((t) => siens(t) && t.status === "terminee").slice(0, 6);
  const recus = (state.relais ?? []).filter((r) => r.vers === id && !r.traite);
  const envoyes = (state.relais ?? []).filter((r) => r.de === id).slice(0, 4);
  const nomDep = (x: string) => (x === "direction" ? "Direction" : (state.annuaire?.find((y) => y.id === x)?.name ?? x));

  return (
    <Page>
      <header className="topline">
        <div className="hero-text">
          <p className="caption eyebrow">
            Département{d.membres.length ? ` · ${d.membres.map((m) => m.name).join(", ")}` : ""}
          </p>
          <h1 className="display" style={couleurs(d.couleur)}>
            {d.name}
          </h1>
          <p className="muted">
            {agents.length ? plural(agents.length, "agent", "agents") : "Aucun agent pour l'instant"}
            {attente.length ? ` · ${plural(attente.length, "action attend", "actions attendent")} une validation` : ""}
          </p>
        </div>
        <div className="actions">
          {recus.length > 0 && (
            <a className="pill pill-accent" href="#recu-titre">
              Reçu des autres départements · {recus.length}
            </a>
          )}
          <Button variant="secondaire" onClick={() => setEnvoi({})}>
            Envoyer à…
          </Button>
        </div>
      </header>

      <div className="grid" style={couleurs(d.couleur)}>
        <div className="span-8 stack">
          {agents.length > 0 && (
            <div className="agents-row">
              {agents.map((a) => (
                <AgentTile key={a.id} agent={a} state={state} now={now} />
              ))}
            </div>
          )}
          <Bloc title="Ce qui s'est passé" id="passe">
            {fait.length ? (
              <ul className="list">
                {fait.map((t) => (
                  <li key={t.id} className="actions" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <Phrase meta={`${nom.get(t.agentId) ?? t.agentId} · ${relative(t.endedAt ?? t.startedAt, now)}`}>{t.outcome}</Phrase>
                    <Button variant="discret" label={`Envoyer « ${t.outcome ?? t.title} » à un autre département`} onClick={() => setEnvoi({ titre: t.title, tache: t.id })}>
                      Envoyer à…
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Rien encore aujourd'hui.</p>
            )}
          </Bloc>
        </div>

        <div className="span-4 stack">
          <Bloc title="Reçu des autres départements" id="recu" aside={recus.length > 0 && <span className="caption">{recus.length}</span>}>
            {recus.length ? (
              <ul className="list">
                {recus.map((r) => (
                  <li key={r.id}>
                    <Recu r={r} de={nomDep(r.de)} now={now} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Rien en attente.</p>
            )}
          </Bloc>
          <Bloc title="En attente de validation" id="attente">
            {attente.length ? (
              <ul className="list">
                {attente.map((t) => (
                  <li key={t.id}>
                    <Approval task={t} agentName={nom.get(t.agentId) ?? t.agentId} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Rien n'attend de validation.</p>
            )}
          </Bloc>
          {differe.length > 0 && (
            <Bloc title="Va partir" id="differe">
              <ul className="list">
                {differe.map((t) => (
                  <li key={t.id}>
                    <Undo task={t} now={now} agentName={nom.get(t.agentId)} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}
          {envoyes.length > 0 && (
            <Bloc title="Envoyé" id="envoye">
              <ul className="list">
                {envoyes.map((r) => (
                  <li key={r.id}>
                    <Phrase meta={`à ${nomDep(r.vers)} · ${r.traite ? "traité" : "en attente"} · ${relative(r.cree, now)}`}>{r.titre}</Phrase>
                  </li>
                ))}
              </ul>
            </Bloc>
          )}
        </div>
      </div>
      {envoi && <Envoyer state={state} depuis={id} titre={envoi.titre} tache={envoi.tache} onClose={() => setEnvoi(undefined)} />}
    </Page>
  );
}

function Recu({ r, de, now }: { r: Relais; de: string; now: Date }) {
  return (
    <div className="inset">
      <Phrase meta={`De ${de} · ${relative(r.cree, now)}`}>
        <span className="strong">{r.titre}</span>
      </Phrase>
      {r.message && <p>{r.message}</p>}
      {r.tache && <p className="caption">Tâche jointe : {r.tache.resume ?? r.tache.titre}</p>}
      <div className="actions">
        <Button variant="principal" onClick={() => act(`relais/${r.id}/traiter`)}>
          C'est traité
        </Button>
      </div>
    </div>
  );
}
