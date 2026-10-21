// Demander : une question en français, la réponse en une phrase, et les sources qu'on voit consulter.

import { useEffect, useRef, useState } from "react";
import type { AskEvent } from "../../../nova-server/src/core/types";
import { askStream } from "../api";
import { APP_NAMES } from "../apps";
import { Page } from "../components/Shell";
import { Bloc, Button } from "../components/ui";

const EXEMPLES = [
  "Qui est en retard de loyer, et est-ce que l'un d'eux nous a écrit ?",
  "Qu'est-ce que j'ai dans l'agenda cette semaine ?",
  "Mme Rossi nous a-t-elle appelés ou écrit aujourd'hui ?",
  "Quelles factures fournisseurs restent à payer ?",
];

interface Exchange {
  question: string;
  steps: AskEvent[];
  answer?: AskEvent;
}

export function Demander({ initial }: { initial?: string }) {
  const [text, setText] = useState(initial ?? "");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    input.current?.focus();
    if (initial) void submit(initial);
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setText("");
    setHistory((h) => [{ question, steps: [] }, ...h]);
    const update = (fn: (x: Exchange) => Exchange) => setHistory((h) => [fn(h[0]!), ...h.slice(1)]);
    abort.current = new AbortController();
    try {
      await askStream(
        question,
        (e) => update((x) => (e.type === "etape" ? { ...x, steps: [...x.steps, e] } : { ...x, answer: e })),
        abort.current.signal,
      );
    } catch {
      update((x) => ({ ...x, answer: x.answer ?? { type: "erreur", text: "La connexion a été interrompue." } }));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Demander</h1>
        <p className="muted">Pose une question sur la boîte. Nova cherche dans les mails, l'agenda, la compta, les fichiers et le téléphone.</p>
      </header>

      <div className="stack" style={{ maxWidth: 880 }}>
        <form
          className="tile glass-strong ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <label htmlFor="question" className="sr-only">
            Ta question
          </label>
          <textarea
            id="question"
            ref={input}
            className="ask-input"
            rows={2}
            value={text}
            placeholder="Par exemple : qui est en retard de loyer ?"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(text);
              }
            }}
          />
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="caption">Entrée pour demander · Maj+Entrée pour aller à la ligne</span>
            <Button variant="principal" disabled={busy || !text.trim()} onClick={() => submit(text)}>
              {busy ? "Je cherche…" : "Demander"}
            </Button>
          </div>
        </form>

        {history.length === 0 && (
          <Bloc title="Pour commencer">
            <ul className="list">
              {EXEMPLES.map((q) => (
                <li key={q}>
                  <button type="button" className="suggestion" onClick={() => submit(q)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </Bloc>
        )}

        {history.map((x, i) => (
          <section key={history.length - i} className={`tile${i === 0 ? " glass-strong" : ""}`} aria-live={i === 0 ? "polite" : undefined}>
            <p className="caption">{x.question}</p>
            {x.steps.length > 0 && (
              <ol className="feed">
                {x.steps.map((s, j) => (
                  <li key={j} className={!x.answer && j === x.steps.length - 1 ? "is-last" : undefined}>
                    <span>
                      {s.text}
                      {s.app && (
                        <>
                          {" "}
                          <span className="chip">{APP_NAMES[s.app] ?? s.app}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {!x.answer && x.steps.length === 0 && <p className="muted">Je réfléchis…</p>}
            {x.answer && (
              <>
                <p className={x.answer.type === "erreur" ? "answer state-attention" : "answer"}>{x.answer.text}</p>
                {(x.answer.sources?.length || x.answer.ms) && (
                  <p className="caption actions">
                    {x.answer.sources?.map((s) => (
                      <span key={s} className="pill">
                        {s}
                      </span>
                    ))}
                    {x.answer.ms !== undefined && <span>en {(x.answer.ms / 1000).toLocaleString("fr-CH", { maximumFractionDigits: 1 })} s</span>}
                  </p>
                )}
              </>
            )}
          </section>
        ))}
      </div>
    </Page>
  );
}
