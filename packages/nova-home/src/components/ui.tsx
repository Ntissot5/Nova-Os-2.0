// Les composants du système de design (DESIGN-SYSTEM.md §3). Un besoin non couvert se résout d'abord
// en composant ceux-ci.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AgentState, Autonomy, State, Task, Why } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { countdown } from "../format";
import { couleurs, iconePour, Symbole } from "./Icones";

/** Une tuile de verre avec son titre. */
export function Bloc({
  title,
  children,
  id,
  className = "",
  aside,
}: {
  title: string;
  children: ReactNode;
  id?: string;
  className?: string;
  aside?: ReactNode;
}) {
  const hid = id ? `${id}-titre` : undefined;
  return (
    <section className={`tile ${className}`} aria-labelledby={hid}>
      <div className="tile-head">
        <h2 id={hid}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Phrase({ children, meta, state }: { children: ReactNode; meta?: ReactNode; state?: "positive" | "attention" | "critical" }) {
  return (
    <div className="phrase">
      <p className={state ? `state-${state}` : undefined}>{children}</p>
      {meta && <p className="caption phrase-meta">{meta}</p>}
    </div>
  );
}

type Variant = "principal" | "secondaire" | "discret";

export function Button({
  variant = "secondaire",
  onClick,
  children,
  href,
  label,
  disabled,
  className,
}: {
  variant?: Variant;
  className?: string;
  onClick?: () => unknown;
  children: ReactNode;
  href?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const cls = `btn btn-${variant}${className ? ` ${className}` : ""}`;
  if (href)
    return (
      <a className={cls} href={href} aria-label={label}>
        {children}
      </a>
    );
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      disabled={disabled || busy}
      onClick={async () => {
        if (!onClick) return;
        setBusy(true);
        try {
          await onClick();
        } catch (e) {
          alert(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function Chiffre({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="phrase">
      <p className="chiffre">{value}</p>
      <p className="muted">{children}</p>
    </div>
  );
}

/** Le symbole d'un agent, avec sa pastille : nombre de validations en attente, ou cercle creux en pause. */
export function Monogram({ agent, large, couleur }: { agent: AgentState; large?: boolean; couleur?: string }) {
  return (
    <Symbole nom={iconePour(agent.name, agent.description)} taille={large ? "xl" : "m"} actif={agent.status === "travaille"} style={couleur ? couleurs(couleur) : undefined}>
      {agent.pending > 0 && <span className="pastille">{agent.pending}</span>}
      {agent.status === "pause" && agent.pending === 0 && <span className="pastille pastille-pause" />}
    </Symbole>
  );
}

/** La couleur du département d'un agent, s'il en a un. */
export const couleurAgent = (state: State, agentId: string) => state.departements?.find((d) => d.agents.includes(agentId))?.couleur;

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  "je-valide-tout": "Je valide tout",
  "je-valide-l-important": "Je valide l'important",
  autonome: "Autonome",
};

const AUTONOMY_SENTENCE: Record<Autonomy, string> = {
  "je-valide-tout": "Rien ne part sans ta validation.",
  "je-valide-l-important":
    "Les actions courantes partent seules, avec un délai pour annuler. Les montants élevés, les envois en nombre et les destinataires inconnus t'attendent.",
  autonome: "Tout part seul, avec un délai pour annuler. Tu reçois un résumé chaque soir.",
};

export function AutonomyPicker({ agent, onChange, lecture }: { agent: AgentState; onChange?: (l: Autonomy) => void; lecture?: boolean }) {
  const levels = Object.keys(AUTONOMY_LABEL) as Autonomy[];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const set = (l: Autonomy) => (lecture ? undefined : onChange ? onChange(l) : act(`agents/${agent.id}/autonomie`, { level: l }));
  return (
    <div className="stack autonomy" style={{ gap: "var(--space-2)" }}>
      <div className="segmented" role="radiogroup" aria-label={`Autonomie de ${agent.name}`}>
        {levels.map((l, i) => {
          const on = agent.autonomy === l;
          return (
            <button
              key={l}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="radio"
              aria-checked={on}
              aria-disabled={lecture || undefined}
              disabled={lecture && !on}
              tabIndex={on ? 0 : -1}
              onClick={() => set(l)}
              onKeyDown={(e) => {
                const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const n = (i + d + levels.length) % levels.length;
                refs.current[n]?.focus();
                set(levels[n]!);
              }}
            >
              {AUTONOMY_LABEL[l]}
            </button>
          );
        })}
      </div>
      <p className="muted">{AUTONOMY_SENTENCE[agent.autonomy]}</p>
      {lecture && <p className="caption">C'est la direction qui règle l'autonomie des agents.</p>}
      <p className="caption">Toujours actifs : tout envoi reste annulable 2 minutes, rien n'est vraiment effacé, et un gros paiement attend toujours un humain.</p>
    </div>
  );
}

/** Compte à rebours d'une action différée : « Envoi dans 1:42 · Annuler ». */
export function Undo({ task, now, agentName }: { task: Task; now: Date; agentName?: string }) {
  if (!task.executeAt) return null;
  const total = (new Date(task.executeAt).getTime() - new Date(task.endedAt ?? task.steps.at(-1)?.at ?? task.startedAt).getTime()) / 1000;
  const left = Math.max(0, (new Date(task.executeAt).getTime() - now.getTime()) / 1000);
  const pct = total > 0 ? Math.min(100, (100 * (total - left)) / total) : 100;
  return (
    <div className="inset">
      <Phrase meta={agentName}>{task.action?.summary}</Phrase>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="actions">
        <span className="muted">
          Part dans <span className="countdown">{countdown(task.executeAt, now)}</span>
        </span>
        <Button variant="secondaire" onClick={() => act(`tasks/${task.id}/annuler`)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

/** « Pourquoi ? » : la règle suivie, les informations utilisées, la raison de la validation. */
export function WhyButton({ why, reason }: { why: Why; reason?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant="discret" onClick={() => ref.current?.showModal()}>
        Pourquoi ?
      </Button>
      <dialog ref={ref} onClick={(e) => e.target === ref.current && ref.current?.close()} aria-labelledby="pourquoi-titre">
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          <h2 className="title" id="pourquoi-titre">
            Pourquoi ?
          </h2>
          <Phrase meta={why.ruleRef}>{why.rule}</Phrase>
          {reason && <Phrase meta="Pourquoi ça t'attend">{reason}.</Phrase>}
          <div className="phrase">
            <p className="caption">Informations utilisées</p>
            <ul>
              {why.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="actions">
            <Button variant="secondaire" onClick={() => ref.current?.close()}>
              Fermer
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Le document qu'un agent écrit, qui se remplit sous les yeux de l'utilisateur. */
export function Doc({ title, body, writing }: { title: string; body: string; writing: boolean }) {
  const shown = useTypewriter(body, writing);
  return (
    <div className="doc" aria-label={`Document : ${title}`}>
      <p className="caption doc-title">{title}</p>
      {shown}
      {writing && <span className="caret" aria-hidden="true" />}
    </div>
  );
}

/** Le texte d'un agent arrive d'un bloc : on le déroule à vitesse de lecture, sauf si le mouvement est réduit. */
function useTypewriter(text: string, active: boolean) {
  const [n, setN] = useState(active ? 0 : text.length);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!active || reduced) return setN(text.length);
    if (n > text.length) return setN(0);
    if (n === text.length) return;
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + 3)), 16);
    return () => clearTimeout(t);
  }, [text, n, active, reduced]);
  return text.slice(0, n);
}

/** Rejoue les étapes d'une tâche passée, une à une. */
export function useReplay(task: Task) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (shown === null || shown >= task.steps.length) return;
    const t = setTimeout(() => setShown(shown + 1), 900);
    return () => clearTimeout(t);
  }, [shown, task.steps.length]);
  return {
    playing: shown !== null && shown < task.steps.length,
    steps: shown === null ? task.steps : task.steps.slice(0, shown),
    play: () => setShown(0),
  };
}

/**
 * Ouvre un <dialog> en modal dès qu'il est monté, et prévient quand il se ferme, quelle qu'en soit la raison
 * (bouton, Échap, après une action). On écoute l'événement natif : sans cela, l'écran croit le dialogue
 * encore ouvert et le suivant ne s'affiche plus.
 */
export function useDialogue(ref: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const fermer = useRef(onClose);
  fermer.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const on = () => fermer.current();
    d.addEventListener("close", on);
    return () => d.removeEventListener("close", on);
  }, [ref]);
}
