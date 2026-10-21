// L'espace Entreprise : toute la boîte en une vision.

import type { AgentState, State, Task } from "../../../nova-daemon/src/types";
import { act } from "../api";
import { Bloc, Button, Chiffre, Monogram, Phrase, Undo, WhyButton, AUTONOMY_LABEL } from "../components/ui";
import { duration, greeting, plural, relative } from "../format";

export function Entreprise({ state, now, me }: { state: State; now: Date; me: string }) {
  const agents = new Map(state.agents.map((a) => [a.id, a]));
  const working = state.tasks.filter((t) => t.status === "en-cours");
  const pending = state.tasks.filter((t) => t.status === "en-attente");
  const deferred = state.tasks.filter((t) => t.status === "differe");
  const done = state.tasks.filter((t) => t.status === "terminee").slice(0, 6);
  const name = (t: Task) => agents.get(t.agentId)?.name ?? t.agentId;

  return (
    <main className="page">
      <header className="hero">
        <h1 className="display">
          {greeting(now)} {me}.
        </h1>
        <p className="muted">{summary(state, working.length, pending.length)}</p>
      </header>

      <div className="layout">
        <div className="stack">
          <Bloc title="En ce moment" id="maintenant">
            {working.length === 0 ? (
              <p className="muted">Tout est calme. Les agents reprennent dès qu'une demande arrive.</p>
            ) : (
              <ul className="bloc-list">
                {working.map((t) => (
                  <li key={t.id}>
                    <a className="agent-row" style={{ padding: 0 }} href={`#/agents/${t.agentId}`}>
                      <span className="dot-live" aria-hidden="true" />
                      <Phrase meta={<>{name(t)} · {t.title}</>}>{t.steps.at(-1)?.text ?? "Commence…"}</Phrase>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Bloc>

          {pending.length > 0 && (
            <Bloc title="En attente de toi" id="attente">
              <ul className="bloc-list">
                {pending.map((t) => (
                  <li key={t.id}>
                    <Approval task={t} agentName={name(t)} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}

          {deferred.length > 0 && (
            <Bloc title="Va partir" id="differe">
              <ul className="bloc-list">
                {deferred.map((t) => (
                  <li key={t.id}>
                    <Undo task={t} now={now} agentName={name(t)} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}

          <Bloc title="Ce qui s'est passé" id="passe">
            <ul className="bloc-list">
              {done.map((t) => (
                <li key={t.id}>
                  <Phrase meta={<>{name(t)} · {relative(t.endedAt ?? t.startedAt, now)}</>}>{t.outcome}</Phrase>
                </li>
              ))}
            </ul>
          </Bloc>

          <Bloc title="Ce que ça t'a fait gagner" id="gains">
            <Chiffre value={duration(state.gains.minutesThisWeek)}>
              de travail administratif cette semaine, sur {plural(state.gains.tasksThisWeek, "tâche", "tâches")}.
            </Chiffre>
          </Bloc>
        </div>

        <aside aria-labelledby="agents-titre">
          <h2 className="title" id="agents-titre" style={{ marginBottom: "var(--space-1)" }}>
            Tes agents
          </h2>
          <ul className="agents">
            {state.agents.map((a) => (
              <li key={a.id}>
                <a className="agent-row" href={`#/agents/${a.id}`}>
                  <Monogram agent={a} />
                  <Phrase meta={agentLine(a, state)}>{a.name}</Phrase>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}

export function Approval({ task, agentName }: { task: Task; agentName: string }) {
  return (
    <div className="card">
      <Phrase meta={<>{agentName}{task.decision?.kind === "validation" ? ` · ${task.decision.reason}` : ""}</>}>
        <span className="strong">{task.action?.summary}</span>
      </Phrase>
      {task.doc?.body && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{excerpt(task.doc.body)}</p>}
      <div className="actions">
        <Button variant="principal" onClick={() => act(`approvals/${task.id}/valider`)}>
          Valider
        </Button>
        <Button variant="secondaire" href={`#/agents/${task.agentId}`}>
          Voir
        </Button>
        <Button variant="discret" onClick={() => act(`approvals/${task.id}/refuser`)}>
          Refuser
        </Button>
        {task.action && <WhyButton why={task.action.why} reason={task.decision?.kind === "validation" ? task.decision.reason : undefined} />}
      </div>
    </div>
  );
}

function summary(state: State, working: number, pending: number) {
  const parts = [];
  parts.push(working ? `${plural(working, "agent travaille", "agents travaillent")} en ce moment.` : "Aucun agent ne travaille en ce moment.");
  parts.push(pending ? `${plural(pending, "action attend", "actions attendent")} ta validation.` : "Rien n'attend ta validation.");
  return parts.join(" ");
}

function agentLine(a: AgentState, state: State) {
  if (a.status === "pause") return "En pause";
  if (a.status === "travaille") {
    const t = state.tasks.find((x) => x.agentId === a.id && x.status === "en-cours");
    return t?.steps.at(-1)?.text ?? "Travaille";
  }
  if (a.pending) return `${plural(a.pending, "action attend", "actions attendent")} ta validation`;
  return `Disponible · ${AUTONOMY_LABEL[a.autonomy]}`;
}

const excerpt = (s: string) => (s.length > 180 ? s.slice(0, 180).trimEnd() + "…" : s);
