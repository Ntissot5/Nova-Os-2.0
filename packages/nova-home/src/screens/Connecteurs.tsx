// Connecteurs : l'endroit où le dirigeant branche tous les services de l'entreprise.
// Les cinq sources de Nova sont intégrées ; n'importe quel service qui expose un serveur MCP s'ajoute ici.
// Tout passe par le gardien : droits par agent, journal, et par défaut une validation pour chaque action.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { act } from "../api";
import { Page } from "../components/Shell";
import { Bloc, Button, Phrase } from "../components/ui";
import { plural, relative } from "../format";

interface Ajoute {
  id: string;
  nom: string;
  url: string;
  agents: string[];
  acces: "lecture" | "actions";
  toujoursValider: boolean;
  ajouteLe: string;
  avecJeton: boolean;
  etat: "branche" | "erreur";
  erreur?: string;
  outils: { nom: string; titre: string; lecture: boolean }[];
}

interface Fiche {
  nom: string;
  categorie: string;
  description: string;
  aide: string;
}

interface Liste {
  integres: { id: string; outils: number }[];
  ajoutes: Ajoute[];
  catalogue: Fiche[];
  agents: { id: string; nom: string }[];
}

const INTEGRES: Record<string, string> = { mail: "Mail", agenda: "Agenda", fichiers: "Fichiers", compta: "Comptabilité", telephone: "Téléphonie" };

type EtatMicrosoft =
  | { etat: "indisponible"; raison: string }
  | { etat: "deconnecte" }
  | { etat: "en-attente"; code: string; adresse: string; expire: string }
  | { etat: "connecte"; compte: string; nom?: string; depuis: string; services: string[] }
  | { etat: "erreur"; erreur: string };

type Formulaire = { mode: "ajouter"; fiche?: Fiche } | { mode: "regler"; connecteur: Ajoute };

export function ConnecteursScreen({ now }: { now: Date }) {
  const [l, setL] = useState<Liste | null>(null);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState<Formulaire>();
  const load = () =>
    fetch("/api/connecteurs")
      .then(async (r) => (r.ok ? setL(await r.json()) : setError((await r.json()).erreur)))
      .catch(() => setError("Le service Nova ne répond pas."));
  useEffect(() => void load(), []);
  const nomAgent = (id: string) => l?.agents.find((a) => a.id === id)?.nom ?? id;
  const [ms, setMs] = useState<EtatMicrosoft>();
  const loadMs = () =>
    fetch("/api/microsoft")
      .then((r) => (r.ok ? r.json() : undefined))
      .then(setMs)
      .catch(() => {});
  useEffect(() => void loadMs(), []);
  // Pendant que le dirigeant tape le code chez Microsoft, on regarde toutes les 2 secondes si c'est fait.
  useEffect(() => {
    if (ms?.etat !== "en-attente") return;
    const t = setInterval(loadMs, 2000);
    return () => clearInterval(t);
  }, [ms?.etat]);
  const outlook = ms?.etat === "connecte" ? ms : undefined;

  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Connecteurs</h1>
        <p className="muted">Tous les services de l'entreprise, branchés au même endroit. Les agents ne voient que ce que tu leur donnes.</p>
      </header>
      <div className="stack" style={{ maxWidth: 880 }}>
        {error && <p className="state-attention">{error}</p>}
        {ms && <MicrosoftTile ms={ms} now={now} onChange={setMs} />}
        {l && (
          <Bloc title="Branchés" className="glass-strong" aside={<span className="pill">{l.integres.length + l.ajoutes.length}</span>}>
            <ul className="list">
              {l.integres.map((c) => (
                <li key={c.id}>
                  <Phrase
                    meta={`${outlook && (c.id === "mail" || c.id === "agenda") ? `Outlook · ${outlook.compte}` : "Intégré à Nova"} · ${plural(c.outils, "outil", "outils")}`}
                    state="positive"
                  >
                    {INTEGRES[c.id] ?? c.id}
                  </Phrase>
                </li>
              ))}
              {l.ajoutes.map((c) => (
                <li key={c.id} className="actions" style={{ justifyContent: "space-between" }}>
                  <Phrase
                    state={c.etat === "branche" ? "positive" : "attention"}
                    meta={
                      c.etat === "branche"
                        ? `${plural(c.outils.length, "outil", "outils")} · ${c.acces === "actions" ? "lecture et actions" : "lecture seule"} · ${c.agents.length ? c.agents.map(nomAgent).join(", ") : "aucun agent"}${c.acces === "actions" ? (c.toujoursValider ? " · chaque action validée" : " · selon l'autonomie") : ""} · ajouté ${relative(c.ajouteLe, now)}`
                        : `Ne répond pas : ${c.erreur}`
                    }
                  >
                    {c.nom}
                  </Phrase>
                  <span className="actions">
                    <Button variant="secondaire" onClick={() => setForm({ mode: "regler", connecteur: c })}>
                      Régler
                    </Button>
                    <Button
                      variant="discret"
                      label={`Retirer ${c.nom}`}
                      onClick={async () => {
                        if (!confirm(`Retirer ${c.nom} ? Les agents ne pourront plus s'en servir. Son jeton est effacé du Hub.`)) return;
                        await act(`connecteurs/${c.id}/retirer`);
                        await load();
                      }}
                    >
                      Retirer
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Bloc>
        )}
        {l && (
          <Bloc title="Ajouter un service">
            <p className="caption">N'importe quel service qui propose un serveur MCP se branche ici : son adresse, et un jeton s'il en demande un.</p>
            <ul className="catalogue" role="list">
              {l.catalogue.map((f) => (
                <li key={f.nom}>
                  <button type="button" className="tile fiche" onClick={() => setForm({ mode: "ajouter", fiche: f })}>
                    <span className="caption">{f.categorie}</span>
                    <strong>{f.nom}</strong>
                    <span className="caption">{f.description}</span>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="tile fiche fiche-autre" onClick={() => setForm({ mode: "ajouter" })}>
                  <span className="caption">Tout le reste</span>
                  <strong>Autre service</strong>
                  <span className="caption">Colle l'adresse de son serveur MCP.</span>
                </button>
              </li>
            </ul>
          </Bloc>
        )}
      </div>
      {form && l && (
        <Dialogue
          form={form}
          agents={l.agents}
          onClose={() => setForm(undefined)}
          onDone={async () => {
            setForm(undefined);
            await load();
          }}
        />
      )}
    </Page>
  );
}

function MicrosoftTile({ ms, now, onChange }: { ms: EtatMicrosoft; now: Date; onChange: (e: EtatMicrosoft) => void }) {
  const post = async (path: string) => {
    const r = await fetch(`/api/microsoft/${path}`, { method: "POST", headers: { "x-nova": "1" } });
    const body = await r.json();
    if (!r.ok) throw new Error(body.erreur);
    if (path === "deconnecter") onChange({ etat: "deconnecte" });
    else onChange(body);
  };
  return (
    <Bloc title="Microsoft 365" id="microsoft" className="glass-strong" aside={ms.etat === "connecte" ? <span className="pill state-positive">Connecté</span> : undefined}>
      {ms.etat === "connecte" ? (
        <>
          <Phrase meta={`${ms.services.join(" et ")} passent par Outlook · connecté ${relative(ms.depuis, now)}`}>{ms.nom ? `${ms.nom} (${ms.compte})` : ms.compte}</Phrase>
          <div className="actions">
            <Button variant="discret" onClick={() => post("deconnecter")}>
              Déconnecter
            </Button>
          </div>
        </>
      ) : ms.etat === "en-attente" ? (
        <div className="stack" style={{ gap: "var(--space-2)" }} role="status">
          <p>
            Ouvre{" "}
            <a href={ms.adresse} target="_blank" rel="noreferrer">
              {ms.adresse.replace(/^https:\/\//, "")}
            </a>{" "}
            et tape ce code :
          </p>
          <p className="code-connexion" aria-label={`Code : ${ms.code.split("").join(" ")}`}>
            {ms.code}
          </p>
          <p className="caption">Connecte-toi avec le compte Microsoft de l'entreprise et accepte. Cette page se met à jour toute seule.</p>
          <div className="actions">
            <Button variant="discret" onClick={() => navigator.clipboard?.writeText(ms.code)}>
              Copier le code
            </Button>
          </div>
        </div>
      ) : ms.etat === "indisponible" ? (
        <p className="caption">{ms.raison}</p>
      ) : (
        <>
          <p>Mail et agenda Outlook en un clic. Les agents travaillent dans ta vraie boîte, et leurs brouillons apparaissent aussi dans Outlook.</p>
          {ms.etat === "erreur" && (
            <p className="state-attention" role="alert">
              {ms.erreur}
            </p>
          )}
          <div className="actions">
            <Button variant="principal" onClick={() => post("connecter")}>
              Se connecter avec Microsoft
            </Button>
          </div>
        </>
      )}
    </Bloc>
  );
}

function Dialogue({ form, agents, onClose, onDone }: { form: Formulaire; agents: Liste["agents"]; onClose: () => void; onDone: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const existant = form.mode === "regler" ? form.connecteur : undefined;
  const [nom, setNom] = useState(existant?.nom ?? (form.mode === "ajouter" ? (form.fiche?.nom ?? "") : ""));
  const [url, setUrl] = useState("");
  const [jeton, setJeton] = useState("");
  const [choisis, setChoisis] = useState<string[]>(existant?.agents ?? []);
  const [acces, setAcces] = useState<"lecture" | "actions">(existant?.acces ?? "lecture");
  const [valider, setValider] = useState(existant?.toujoursValider ?? true);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string>();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErreur(undefined);
    try {
      const reglages = { agents: choisis, acces, toujoursValider: valider };
      if (existant) await act(`connecteurs/${existant.id}/regler`, { ...reglages, jeton: jeton || undefined });
      else await act("connecteurs", { nom, url, jeton: jeton || undefined, ...reglages });
      await onDone();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby="connecteur-titre" onClose={onClose}>
      <form className="stack" style={{ gap: "var(--space-3)" }} onSubmit={submit}>
        <h2 className="title" id="connecteur-titre">
          {existant ? `Régler ${existant.nom}` : form.mode === "ajouter" && form.fiche ? `Brancher ${form.fiche.nom}` : "Brancher un service"}
        </h2>
        {form.mode === "ajouter" && form.fiche && <p className="caption">{form.fiche.aide}</p>}
        {!existant && (
          <>
            <label className="champ">
              <span>Nom</span>
              <input className="field field-large" value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={60} />
            </label>
            <label className="champ">
              <span>Adresse du serveur MCP</span>
              <input className="field field-large" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required />
            </label>
            <label className="champ">
              <span>Jeton d'accès (s'il en demande un)</span>
              <input className="field field-large" type="password" autoComplete="off" value={jeton} onChange={(e) => setJeton(e.target.value)} />
              <span className="caption">Gardé sur le Hub uniquement. Il n'est ni affiché, ni exporté.</span>
            </label>
          </>
        )}
        {existant && (
          <>
            {existant.outils.length > 0 && (
              <p className="caption">
                {existant.outils.length} outils : {existant.outils.map((o) => o.titre).join(", ")}.
              </p>
            )}
            <label className="champ">
              <span>{existant.etat === "erreur" ? "Jeton d'accès" : "Nouveau jeton (laisser vide pour garder l'actuel)"}</span>
              <input className="field field-large" type="password" autoComplete="off" value={jeton} onChange={(e) => setJeton(e.target.value)} />
            </label>
          </>
        )}
        <fieldset className="champ">
          <legend>Quels agents peuvent s'en servir ?</legend>
          {agents.map((a) => (
            <label key={a.id} className="choix">
              <input type="checkbox" checked={choisis.includes(a.id)} onChange={(e) => setChoisis(e.target.checked ? [...choisis, a.id] : choisis.filter((x) => x !== a.id))} />
              {a.nom}
            </label>
          ))}
          <span className="caption">Tout le monde peut l'interroger en lecture depuis Demander.</span>
        </fieldset>
        <fieldset className="champ">
          <legend>Ce qu'ils peuvent faire</legend>
          <label className="choix">
            <input type="radio" name="acces" checked={acces === "lecture"} onChange={() => setAcces("lecture")} />
            Lire seulement
          </label>
          <label className="choix">
            <input type="radio" name="acces" checked={acces === "actions"} onChange={() => setAcces("actions")} />
            Lire et agir (créer, modifier, envoyer)
          </label>
          {acces === "actions" && (
            <label className="choix">
              <input type="checkbox" checked={valider} onChange={(e) => setValider(e.target.checked)} />
              Chaque action attend ma validation (recommandé)
            </label>
          )}
        </fieldset>
        {erreur && (
          <p className="state-attention" role="alert">
            {erreur}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn btn-principal" disabled={busy}>
            {busy ? "Connexion…" : existant ? "Enregistrer" : "Brancher"}
          </button>
          <Button variant="discret" onClick={() => ref.current?.close()}>
            Annuler
          </Button>
        </div>
      </form>
    </dialog>
  );
}
