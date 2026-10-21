// La page d'un agent : on le regarde travailler en direct, on règle son autonomie, on relit ce qu'il a fait.

import type { AgentState, State, Task } from "../../../nova-server/src/core/types";
import { act, useMoi } from "../api";
import { APP_NAMES } from "../apps";
import { Feed } from "../components/Feed";
import { Page } from "../components/Shell";
import { AutonomyPicker, Bloc, Button, Doc, Monogram, Phrase, Undo, WhyButton, useReplay } from "../components/ui";
import { duration, relative } from "../format";
import { Approval } from "./Entreprise";

export function Agent({ state, id, now }: { state: State; id: string; now: Date }) {
  const agent = state.agents.find((a) => a.id === id);
  const moi = useMoi();
  if (!agent)
    return (
      <Page>
        <p>Cet agent n'existe pas.</p>
        <Button href="#/">Retour à l'entreprise</Button>
      </Page>
    );

  const tasks = state.tasks.filter((t) => t.agentId === id);
  const current = tasks.find((t) => t.status === "en-cours");
  const pending = tasks.filter((t) => t.status === "en-attente");
  const deferred = tasks.filter((t) => t.status === "differe");
  const history = tasks.filter((t) => !["en-cours", "en-attente", "differe"].includes(t.status)).slice(0, 12);

  return (
    <Page>
      <header className="topline">
        <div className="actions" style={{ gap: "var(--space-3)", flexWrap: "nowrap" }}>
          <Monogram agent={agent} large />
          <div className="hero-text">
            <h1 className="display">{agent.name}</h1>
            <p className="muted">{agent.description}</p>
          </div>
        </div>
        <div className="actions">
          <Status agent={agent} current={current} />
          {agent.status === "pause" ? (
            <Button variant="principal" onClick={() => act(`agents/${id}/reprendre`)}>
              Reprendre
            </Button>
          ) : (
            <Button variant="secondaire" onClick={() => act(`agents/${id}/pause`)}>
              Mettre en pause
            </Button>
          )}
          {moi.role === "dirigeant" && agent.skills?.[0]?.startsWith("atelier/") && (
            <Button variant="discret" href="#/atelier">
              Modifier dans l'Atelier
            </Button>
          )}
          {moi.agentsActifs && agent.status === "disponible" && !current && (
            <Button variant="principal" onClick={() => act(`agents/${id}/lancer`)}>
              Lancer maintenant
            </Button>
          )}
        </div>
      </header>

      <div className="grid">
        <div className="span-8 stack">
          <Bloc
            title="En direct"
            id="direct"
            className="glass-strong"
            aside={current && <span className="pill"><span className="dot-live" aria-hidden="true" /> Commencé {relative(current.startedAt, now)}</span>}
          >
            {current ? (
              <>
                <div className="actions" style={{ justifyContent: "space-between" }}>
                  <Phrase meta={uses(agent)}>
                    <span className="strong">{current.title}</span>
                  </Phrase>
                  <Button variant="secondaire" onClick={() => act(`tasks/${current.id}/arreter`)} label="Arrêter l'agent et reprendre la main">
                    Je m'en occupe
                  </Button>
                </div>
                <div className={current.doc ? "live" : undefined}>
                  <Feed steps={current.steps} working label={`Ce que fait ${agent.name}`} />
                  {current.doc && <Doc title={current.doc.title} body={current.doc.body} writing />}
                </div>
              </>
            ) : (
              <p className="muted">
                {agent.status === "pause" ? `${agent.name} est en pause. Il ne commence plus rien.` : `${agent.name} est disponible. Il reprend dès qu'une demande arrive.`}
              </p>
            )}
          </Bloc>

          <Bloc title="Ce qu'il a fait" id="historique">
            <ul className="list" style={{ gap: "var(--space-3)" }}>
              {history.map((t) => (
                <li key={t.id}>
                  <Past task={t} now={now} />
                </li>
              ))}
            </ul>
          </Bloc>
        </div>

        <div className="span-4 stack">
          {agent.suggestion && <Suggestion agent={agent} />}

          {pending.length > 0 && (
            <Bloc title="En attente de toi" id="attente">
              <ul className="list">
                {pending.map((t) => (
                  <li key={t.id}>
                    <Approval task={t} agentName={agent.name} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}

          {deferred.length > 0 && (
            <Bloc title="Va partir" id="differe">
              <ul className="list">
                {deferred.map((t) => (
                  <li key={t.id}>
                    <Undo task={t} now={now} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}

          <Bloc title="Autonomie" id="autonomie">
            <AutonomyPicker agent={agent} lecture={moi.role !== "dirigeant"} />
          </Bloc>
        </div>
      </div>
    </Page>
  );
}

function Status({ agent, current }: { agent: AgentState; current?: Task }) {
  if (agent.status === "pause") return <span className="pill">En pause</span>;
  if (current)
    return (
      <span className="pill">
        <span className="dot-live" aria-hidden="true" /> Travaille
      </span>
    );
  return <span className="pill">Disponible</span>;
}

function Suggestion({ agent }: { agent: AgentState }) {
  const next = agent.autonomy === "je-valide-tout" ? "je-valide-l-important" : "autonome";
  return (
    <section className="tile glass-strong" aria-label="Proposition de Nova">
      <span className="pill pill-accent" style={{ justifySelf: "start" }}>
        Proposition
      </span>
      <Phrase>{agent.suggestion}</Phrase>
      <div className="actions">
        <Button variant="principal" onClick={() => act(`agents/${agent.id}/autonomie`, { level: next })}>
          Oui, lui faire confiance
        </Button>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<string, string> = {
  terminee: "Fait",
  annulee: "Annulé",
  refusee: "Refusé",
  arretee: "Repris en main",
};

function Past({ task, now }: { task: Task; now: Date }) {
  const replay = useReplay(task);
  const meta = (
    <>
      {STATUS_TEXT[task.status] ?? task.status} · {relative(task.endedAt ?? task.startedAt, now)}
      {task.status === "terminee" && task.minutesSaved ? ` · ${duration(task.minutesSaved)} gagnées` : ""}
    </>
  );
  if (!task.steps.length) return <Phrase meta={meta}>{task.outcome}</Phrase>;
  return (
    <details className="task">
      <summary>
        <Phrase meta={meta}>{task.outcome ?? task.title}</Phrase>
      </summary>
      <div className="inset">
        <div className={task.doc?.body ? "live" : undefined}>
          <Feed steps={replay.steps} working={replay.playing} label={`Étapes : ${task.title}`} />
          {task.doc?.body && <Doc title={task.doc.title} body={task.doc.body} writing={false} />}
        </div>
        <div className="actions">
          <Button variant="secondaire" onClick={replay.play} disabled={replay.playing}>
            Rejouer
          </Button>
          {task.action && <WhyButton why={task.action.why} reason={task.decision?.kind === "validation" ? task.decision.reason : undefined} />}
        </div>
      </div>
    </details>
  );
}

const uses = (a: AgentState) => (a.appsInUse.length ? `Utilise ${a.appsInUse.map((x) => APP_NAMES[x] ?? x).join(", ")}` : undefined);
