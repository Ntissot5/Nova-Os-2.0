// Connexion au daemon local : l'état arrive en direct (SSE), les décisions partent en POST.

import { useEffect, useState } from "react";
import type { State } from "../../nova-daemon/src/types";

export function useNovaState(): { state: State | null; online: boolean } {
  const [state, setState] = useState<State | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const es = new EventSource("/api/live");
    es.addEventListener("state", (e) => {
      setState(JSON.parse((e as MessageEvent).data));
      setOnline(true);
    });
    es.onerror = () => setOnline(false);
    return () => es.close();
  }, []);
  return { state, online };
}

/** L'horloge de l'interface : rafraîchit les comptes à rebours et les « il y a 2 min ». */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export async function act(path: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nova": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const { erreur } = await res.json().catch(() => ({ erreur: "Erreur inconnue." }));
    throw new Error(erreur);
  }
}
