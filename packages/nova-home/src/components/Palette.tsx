// La palette (⌘K / Ctrl+K) : aller n'importe où, faire n'importe quoi, sans souris ni menus.
// Taper filtre ; Entrée exécute ; une phrase qui ne correspond à rien devient une question pour Demander.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { State } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { go } from "../route";
import { useDialogue } from "./ui";

interface Commande {
  id: string;
  label: string;
  groupe: string;
  mots?: string;
  run: () => unknown;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function usePalette() {
  // Un numéro plutôt qu'un booléen : chaque ouverture monte une palette neuve, même si l'ancienne
  // finit tout juste de se fermer. ⌘K regarde l'écran, pas un état qui pourrait avoir un temps de retard.
  const [ouverture, setOuverture] = useState(0);
  useEffect(() => {
    const ouvrir = () => setOuverture((n) => n + 1);
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      const visible = document.querySelector<HTMLDialogElement>("dialog.palette[open]");
      if (visible) visible.close();
      else ouvrir();
    };
    addEventListener("keydown", on);
    addEventListener("nova:palette", ouvrir);
    return () => {
      removeEventListener("keydown", on);
      removeEventListener("nova:palette", ouvrir);
    };
  }, []);
  /** Une palette ne ferme qu'elle-même : sa fermeture tardive ne doit pas emporter la suivante. */
  const fermer = useCallback((n: number) => setOuverture((actuelle) => (actuelle === n ? 0 : actuelle)), []);
  return { ouverture, fermer };
}

export const ouvrirPalette = () => dispatchEvent(new Event("nova:palette"));

export function Palette({ state, dirigeant, onClose }: { state: State | null; dirigeant: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [actif, setActif] = useState(0);
  const [message, setMessage] = useState<string>();
  useDialogue(ref, onClose);

  const commandes = useMemo<Commande[]>(() => {
    const c: Commande[] = [];
    const nom = new Map(state?.agents.map((a) => [a.id, a.name]) ?? []);
    for (const t of state?.tasks.filter((x) => x.status === "en-attente") ?? [])
      c.push(
        { id: `v-${t.id}`, groupe: "À valider", label: `Valider : ${t.action?.summary ?? t.title}`, mots: nom.get(t.agentId), run: () => act(`approvals/${t.id}/valider`).then(() => setMessage("Validé.")) },
        { id: `r-${t.id}`, groupe: "À valider", label: `Refuser : ${t.action?.summary ?? t.title}`, mots: nom.get(t.agentId), run: () => act(`approvals/${t.id}/refuser`).then(() => setMessage("Refusé.")) },
      );
    for (const t of state?.tasks.filter((x) => x.status === "differe") ?? [])
      c.push({ id: `a-${t.id}`, groupe: "Va partir", label: `Annuler : ${t.action?.summary ?? t.title}`, run: () => act(`tasks/${t.id}/annuler`).then(() => setMessage("Annulé.")) });
    c.push({ id: "accueil", groupe: "Aller à", label: "Entreprise", mots: "accueil direction maison", run: () => go("#/") });
    for (const d of state?.departements ?? []) c.push({ id: `d-${d.id}`, groupe: "Aller à", label: d.name, mots: "département", run: () => go(`#/departements/${d.id}`) });
    for (const a of state?.agents ?? []) c.push({ id: `g-${a.id}`, groupe: "Aller à", label: `Agent ${a.name}`, mots: a.description, run: () => go(`#/agents/${a.id}`) });
    c.push({ id: "demander", groupe: "Aller à", label: "Demander", mots: "question chercher", run: () => go("#/demander") });
    if (dirigeant)
      c.push(
        { id: "atelier", groupe: "Construire", label: "Atelier : agents, départements, règles", mots: "créer construire", run: () => go("#/atelier") },
        { id: "nouvel-agent", groupe: "Construire", label: "Créer un agent", mots: "nouveau atelier", run: () => go("#/atelier") },
        { id: "reglages", groupe: "Réglages", label: "Réglages", mots: "paramètres", run: () => go("#/reglages") },
        { id: "connecteurs", groupe: "Réglages", label: "Connecteurs", mots: "microsoft outlook brancher service mcp", run: () => go("#/connecteurs") },
        { id: "couts", groupe: "Réglages", label: "Coûts de l'IA", mots: "prix facture", run: () => go("#/couts") },
        { id: "flotte", groupe: "Réglages", label: "Flotte : postes et accès", mots: "révoquer version", run: () => go("#/flotte") },
      );
    return c;
  }, [state, dirigeant]);

  const resultats = useMemo(() => {
    const mots = norm(q).split(/\s+/).filter(Boolean);
    const r = mots.length ? commandes.filter((c) => mots.every((m) => norm(`${c.label} ${c.groupe} ${c.mots ?? ""}`).includes(m))) : commandes;
    // Rien ne correspond, ou c'est une vraie phrase : on propose toujours de la poser à Demander.
    if (q.trim().length > 2) r.push({ id: "question", groupe: "Demander", label: `Demander : « ${q.trim()} »`, run: () => go(`#/demander?q=${encodeURIComponent(q.trim())}`) });
    return r.slice(0, 40);
  }, [q, commandes]);

  useEffect(() => setActif(0), [q]);
  useEffect(() => document.getElementById(`palette-${resultats[actif]?.id}`)?.scrollIntoView({ block: "nearest" }), [actif, resultats]);

  async function executer(c?: Commande) {
    if (!c) return;
    // Valider, refuser, annuler : la palette reste ouverte pour enchaîner. Le reste : on ferme d'abord, puis on y va.
    const enchaine = c.id.startsWith("v-") || c.id.startsWith("r-") || c.id.startsWith("a-");
    try {
      if (!enchaine) ref.current?.close();
      await c.run();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  let groupe = "";
  return (
    <dialog ref={ref} className="palette" aria-label="Aller à ou faire quelque chose" onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <input
        className="palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-liste"
        aria-activedescendant={resultats[actif] ? `palette-${resultats[actif]!.id}` : undefined}
        aria-label="Aller à, valider, créer, ou poser une question"
        placeholder="Aller à, valider, créer… ou pose une question"
        value={q}
        autoFocus
        onChange={(e) => {
          setQ(e.target.value);
          setMessage(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActif((i) => Math.min(i + 1, resultats.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActif((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            void executer(resultats[actif]);
          }
        }}
      />
      {message && (
        <p className="pill" role="status" style={{ justifySelf: "start" }}>
          {message}
        </p>
      )}
      <ul id="palette-liste" role="listbox" className="palette-liste" aria-label="Résultats">
        {resultats.map((c, i) => {
          const titre = c.groupe !== groupe ? (groupe = c.groupe) : undefined;
          return (
            <li key={c.id} role="presentation">
              {titre && (
                <p className="caption palette-groupe" aria-hidden="true">
                  {titre}
                </p>
              )}
              <div id={`palette-${c.id}`} role="option" aria-selected={i === actif} className="palette-option" onMouseMove={() => setActif(i)} onClick={() => void executer(c)}>
                {c.label}
              </div>
            </li>
          );
        })}
        {resultats.length === 0 && <li className="muted palette-vide">Rien ne correspond.</li>}
      </ul>
      <p className="caption palette-aide" aria-hidden="true">
        ↑ ↓ pour choisir · Entrée pour faire · Échap pour fermer
      </p>
    </dialog>
  );
}
