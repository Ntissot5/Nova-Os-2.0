// « Envoyer à… » : un dossier passe d'un département à un autre, avec la tâche dont il vient.

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { State } from "../../../nova-server/src/core/types";
import { act } from "../api";
import { Button, useDialogue } from "./ui";

export function Envoyer({
  state,
  depuis,
  titre: titreInitial = "",
  tache,
  onClose,
}: {
  state: State;
  depuis?: string;
  titre?: string;
  tache?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // On peut envoyer à n'importe quel département de l'entreprise, même ceux qu'on ne voit pas.
  const tous = state.annuaire ?? [];
  const cibles = tous.filter((d) => d.id !== depuis);
  const [vers, setVers] = useState(cibles[0]?.id ?? "");
  const [titre, setTitre] = useState(titreInitial);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState<string>();
  const [busy, setBusy] = useState(false);
  useDialogue(ref, onClose);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErreur(undefined);
    try {
      await act("relais", { de: depuis, vers, titre, message, tache });
      ref.current?.close();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby="envoyer-titre">
      <form className="stack" style={{ gap: "var(--space-3)" }} onSubmit={submit}>
        <h2 className="title" id="envoyer-titre">
          Envoyer à un département
        </h2>
        <fieldset className="champ">
          <legend>À qui ?</legend>
          {cibles.map((d) => (
            <label key={d.id} className="choix">
              <input type="radio" name="vers" checked={vers === d.id} onChange={() => setVers(d.id)} />
              <Pastille d={d} />
              {d.name}
            </label>
          ))}
        </fieldset>
        <label className="champ">
          <span>Titre</span>
          <input className="field field-large" value={titre} onChange={(e) => setTitre(e.target.value)} required maxLength={120} />
        </label>
        <label className="champ">
          <span>Message</span>
          <textarea className="field field-large" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
        </label>
        {tache && <p className="caption">Le dossier part avec la tâche de l'agent : ses étapes, son résultat et ses sources.</p>}
        {erreur && (
          <p className="state-attention" role="alert">
            {erreur}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn btn-principal" disabled={busy || !vers}>
            {`Envoyer à ${tous.find((d) => d.id === vers)?.name ?? "…"}`}
          </button>
          <Button variant="discret" onClick={() => ref.current?.close()}>
            Annuler
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export { couleurs } from "./Icones";

/** La pastille de couleur d'un département. */
export function Pastille({ d, size = 12 }: { d: { couleur: string }; size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: d.couleur, flex: "none", display: "inline-block" }} />;
}
