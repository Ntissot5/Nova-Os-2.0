// Connexion au daemon local : l'état arrive en direct (SSE), les décisions partent en POST.

import { useEffect, useState } from "react";
import type { AskEvent, State } from "../../nova-server/src/core/types";

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

/** Pose une question : les étapes et la réponse arrivent en flux, au fil de l'eau. */
export async function askStream(question: string, onEvent: (e: AskEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nova": "1" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok || !res.body) {
    const { erreur } = await res.json().catch(() => ({ erreur: "Le service Nova ne répond pas." }));
    return onEvent({ type: "erreur", text: erreur });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const data = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
      buf = buf.slice(i + 2);
      if (data) onEvent(JSON.parse(data.slice(6)));
    }
  }
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
