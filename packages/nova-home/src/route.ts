import { useEffect, useState } from "react";

export type Route = { name: "entreprise" } | { name: "agent"; id: string } | { name: "design" } | { name: "demander"; q?: string };

function parse(hash: string): Route {
  const m = hash.match(/^#\/agents\/([\w-]+)/);
  if (m) return { name: "agent", id: m[1]! };
  if (hash.startsWith("#/design")) return { name: "design" };
  if (hash.startsWith("#/demander")) return { name: "demander", q: new URLSearchParams(hash.split("?")[1] ?? "").get("q") ?? undefined };
  return { name: "entreprise" };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (hash: string) => (location.hash = hash);
