// La flotte : chaque poste, sa version, revenir en arrière ; chaque personne, révoquer ou rétablir son accès.
// Réservé au dirigeant. Les opérations sont faites par le système, à la demande du gardien.

import { useEffect, useRef, useState } from "react";
import { act } from "../api";
import { Page } from "../components/Shell";
import { Bloc, Button, Phrase } from "../components/ui";
import { relative } from "../format";

interface Flotte {
  postes: { nom: string; role: string; nova: string; systeme: string; generations: { numero: number; date: string; actuelle: boolean }[] }[];
  personnes: { id: string; nom: string; role: string; revoque: boolean }[];
}

export function FlotteScreen({ now }: { now: Date }) {
  const [f, setF] = useState<Flotte | null>(null);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const confirm = useRef<HTMLDialogElement>(null);
  const load = () =>
    fetch("/api/flotte")
      .then(async (r) => (r.ok ? setF(await r.json()) : setError((await r.json()).erreur)))
      .catch(() => setError("Le service Nova ne répond pas."));
  useEffect(() => void load(), []);

  return (
    <Page>
      <header className="topline hero-text">
        <h1 className="display">Flotte</h1>
        <p className="muted">Les postes de l'entreprise, leur version, et qui y a accès.</p>
      </header>
      <div className="stack" style={{ maxWidth: 880 }}>
        {error && <p className="state-attention">{error}</p>}
        {message && (
          <p className="pill" role="status" style={{ justifySelf: "start" }}>
            {message}
          </p>
        )}
        {f?.postes.map((p) => {
          const current = p.generations.find((g) => g.actuelle);
          const previous = p.generations.find((g) => current && g.numero < current.numero);
          return (
            <Bloc key={p.nom} title={p.nom} className="glass-strong" aside={<span className="pill">{p.role}</span>}>
              <Phrase meta={`NixOS ${p.systeme}`}>
                Nova {p.nova}
                {current ? `, version n° ${current.numero} du système, installée ${relative(current.date, now)}` : ""}.
              </Phrase>
              {previous ? (
                <div className="actions">
                  <Button variant="secondaire" onClick={() => confirm.current?.showModal()}>
                    Revenir à la version n° {previous.numero}
                  </Button>
                  <span className="caption">installée {relative(previous.date, now)}</span>
                </div>
              ) : (
                <p className="caption">Aucune version précédente sur ce poste.</p>
              )}
              <dialog ref={confirm} aria-labelledby="retour-titre">
                <div className="stack" style={{ gap: "var(--space-3)" }}>
                  <h2 className="title" id="retour-titre">
                    Revenir à la version précédente ?
                  </h2>
                  <p>Le poste repasse à la version n° {previous?.numero}. Les données de l'entreprise ne changent pas. Les fenêtres ouvertes peuvent se fermer quelques secondes.</p>
                  <div className="actions">
                    <Button
                      variant="principal"
                      onClick={async () => {
                        await act("flotte/retour");
                        confirm.current?.close();
                        setMessage("Retour à la version précédente en cours.");
                      }}
                    >
                      Revenir en arrière
                    </Button>
                    <Button variant="discret" onClick={() => confirm.current?.close()}>
                      Annuler
                    </Button>
                  </div>
                </div>
              </dialog>
            </Bloc>
          );
        })}
        {f && (
          <Bloc title="Accès">
            <ul className="list">
              {f.personnes.map((p) => (
                <li key={p.id} className="actions" style={{ justifyContent: "space-between" }}>
                  <Phrase meta={p.revoque ? "Accès révoqué" : p.role === "dirigeant" ? "Dirigeant" : "Employé"} state={p.revoque ? "attention" : undefined}>
                    {p.nom}
                  </Phrase>
                  {p.role !== "dirigeant" &&
                    (p.revoque ? (
                      <Button variant="secondaire" onClick={() => act(`flotte/retablir/${p.id}`).then(load)}>
                        Rétablir l'accès
                      </Button>
                    ) : (
                      <Button variant="discret" onClick={() => act(`flotte/revoquer/${p.id}`).then(load)}>
                        Révoquer l'accès
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
            <p className="caption">Révoquer verrouille le compte, ferme sa session et coupe son accès à Nova, tout de suite. Rien n'est effacé.</p>
          </Bloc>
        )}
      </div>
    </Page>
  );
}
