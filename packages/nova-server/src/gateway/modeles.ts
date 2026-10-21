// Les modèles d'agents de l'Atelier : des points de départ pour n'importe quelle entreprise.
// Chacun se modifie entièrement après coup ; ce sont des consignes en français, pas du code.

export interface Modele {
  id: string;
  nom: string;
  metier: string; // pour regrouper : « Tous métiers », « Finance »…
  description: string;
  declencheur: "mail" | "manuel" | `quotidien ${string}`;
  sources: Record<string, string[]>;
  consignes: string;
  minutes: number;
}

export const MODELES: Modele[] = [
  {
    id: "boite-de-reception",
    nom: "Boîte de réception",
    metier: "Tous métiers",
    description: "Trie chaque mail reçu, repère l'urgent et prépare les réponses simples.",
    declencheur: "mail",
    sources: { mail: ["read", "draft", "send"], fichiers: ["read"] },
    consignes: `Pour chaque mail reçu :
1. Dis en une phrase ce que la personne demande.
2. Si c'est urgent (panne, menace de résiliation, délai légal, client mécontent), propose une réponse tout de suite et signale-le.
3. Si la réponse se trouve dans nos documents, prépare-la. Sinon, prépare un accusé de réception poli qui dit quand nous reviendrons vers la personne.
4. Les publicités et les notifications automatiques : ne fais rien.`,
    minutes: 6,
  },
  {
    id: "factures-impayees",
    nom: "Factures impayées",
    metier: "Finance",
    description: "Repère les factures en retard et prépare des rappels courtois, puis fermes.",
    declencheur: "quotidien 08:00",
    sources: { compta: ["read"], mail: ["draft", "send"] },
    consignes: `Chaque matin :
1. Liste les factures échues et non payées.
2. Premier rappel courtois à 10 jours de retard, deuxième rappel ferme à 30 jours, en rappelant le montant et la date d'échéance.
3. Ne relance jamais deux fois la même facture la même semaine.
4. Au-delà de 60 jours, ne relance pas : signale le dossier à la direction.`,
    minutes: 10,
  },
  {
    id: "fournisseurs",
    nom: "Factures fournisseurs",
    metier: "Finance",
    description: "Vérifie les factures reçues et prépare les paiements à valider.",
    declencheur: "quotidien 07:30",
    sources: { compta: ["read", "payment"], fichiers: ["read"] },
    consignes: `Chaque matin :
1. Prends les factures fournisseurs reçues et non payées.
2. Vérifie que le montant correspond à la commande ou au contrat, et qu'elle n'a pas déjà été payée.
3. Prépare l'ordre de paiement pour l'échéance. Signale toute différence au lieu de payer.`,
    minutes: 8,
  },
  {
    id: "demandes-clients",
    nom: "Demandes clients",
    metier: "Commercial",
    description: "Répond aux demandes de devis et d'information, et relance les prospects.",
    declencheur: "mail",
    sources: { mail: ["read", "draft", "send"], fichiers: ["read"], agenda: ["read"] },
    consignes: `Pour chaque demande d'un client ou d'un prospect :
1. Identifie ce qu'il veut : un devis, une information, un rendez-vous.
2. Réponds avec les informations de nos documents (tarifs, conditions, disponibilités).
3. Pour un rendez-vous, propose deux créneaux libres dans l'agenda.
4. Ne promets jamais un prix ou un délai qui n'est pas écrit dans nos documents : demande à un humain.`,
    minutes: 12,
  },
  {
    id: "candidatures",
    nom: "Candidatures",
    metier: "Ressources humaines",
    description: "Accuse réception des candidatures et prépare un résumé pour chaque poste.",
    declencheur: "mail",
    sources: { mail: ["read", "draft", "send"], fichiers: ["read"] },
    consignes: `Pour chaque candidature reçue :
1. Accuse réception de façon chaleureuse et dis quand la personne aura une réponse.
2. Résume le profil en trois lignes : expérience, compétences utiles pour le poste, disponibilité.
3. Ne juge jamais une candidature sur l'âge, le sexe, l'origine, la santé ou la situation familiale. Ne refuse personne : la décision revient à un humain.`,
    minutes: 10,
  },
  {
    id: "agenda",
    nom: "Rendez-vous",
    metier: "Tous métiers",
    description: "Prépare chaque rendez-vous du lendemain et rappelle-le aux participants.",
    declencheur: "quotidien 17:00",
    sources: { agenda: ["read"], mail: ["read", "draft", "send"], fichiers: ["read"] },
    consignes: `Chaque fin d'après-midi :
1. Regarde les rendez-vous du lendemain.
2. Pour chacun, rassemble ce qu'il faut savoir : derniers échanges, documents utiles.
3. Envoie un court rappel aux personnes externes, avec l'heure et le lieu.`,
    minutes: 8,
  },
  {
    id: "rapport-direction",
    nom: "Rapport de la semaine",
    metier: "Direction",
    description: "Résume la semaine pour la direction : ce qui a avancé, ce qui coince.",
    declencheur: "quotidien 17:30",
    sources: { mail: ["read"], compta: ["read"], agenda: ["read"], fichiers: ["read"] },
    consignes: `Le vendredi seulement (les autres jours, ne fais rien) :
1. Résume la semaine en cinq lignes au plus : les chiffres qui comptent, les dossiers réglés, ce qui attend.
2. Liste les trois sujets qui demandent une décision de la direction, avec une recommandation chacun.
3. Écris-le comme un document, sans envoyer de mail.`,
    minutes: 30,
  },
];
