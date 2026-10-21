// L'espace Entreprise : toute la boîte en une vision, en tuiles de verre.

import type { AgentState, State, Task } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { Recu } from "./Departement";
import { couleurs, iconePour, Symbole } from "../components/Icones";
import { Feed } from "../components/Feed";
import { Page } from "../components/Shell";
import { AUTONOMY_LABEL, Bloc, Button, couleurAgent, Doc, Monogram, Phrase, Undo, WhyButton } from "../components/ui";
import { duration, greeting, plural, relative } from "../format";

export function Entreprise({ state, now }: { state: State; now: Date }) {
  const agents = new Map(state.agents.map((a) => [a.id, a]));
  const working = state.tasks.filter((t) => t.status === "en-cours");
  const pending = state.tasks.filter((t) => t.status === "en-attente");
  const deferred = state.tasks.filter((t) => t.status === "differe");
  const done = state.tasks.filter((t) => t.status === "terminee").slice(0, 5);
  const name = (t: Task) => agents.get(t.agentId)?.name ?? t.agentId;
  const featured = working[0];
  // Ce qui attend la personne : ses validations, les dossiers reçus par ses départements, ce qui va partir.
  const miens = new Set((state.departements ?? []).filter((d) => d.mien).map((d) => d.id));
  const recus = (state.relais ?? []).filter((r) => !r.traite && miens.has(r.vers));
  const aFaire = pending.length + recus.length + deferred.length;
  // La direction voit les départements des autres ; un employé voit directement ses agents.
  const vueDirection = (state.departements ?? []).some((d) => !d.mien);
  const nomDep = (x: string) => (x === "direction" ? "Direction" : (state.annuaire?.find((d) => d.id === x)?.name ?? x));

  return (
    <Page>
      <header className="topline">
        <div className="hero-text">
          <h1 className="display">
            {greeting(now)} {state.me}.
          </h1>
          <p className="muted">{summary(working.length, aFaire)}</p>
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
              <Live task={featured} agent={agents.get(featured.agentId)!} couleur={couleurAgent(state, featured.agentId)} others={working.slice(1)} name={name} />
            ) : (
              <p className="muted">Tout est calme. Les agents reprennent dès qu'une demande arrive.</p>
            )}
          </Bloc>

          {state.agents.length === 0 && (state.departements ?? []).every((d) => d.agents.length === 0) ? (
            <Demarrer />
          ) : vueDirection ? (
            <nav aria-label="Départements" className="deps-row">
              {(state.departements ?? []).map((d) => (
                <DepTile key={d.id} d={d} state={state} />
              ))}
            </nav>
          ) : (
            <div className="agents-row">
              {state.agents.map((a) => (
                <AgentTile key={a.id} agent={a} state={state} now={now} />
              ))}
            </div>
          )}

          <Bloc title="Ce qui s'est passé" id="passe">
            <ul className="list">
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

        <div className="span-4 stack priorite">
          <Bloc title="À faire" id="afaire" className="glass-strong" aside={aFaire > 0 && <span className="pill pill-accent">{aFaire}</span>}>
            {aFaire ? (
              <ul className="list">
                {pending.map((t) => (
                  <li key={t.id}>
                    <Approval task={t} agentName={name(t)} />
                  </li>
                ))}
                {recus.map((r) => (
                  <li key={r.id}>
                    <Recu r={r} de={nomDep(r.de)} now={now} />
                  </li>
                ))}
                {deferred.map((t) => (
                  <li key={t.id}>
                    <Undo task={t} now={now} agentName={name(t)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Rien à faire. Les agents te préviennent ici dès qu'ils ont besoin de toi.</p>
            )}
          </Bloc>
          {vueDirection && (state.relais?.length ?? 0) > 0 && <RelaisTile state={state} now={now} />}
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

function Live({ task, agent, couleur, others, name }: { task: Task; agent: AgentState; couleur?: string; others: Task[]; name: (t: Task) => string }) {
  return (
    <>
      <div className="actions" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
        <div className="actions" style={{ gap: "12px", flexWrap: "nowrap", minWidth: 0 }}>
          <Monogram agent={agent} couleur={couleur} />
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

export function AgentTile({ agent, state, now }: { agent: AgentState; state: State; now: Date }) {
  const today = state.tasks.filter((t) => t.agentId === agent.id && t.status === "terminee" && sameDay(t.endedAt ?? t.startedAt, now));
  return (
    <a className="tile tile-link agent-tile" href={`#/agents/${agent.id}`}>
      <div className="tile-head">
        <Monogram agent={agent} couleur={couleurAgent(state, agent.id)} />
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

function DepTile({ d, state }: { d: NonNullable<State["departements"]>[number]; state: State }) {
  const agents = state.agents.filter((a) => d.agents.includes(a.id));
  const attente = state.approvals.filter((x) => d.agents.includes(x.agentId)).length;
  const recus = (state.relais ?? []).filter((r) => r.vers === d.id && !r.traite).length;
  const travaille = agents.filter((a) => a.status === "travaille").length;
  return (
    <a className="tile tile-link dep-tile" href={`#/departements/${d.id}`} style={couleurs(d.couleur)}>
      <Symbole nom={iconePour(d.name)} taille="l" actif={travaille > 0}>
        {attente + recus > 0 && <span className="pastille">{attente + recus}</span>}
      </Symbole>
      <h2 className="title">{d.name}</h2>
      <p className="caption">
        {[
          agents.length ? plural(agents.length, "agent", "agents") : "pas d'agent",
          travaille ? `${travaille} au travail` : "",
          attente ? `${attente} à valider` : "",
          recus ? `${recus} reçu${recus > 1 ? "s" : ""}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </a>
  );
}

function RelaisTile({ state, now }: { state: State; now: Date }) {
  const nom = (x: string) => (x === "direction" ? "Direction" : (state.annuaire?.find((d) => d.id === x)?.name ?? x));
  return (
    <Bloc title="Relais entre départements" id="relais">
      <ul className="list">
        {(state.relais ?? []).slice(0, 5).map((r) => (
          <li key={r.id}>
            <Phrase meta={`${nom(r.de)} → ${nom(r.vers)} · ${r.traite ? "traité" : "en attente"} · ${relative(r.cree, now)}`}>{r.titre}</Phrase>
          </li>
        ))}
      </ul>
    </Bloc>
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
        <Button variant="secondaire" onClick={() => act(`approvals/${task.id}/refuser`)}>
          Refuser
        </Button>
        <span className="actions-fin">
          {task.action && <WhyButton why={task.action.why} reason={task.decision?.kind === "validation" ? task.decision.reason : undefined} />}
          <Button variant="discret" href={`#/agents/${task.agentId}`} label={`Voir ${agentName}`}>
            Voir
          </Button>
        </span>
      </div>
    </div>
  );
}

function summary(working: number, aFaire: number) {
  return [
    working ? `${plural(working, "agent travaille", "agents travaillent")} en ce moment.` : "Aucun agent ne travaille en ce moment.",
    aFaire ? `${plural(aFaire, "chose t'attend", "choses t'attendent")}.` : "Rien ne t'attend.",
  ].join(" ");
}

/** Une entreprise toute neuve : trois pas pour démarrer, sans manuel. */
function Demarrer() {
  return (
    <Bloc title="Construis ton entreprise" id="demarrer" className="glass-strong">
      <ol className="etapes">
        <li>
          <Phrase meta="Gérance, Comptabilité, Ventes… et qui en fait partie.">Crée tes départements</Phrase>
        </li>
        <li>
          <Phrase meta="Pars d'un modèle (boîte de réception, factures impayées, demandes clients…) ou décris-le en quelques phrases.">Crée ton premier agent</Phrase>
        </li>
        <li>
          <Phrase meta="Outlook en un clic, ou n'importe quel service.">Branche tes outils</Phrase>
        </li>
      </ol>
      <div className="actions">
        <Button variant="principal" href="#/atelier">
          Ouvrir l'Atelier
        </Button>
        <Button variant="secondaire" href="#/connecteurs">
          Brancher Microsoft 365
        </Button>
      </div>
    </Bloc>
  );
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
