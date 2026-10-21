// La page d'un agent : on le regarde travailler en direct, on règle son autonomie, on relit ce qu'il a fait.

import type { AgentState, State, Task } from "../../../nova-daemon/src/types";
import { act } from "../api";
import { APP_NAMES } from "../apps";
import { Feed } from "../components/Feed";
import { AutonomyPicker, Bloc, Button, Doc, Monogram, Phrase, Undo, WhyButton, useReplay } from "../components/ui";
import { duration, relative } from "../format";
import { Approval } from "./Entreprise";

export function Agent({ state, id, now }: { state: State; id: string; now: Date }) {
  const agent = state.agents.find((a) => a.id === id);
  if (!agent)
    return (
      <main className="page">
        <p>Cet agent n'existe pas.</p>
        <Button href="#/">Retour à l'entreprise</Button>
      </main>
    );

  const tasks = state.tasks.filter((t) => t.agentId === id);
  const current = tasks.find((t) => t.status === "en-cours");
  const pending = tasks.filter((t) => t.status === "en-attente");
  const deferred = tasks.filter((t) => t.status === "differe");
  const history = tasks.filter((t) => !["en-cours", "en-attente", "differe"].includes(t.status)).slice(0, 12);

  return (
    <main className="page">
      <nav style={{ marginBottom: "var(--space-4)" }}>
        <Button variant="discret" href="#/">
          ← Entreprise
        </Button>
      </nav>

      <header className="hero" style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", columnGap: "var(--space-3)" }}>
        <Monogram agent={agent} large />
        <div className="phrase">
          <h1 className="display">{agent.name}</h1>
          <p className="muted">{agent.description}</p>
        </div>
      </header>

      <div className="stack" style={{ maxWidth: 1000 }}>
        <div className="actions">
          <Status agent={agent} current={current} />
          {agent.status === "pause" ? (
            <Button variant="secondaire" onClick={() => act(`agents/${id}/reprendre`)}>
              Reprendre
            </Button>
          ) : (
            <Button variant="secondaire" onClick={() => act(`agents/${id}/pause`)}>
              Mettre en pause
            </Button>
          )}
        </div>

        {agent.suggestion && <Suggestion agent={agent} />}

        <Bloc title="En direct" id="direct">
          {current ? (
            <div className="card">
              <div className="actions" style={{ justifyContent: "space-between" }}>
                <Phrase meta={<>Commencé {relative(current.startedAt, now)}{uses(agent)}</>}>
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
            </div>
          ) : (
            <p className="muted">
              {agent.status === "pause" ? `${agent.name} est en pause.` : `${agent.name} est disponible. Il reprend dès qu'une demande arrive.`}
            </p>
          )}
        </Bloc>

        {pending.length > 0 && (
          <Bloc title="En attente de toi" id="attente">
            {pending.map((t) => (
              <Approval key={t.id} task={t} agentName={agent.name} />
            ))}
          </Bloc>
        )}

        {deferred.length > 0 && (
          <Bloc title="Va partir" id="differe">
            {deferred.map((t) => (
              <Undo key={t.id} task={t} now={now} />
            ))}
          </Bloc>
        )}

        <Bloc title="Autonomie" id="autonomie">
          <AutonomyPicker agent={agent} />
        </Bloc>

        <Bloc title="Ce qu'il a fait" id="historique">
          <ul className="bloc-list">
            {history.map((t) => (
              <li key={t.id}>
                <Past task={t} now={now} />
              </li>
            ))}
          </ul>
        </Bloc>
      </div>
    </main>
  );
}

function Status({ agent, current }: { agent: AgentState; current?: Task }) {
  if (agent.status === "pause") return <span className="muted">En pause. Il ne commence plus rien.</span>;
  if (current)
    return (
      <span className="actions">
        <span className="dot-live" aria-hidden="true" /> Travaille en ce moment
      </span>
    );
  return <span className="muted">Disponible</span>;
}

function Suggestion({ agent }: { agent: AgentState }) {
  const next = agent.autonomy === "je-valide-tout" ? "je-valide-l-important" : "autonome";
  return (
    <div className="card card-accent">
      <Phrase>{agent.suggestion}</Phrase>
      <div className="actions">
        <Button variant="principal" onClick={() => act(`agents/${agent.id}/autonomie`, { level: next })}>
          Oui, lui faire confiance
        </Button>
      </div>
    </div>
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
      <div className="card">
        <Feed steps={replay.steps} working={replay.playing} label={`Étapes : ${task.title}`} />
        {task.doc?.body && <Doc title={task.doc.title} body={task.doc.body} writing={false} />}
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

const uses = (a: AgentState) => (a.appsInUse.length ? ` · utilise ${a.appsInUse.map((x) => APP_NAMES[x] ?? x).join(", ")}` : "");
