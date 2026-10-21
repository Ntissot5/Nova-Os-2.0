// L'espace Entreprise : toute la boîte en une vision, en tuiles de verre.

import type { AgentState, State, Task } from "../../../nova-daemon/src/types";
import { act } from "../api";
import { Feed } from "../components/Feed";
import { Page } from "../components/Shell";
import { AUTONOMY_LABEL, Bloc, Button, Doc, Monogram, Phrase, Undo, WhyButton } from "../components/ui";
import { duration, greeting, plural, relative } from "../format";

export function Entreprise({ state, now }: { state: State; now: Date }) {
  const agents = new Map(state.agents.map((a) => [a.id, a]));
  const working = state.tasks.filter((t) => t.status === "en-cours");
  const pending = state.tasks.filter((t) => t.status === "en-attente");
  const deferred = state.tasks.filter((t) => t.status === "differe");
  const done = state.tasks.filter((t) => t.status === "terminee").slice(0, 5);
  const name = (t: Task) => agents.get(t.agentId)?.name ?? t.agentId;
  const featured = working[0];

  return (
    <Page>
      <header className="topline">
        <div className="hero-text">
          <h1 className="display">
            {greeting(now)} {state.me}.
          </h1>
          <p className="muted">{summary(working.length, pending.length)}</p>
        </div>
        <div className="actions">
          {state.demo && <span className="pill">Démonstration : données fictives</span>}
          {pending.length > 0 && (
            <a className="pill pill-accent" href="#attente-titre">
              {pending.length} à valider
            </a>
          )}
        </div>
      </header>

      <div className="grid">
        <div className="span-8 stack">
          <Bloc
            title="En ce moment"
            id="maintenant"
            className="glass-strong"
            aside={
              featured && (
                <span className="pill">
                  <span className="dot-live" aria-hidden="true" /> En direct
                </span>
              )
            }
          >
            {featured ? (
              <Live task={featured} agent={agents.get(featured.agentId)!} others={working.slice(1)} name={name} />
            ) : (
              <p className="muted">Tout est calme. Les agents reprennent dès qu'une demande arrive.</p>
            )}
          </Bloc>

          <div className="agents-row">
            {state.agents.map((a) => (
              <AgentTile key={a.id} agent={a} state={state} now={now} />
            ))}
          </div>

          <Bloc title="Ce qui s'est passé" id="passe">
            <ul className="list" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--space-3)" }}>
              {done.map((t) => (
                <li key={t.id}>
                  <Phrase
                    meta={
                      <>
                        {name(t)} · {relative(t.endedAt ?? t.startedAt, now)}
                      </>
                    }
                  >
                    {t.outcome}
                  </Phrase>
                </li>
              ))}
            </ul>
          </Bloc>
        </div>

        <div className="span-4 stack">
          <Bloc title="En attente de toi" id="attente" aside={pending.length > 0 && <span className="caption">{pending.length}</span>}>
            {pending.length ? (
              <ul className="list">
                {pending.map((t) => (
                  <li key={t.id}>
                    <Approval task={t} agentName={name(t)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Rien n'attend ta validation.</p>
            )}
          </Bloc>
          {deferred.length > 0 && (
            <Bloc title="Va partir" id="differe">
              <ul className="list">
                {deferred.map((t) => (
                  <li key={t.id}>
                    <Undo task={t} now={now} agentName={name(t)} />
                  </li>
                ))}
              </ul>
            </Bloc>
          )}
          <Bloc title="Ce que ça t'a fait gagner" id="gains">
            <div className="phrase">
              <p className="chiffre">{duration(state.gains.minutesThisWeek)}</p>
              <p className="caption">de travail administratif cette semaine, sur {plural(state.gains.tasksThisWeek, "tâche", "tâches")}.</p>
            </div>
            <Week tasks={state.tasks} now={now} />
          </Bloc>
        </div>
      </div>
    </Page>
  );
}

function Live({ task, agent, others, name }: { task: Task; agent: AgentState; others: Task[]; name: (t: Task) => string }) {
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div className="actions" style={{ gap: "var(--space-2)", flexWrap: "nowrap", minWidth: 0 }}>
          <Monogram agent={agent} />
          <Phrase meta={agent.name}>
            <span className="strong">{task.title}</span>
          </Phrase>
        </div>
        <div className="actions">
          <Button variant="secondaire" href={`#/agents/${agent.id}`}>
            Regarder
          </Button>
          <Button variant="discret" onClick={() => act(`tasks/${task.id}/arreter`)} label="Arrêter l'agent et reprendre la main">
            Je m'en occupe
          </Button>
        </div>
      </div>
      <div className={task.doc ? "live" : undefined}>
        <Feed steps={task.steps.slice(-5)} working label={`Ce que fait ${agent.name}`} />
        {task.doc && <Doc title={task.doc.title} body={task.doc.body} writing />}
      </div>
      {others.length > 0 && <p className="caption">Aussi en ce moment : {others.map((t) => `${name(t)} (${t.steps.at(-1)?.text ?? t.title})`).join(" · ")}</p>}
    </>
  );
}

function AgentTile({ agent, state, now }: { agent: AgentState; state: State; now: Date }) {
  const today = state.tasks.filter((t) => t.agentId === agent.id && t.status === "terminee" && sameDay(t.endedAt ?? t.startedAt, now));
  return (
    <a className="tile tile-link agent-tile" href={`#/agents/${agent.id}`}>
      <div className="tile-head">
        <Monogram agent={agent} />
        <span className="pill">{AUTONOMY_LABEL[agent.autonomy]}</span>
      </div>
      <div className="phrase">
        <h2 className="title">{agent.name}</h2>
        <p className="muted">{status(agent, state)}</p>
      </div>
      <p className="caption">
        Aujourd'hui : {plural(today.length, "tâche", "tâches")}
        {today.length ? ` · ${duration(today.reduce((s, t) => s + t.minutesSaved, 0))} gagnées` : ""}
      </p>
    </a>
  );
}

function Week({ tasks, now }: { tasks: Task[]; now: Date }) {
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const minutes = tasks.filter((t) => t.status === "terminee" && sameDay(t.endedAt ?? t.startedAt, d)).reduce((s, t) => s + t.minutesSaved, 0);
    return { d, minutes };
  });
  const max = Math.max(30, ...days.map((x) => x.minutes));
  return (
    <figure style={{ margin: 0 }} aria-label="Temps gagné par jour, 7 derniers jours">
      <div className="bars">
        {days.map(({ d, minutes }, i) => (
          <div
            key={i}
            className={i === 6 ? "is-today" : undefined}
            style={{ height: `${Math.max(6, (100 * minutes) / max)}%` }}
            title={`${duration(minutes)}`}
          />
        ))}
      </div>
      <div className="bars-labels caption" aria-hidden="true">
        {days.map(({ d }, i) => (
          <span key={i}>{d.toLocaleDateString("fr-CH", { weekday: "narrow" })}</span>
        ))}
      </div>
    </figure>
  );
}

export function Approval({ task, agentName }: { task: Task; agentName: string }) {
  return (
    <div className="inset">
      <Phrase
        meta={
          <>
            {agentName}
            {task.decision?.kind === "validation" ? ` · ${task.decision.reason}` : ""}
          </>
        }
      >
        <span className="strong">{task.action?.summary}</span>
      </Phrase>
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

function summary(working: number, pending: number) {
  return [
    working ? `${plural(working, "agent travaille", "agents travaillent")} en ce moment.` : "Aucun agent ne travaille en ce moment.",
    pending ? `${plural(pending, "action attend", "actions attendent")} ta validation.` : "Rien n'attend ta validation.",
  ].join(" ");
}

function status(a: AgentState, state: State) {
  if (a.status === "pause") return "En pause.";
  if (a.status === "travaille") {
    const t = state.tasks.find((x) => x.agentId === a.id && x.status === "en-cours");
    return t?.steps.at(-1)?.text ?? "Travaille…";
  }
  if (a.pending) return `${plural(a.pending, "action attend", "actions attendent")} ta validation.`;
  return "Disponible.";
}

const sameDay = (iso: string, d: Date) => new Date(iso).toDateString() === d.toDateString();
