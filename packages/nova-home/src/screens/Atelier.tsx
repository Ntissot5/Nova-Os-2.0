// L'Atelier : l'entreprise construit son propre système. Des départements, des agents décrits en phrases,
// et les règles que tous les agents lisent. Pas de code, pas d'installateur : tout s'applique tout de suite.

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Autonomy } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { couleurs, Icone, iconePour, Symbole } from "../components/Icones";
import { Page } from "../components/Shell";
import { AUTONOMY_LABEL, Bloc, Button, Phrase, useDialogue } from "../components/ui";

interface AgentAtelier {
  id: string;
  name: string;
  description: string;
  departement?: string;
  autonomy: Autonomy;
  sources: Record<string, string[]>;
  declencheur: string;
  consignes: string;
  minutes: number;
}
interface Modele {
  id: string;
  nom: string;
  metier: string;
  description: string;
  declencheur: string;
  sources: Record<string, string[]>;
  consignes: string;
  minutes: number;
}
interface Vue {
  agents: AgentAtelier[];
  agentsBase: { id: string; name: string; description: string; departement?: string }[];
  departements: { id: string; name: string; couleur: string; membres: string[]; agents: string[]; atelier: boolean }[];
  personnes: { id: string; name: string }[];
  regles: string;
  modeles: Modele[];
  sources: { id: string; droits: string[] }[];
}

const SOURCES: Record<string, string> = { mail: "Mail", agenda: "Agenda", fichiers: "Documents", compta: "Comptabilité", telephone: "Téléphonie" };
const DROITS: Record<string, Record<string, string>> = {
  mail: { read: "lire les mails", draft: "préparer des brouillons", send: "envoyer" },
  agenda: { read: "voir l'agenda", write: "ajouter des rendez-vous" },
  fichiers: { read: "lire les documents", write: "écrire des documents", delete: "mettre à la corbeille" },
  compta: { read: "lire la comptabilité", payment: "préparer des paiements" },
  telephone: { read: "lire le journal d'appels" },
};
const SENSIBLES = new Set(["send", "payment", "write", "delete"]);
/** D'abord lire, puis préparer, puis agir : l'ordre dans lequel on accorde sa confiance. */
const ORDRE_DROITS = ["read", "draft", "write", "send", "payment", "delete"];
const ORDRE_SOURCES = ["mail", "agenda", "fichiers", "compta", "telephone"];
const rang = (ordre: string[], x: string) => (ordre.includes(x) ? ordre.indexOf(x) : ordre.length);
/** Couleurs de département lisibles avec du texte blanc (contraste AA vérifié par le gardien). */
const PALETTE = ["#0B5FD9", "#1A7F37", "#6E56CF", "#A65200", "#0E7490", "#B4235A", "#4D5562"];

const droitLabel = (src: string, d: string) => DROITS[src]?.[d] ?? (d === "read" ? "lire" : "agir");
const sourceLabel = (src: string) => SOURCES[src] ?? src;

export function quand(declencheur: string) {
  if (declencheur === "mail") return "À chaque mail reçu";
  const m = declencheur.match(/^quotidien (\d{2}:\d{2})$/);
  if (m) return `Chaque jour à ${m[1]!.replace(":", " h ")}`;
  return "Quand on le lance";
}

export function AtelierScreen() {
  const [v, setV] = useState<Vue | null>(null);
  const [erreur, setErreur] = useState<string>();
  const [edition, setEdition] = useState<Partial<AgentAtelier> | null>(null);
  const [nouveauDep, setNouveauDep] = useState(false);
  const charger = () =>
    fetch("/api/atelier")
      .then(async (r) => (r.ok ? setV(await r.json()) : setErreur((await r.json()).erreur)))
      .catch(() => setErreur("Le service Nova ne répond pas."));
  useEffect(() => void charger(), []);
  const nomDep = (id?: string) => v?.departements.find((d) => d.id === id);

  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Atelier</h1>
        <p className="muted">Construis ton entreprise : tes départements, tes agents et leurs règles. En français, sans code. Tout s'applique tout de suite.</p>
      </header>
      {erreur && <p className="state-attention">{erreur}</p>}
      {v && (
        <div className="grid">
          <div className="span-8 stack">
            <Bloc title="Tes agents" id="agents" className="glass-strong" aside={<span className="pill">{v.agents.length + v.agentsBase.length}</span>}>
              <ul className="cartes" role="list">
                {v.agents.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="tile carte" onClick={() => setEdition(a)} style={nomDep(a.departement) ? couleurs(nomDep(a.departement)!.couleur) : undefined}>
                      <span className="carte-tete">
                        <Symbole nom={iconePour(a.name, a.description)} />
                        <span className="caption">{nomDep(a.departement)?.name ?? "Sans département"}</span>
                      </span>
                      <strong>{a.name}</strong>
                      <span className="caption">{a.description}</span>
                      <span className="caption">
                        {quand(a.declencheur)} · {Object.keys(a.sources).map(sourceLabel).join(", ") || "aucune source"}
                      </span>
                    </button>
                  </li>
                ))}
                {v.agentsBase.map((a) => (
                  <li key={a.id}>
                    <div className="tile carte carte-base" style={nomDep(a.departement) ? couleurs(nomDep(a.departement)!.couleur) : undefined}>
                      <span className="carte-tete">
                        <Symbole nom={iconePour(a.name, a.description)} />
                        <span className="caption">{nomDep(a.departement)?.name ?? "Sans département"}</span>
                      </span>
                      <strong>{a.name}</strong>
                      <span className="caption">{a.description}</span>
                      <span className="caption">Posé à l'installation</span>
                    </div>
                  </li>
                ))}
                <li>
                  <button type="button" className="tile carte carte-nouveau" onClick={() => setEdition({ declencheur: "mail", sources: {}, autonomy: "je-valide-tout", minutes: 10 })}>
                    <span className="carte-tete">
                      <span className="carte-plus" aria-hidden="true">
                        <Icone nom="plus" taille={18} />
                      </span>
                    </span>
                    <strong>Nouvel agent</strong>
                    <span className="caption">Décris son travail en quelques phrases.</span>
                  </button>
                </li>
              </ul>
            </Bloc>

            <Bloc title="Partir d'un modèle" id="modeles">
              <p className="caption">Pour n'importe quel métier. Tout se modifie ensuite.</p>
              <ul className="cartes" role="list">
                {v.modeles.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="tile carte"
                      onClick={() => setEdition({ name: m.nom, consignes: m.consignes, declencheur: m.declencheur, sources: m.sources, minutes: m.minutes, autonomy: "je-valide-tout" })}
                    >
                      <span className="carte-tete">
                        <Symbole nom={iconePour(m.nom, m.description)} doux />
                        <span className="caption">{m.metier}</span>
                      </span>
                      <strong>{m.nom}</strong>
                      <span className="caption">{m.description}</span>
                      <span className="caption">{quand(m.declencheur)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Bloc>
          </div>

          <div className="span-4 stack">
            <Bloc title="Départements" id="departements" aside={<span className="pill">{v.departements.length}</span>}>
              <ul className="list">
                {v.departements.map((d) => (
                  <li key={d.id} className="actions" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <span className="actions" style={{ flexWrap: "nowrap", gap: "12px" }}>
                      <Symbole nom={iconePour(d.name)} taille="s" style={couleurs(d.couleur)} />
                      <Phrase
                        meta={`${d.membres.map((m) => v.personnes.find((p) => p.id === m)?.name ?? m).join(", ") || "Personne"} · ${d.agents.length} agent${d.agents.length > 1 ? "s" : ""}${d.atelier ? "" : " · installation"}`}
                      >
                        {d.name}
                      </Phrase>
                    </span>
                    {d.atelier && d.agents.length === 0 && (
                      <Button
                        variant="discret"
                        label={`Supprimer le département ${d.name}`}
                        onClick={async () => {
                          await act(`atelier/departements/${d.id}/supprimer`);
                          await charger();
                        }}
                      >
                        Supprimer
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {nouveauDep ? (
                <NouveauDepartement
                  personnes={v.personnes}
                  onDone={async () => {
                    setNouveauDep(false);
                    await charger();
                  }}
                  onCancel={() => setNouveauDep(false)}
                />
              ) : (
                <Button variant="secondaire" onClick={() => setNouveauDep(true)}>
                  Nouveau département
                </Button>
              )}
            </Bloc>
            <Regles initial={v.regles} />
          </div>
        </div>
      )}
      {edition && v && (
        <Editeur
          agent={edition}
          vue={v}
          onClose={() => setEdition(null)}
          onDone={async () => {
            setEdition(null);
            await charger();
          }}
        />
      )}
    </Page>
  );
}

function Regles({ initial }: { initial: string }) {
  const [texte, setTexte] = useState(initial);
  const [etat, setEtat] = useState<string>();
  return (
    <Bloc title="Règles de l'entreprise" id="regles">
      <label className="champ">
        <span className="caption">Tous les agents les lisent avant chaque tâche : ton style, tes limites, ce qu'il ne faut jamais faire.</span>
        <textarea
          id="regles"
          className="field field-large"
          rows={9}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            setEtat(undefined);
          }}
        />
      </label>
      <div className="actions">
        <Button
          variant="principal"
          disabled={texte === initial && !etat}
          onClick={async () => {
            await act("atelier/regles", { texte });
            setEtat("Enregistré. Les agents s'en servent dès leur prochaine tâche.");
          }}
        >
          Enregistrer les règles
        </Button>
        {etat && (
          <span className="caption" role="status">
            {etat}
          </span>
        )}
      </div>
    </Bloc>
  );
}

function NouveauDepartement({ personnes, onDone, onCancel }: { personnes: Vue["personnes"]; onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [couleur, setCouleur] = useState(PALETTE[0]!);
  const [membres, setMembres] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string>();
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await act("atelier/departements", { name, couleur, membres });
      await onDone();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <form className="stack inset" style={{ gap: "var(--space-2)" }} onSubmit={submit}>
      <label className="champ">
        <span>Nom</span>
        <input className="field field-large" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} autoFocus />
      </label>
      <fieldset className="champ">
        <legend>Couleur</legend>
        <div className="actions" style={{ gap: "var(--space-1)" }}>
          {PALETTE.map((c) => (
            <label key={c} className="pastille-choix" style={{ background: c }}>
              <input type="radio" name="couleur" className="sr-only" checked={couleur === c} onChange={() => setCouleur(c)} />
              <span className="sr-only">{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="champ">
        <legend>Qui en fait partie ?</legend>
        {personnes.map((p) => (
          <label key={p.id} className="choix">
            <input type="checkbox" checked={membres.includes(p.id)} onChange={(e) => setMembres(e.target.checked ? [...membres, p.id] : membres.filter((x) => x !== p.id))} />
            {p.name}
          </label>
        ))}
      </fieldset>
      {erreur && (
        <p className="state-attention" role="alert">
          {erreur}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-principal">
          Créer le département
        </button>
        <Button variant="discret" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function Editeur({ agent, vue, onClose, onDone }: { agent: Partial<AgentAtelier>; vue: Vue; onClose: () => void; onDone: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const existant = Boolean(agent.id);
  const [name, setName] = useState(agent.name ?? "");
  const [consignes, setConsignes] = useState(agent.consignes ?? "");
  const [mode, setMode] = useState<"mail" | "quotidien" | "manuel">(agent.declencheur?.startsWith("quotidien") ? "quotidien" : ((agent.declencheur as "mail" | "manuel") ?? "mail"));
  const [heure, setHeure] = useState(agent.declencheur?.match(/(\d{2}:\d{2})$/)?.[1] ?? "08:00");
  const [departement, setDepartement] = useState(agent.departement ?? "");
  const [sources, setSources] = useState<Record<string, string[]>>(agent.sources ?? {});
  const [autonomy, setAutonomy] = useState<Autonomy>(agent.autonomy ?? "je-valide-tout");
  const [minutes, setMinutes] = useState(agent.minutes ?? 10);
  const [erreur, setErreur] = useState<string>();
  const [busy, setBusy] = useState(false);
  useDialogue(ref, onClose);

  const coche = (src: string, d: string, on: boolean) => {
    const actuels = new Set(sources[src] ?? []);
    if (on) actuels.add(d);
    else actuels.delete(d);
    const r = { ...sources, [src]: [...actuels] };
    if (!r[src]!.length) delete r[src];
    setSources(r);
  };
  const declencheur = mode === "quotidien" ? `quotidien ${heure}` : mode;
  const sensibles = Object.entries(sources).flatMap(([s, ds]) => ds.filter((d) => SENSIBLES.has(d)).map((d) => droitLabel(s, d)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErreur(undefined);
    try {
      await act("atelier/agents", { id: agent.id, name, consignes, declencheur, departement, sources, autonomy, minutes });
      ref.current?.close();
      await onDone();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby="editeur-titre" className="dialog-large">
      <form className="stack" style={{ gap: "var(--space-3)" }} onSubmit={submit}>
        <h2 className="title" id="editeur-titre">
          {existant ? `Modifier ${agent.name}` : "Nouvel agent"}
        </h2>
        <label className="champ">
          <span>Nom</span>
          <input className="field field-large" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="Accueil, Relances, Devis…" />
        </label>
        <label className="champ">
          <span>Ce qu'il fait</span>
          <textarea
            className="field field-large"
            rows={8}
            value={consignes}
            onChange={(e) => setConsignes(e.target.value)}
            required
            placeholder={"Écris comme à un nouveau collègue. Par exemple :\n1. Lis chaque demande de devis.\n2. Réponds avec nos tarifs.\n3. Ne promets jamais de délai : demande-moi."}
          />
        </label>
        <div className="editeur-colonnes">
          <fieldset className="champ">
            <legend>Quand ?</legend>
            <label className="choix">
              <input type="radio" name="quand" checked={mode === "mail"} onChange={() => setMode("mail")} />À chaque mail reçu
            </label>
            <label className="choix">
              <input type="radio" name="quand" checked={mode === "quotidien"} onChange={() => setMode("quotidien")} />
              Chaque jour à
              <input type="time" className="field" aria-label="Heure" value={heure} onChange={(e) => setHeure(e.target.value)} disabled={mode !== "quotidien"} style={{ width: 150 }} />
            </label>
            <label className="choix">
              <input type="radio" name="quand" checked={mode === "manuel"} onChange={() => setMode("manuel")} />
              Quand on le lance
            </label>
          </fieldset>
          <label className="champ">
            <span>Département</span>
            <select className="field field-large" value={departement} onChange={(e) => setDepartement(e.target.value)}>
              <option value="">Sans département</option>
              {vue.departements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="champ">
          <legend>Ce qu'il peut utiliser</legend>
          <div className="sources">
            {[...vue.sources].sort((a, b) => rang(ORDRE_SOURCES, a.id) - rang(ORDRE_SOURCES, b.id)).map((s) => (
              <div key={s.id} className="source">
                <strong>{sourceLabel(s.id)}</strong>
                {[...s.droits].sort((a, b) => rang(ORDRE_DROITS, a) - rang(ORDRE_DROITS, b)).map((d) => (
                  <label key={d} className="choix">
                    <input type="checkbox" checked={sources[s.id]?.includes(d) ?? false} onChange={(e) => coche(s.id, d, e.target.checked)} />
                    {droitLabel(s.id, d)}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <div className="editeur-colonnes">
          {!existant && (
            <fieldset className="champ">
              <legend>Au départ</legend>
              {(["je-valide-tout", "je-valide-l-important", "autonome"] as Autonomy[]).map((a) => (
                <label key={a} className="choix">
                  <input type="radio" name="autonomie" checked={autonomy === a} onChange={() => setAutonomy(a)} />
                  {AUTONOMY_LABEL[a]}
                  {a === "je-valide-tout" ? " (conseillé)" : ""}
                </label>
              ))}
            </fieldset>
          )}
          <label className="champ">
            <span>Temps qu'un humain y passerait</span>
            <span className="actions" style={{ gap: "var(--space-1)" }}>
              <input type="number" className="field" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-describedby="minutes-aide" />
              <span id="minutes-aide" className="caption">
                minutes par tâche, pour compter le temps gagné
              </span>
            </span>
          </label>
        </div>
        <p className="inset resume-agent" role="status">
          <strong>{name || "Cet agent"}</strong> travaillera {quand(declencheur).toLowerCase()}
          {Object.keys(sources).length ? ` et pourra ${Object.entries(sources).flatMap(([s, ds]) => ds.map((d) => droitLabel(s, d))).join(", ")}` : ", sans accès à aucune source"}.
          {sensibles.length > 0 && ` Pour ${sensibles.join(", ")} : ${autonomy === "je-valide-tout" ? "tu valides chaque fois" : "selon l'autonomie choisie, avec 2 minutes pour annuler"}.`}
        </p>
        {erreur && (
          <p className="state-attention" role="alert">
            {erreur}
          </p>
        )}
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div className="actions">
            <button type="submit" className="btn btn-principal" disabled={busy}>
              {existant ? "Enregistrer" : "Créer l'agent"}
            </button>
            <Button variant="discret" onClick={() => ref.current?.close()}>
              Annuler
            </Button>
          </div>
          {existant && (
            <Button
              variant="discret"
              onClick={async () => {
                try {
                  await act(`atelier/agents/${agent.id}/supprimer`);
                  ref.current?.close();
                  await onDone();
                } catch (err) {
                  setErreur(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Supprimer l'agent
            </Button>
          )}
        </div>
      </form>
    </dialog>
  );
}
