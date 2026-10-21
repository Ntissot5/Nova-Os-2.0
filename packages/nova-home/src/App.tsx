import { useEffect } from "react";
import { useNovaState, useNow } from "./api";
import { useRoute } from "./route";
import { Agent } from "./screens/Agent";
import { Design } from "./screens/Design";
import { Entreprise } from "./screens/Entreprise";

export function App() {
  const { state, online } = useNovaState();
  const route = useRoute();
  const now = useNow();

  useEffect(() => {
    if (!state) return;
    const agent = route.name === "agent" ? state.agents.find((a) => a.id === route.id) : undefined;
    document.title = agent ? agent.name : route.name === "design" ? "Système de design" : state.company.name;
  }, [state, route]);

  if (route.name === "design") return <Design />;
  if (!state)
    return (
      <main className="page">
        <p className="muted" role="status">
          {online ? "Ouverture de l'entreprise…" : "Le service Nova ne répond pas. Il redémarre tout seul ; réessaie dans un instant."}
        </p>
      </main>
    );

  return (
    <>
      {!online && (
        <p className="banner banner-offline" role="status">
          Connexion perdue. Reconnexion…
        </p>
      )}
      {state.demo && (
        <p className="banner banner-demo">
          Démonstration : données fictives
        </p>
      )}
      {route.name === "agent" ? <Agent state={state} id={route.id} now={now} /> : <Entreprise state={state} now={now} me={state.me} />}
    </>
  );
}
