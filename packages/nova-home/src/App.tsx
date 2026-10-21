import { useEffect } from "react";
import { useNovaState, useNow } from "./api";
import { Backdrop, Page, Rail } from "./components/Shell";
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

  return (
    <>
      <Backdrop />
      <Rail state={state} route={route} />
      {!online && (
        <p className="banner banner-offline pill" role="status">
          Connexion perdue. Reconnexion…
        </p>
      )}
      {route.name === "design" ? (
        <Design />
      ) : !state ? (
        <Page>
          <p className="muted" role="status">
            {online ? "Ouverture de l'entreprise…" : "Le service Nova ne répond pas. Il redémarre tout seul ; réessaie dans un instant."}
          </p>
        </Page>
      ) : route.name === "agent" ? (
        <Agent state={state} id={route.id} now={now} />
      ) : (
        <Entreprise state={state} now={now} />
      )}
    </>
  );
}
