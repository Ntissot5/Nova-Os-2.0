// Le catalogue : les services (Microsoft 365 a sa propre connexion en un clic, hors catalogue) que les PME suisses utilisent le plus, pour démarrer vite.
// Nova ne promet pas d'adresse : chaque éditeur publie (ou non) son serveur MCP, et l'adresse se colle
// depuis ses réglages. « Autre service » accepte n'importe quel serveur MCP distant.

export interface Fiche {
  nom: string;
  categorie: string;
  description: string;
  aide: string;
}

export const CATALOGUE: Fiche[] = [
  { nom: "Google Workspace", categorie: "Bureautique", description: "Gmail, Agenda, Drive et Docs.", aide: "L'adresse MCP et le jeton se créent dans la console d'administration Google." },
  { nom: "bexio", categorie: "Comptabilité", description: "Factures, clients, paiements et salaires.", aide: "Un jeton d'API se crée dans les réglages bexio ; colle aussi l'adresse MCP fournie." },
  { nom: "Abacus", categorie: "Comptabilité", description: "Comptabilité, débiteurs et créanciers.", aide: "Ton intégrateur Abacus te donne l'adresse MCP et le jeton." },
  { nom: "Banque (eBanking)", categorie: "Finance", description: "Soldes, mouvements et ordres de paiement.", aide: "Si ta banque propose un serveur MCP, son adresse est dans l'eBanking, rubrique API." },
  { nom: "HubSpot", categorie: "Clients", description: "Contacts, entreprises et affaires.", aide: "Le jeton se crée dans HubSpot, rubrique Intégrations, applications privées." },
  { nom: "Slack", categorie: "Communication", description: "Canaux, messages et recherche.", aide: "L'adresse MCP et le jeton s'obtiennent depuis l'administration de l'espace Slack." },
  { nom: "Notion", categorie: "Documents", description: "Pages, bases et notes d'équipe.", aide: "L'adresse MCP et le jeton s'obtiennent dans les réglages Notion, Connexions." },
  { nom: "Logiciel de gérance", categorie: "Immobilier", description: "Immeubles, baux, locataires et décomptes.", aide: "Demande à l'éditeur de ton logiciel de gérance l'adresse de son serveur MCP." },
];
