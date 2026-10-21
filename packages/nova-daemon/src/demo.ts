// Mode démonstration (Phase 0) : des scénarios de gérance réalistes, joués par le vrai moteur.
// Seules les données sont simulées ; autonomie, validations, délais et journal sont réels.
// En Phase 1, les mêmes agents travaillent sur les vrais connecteurs MCP.

import type { Engine, Scenario } from "./engine.js";
import type { Task } from "./types.js";

const s = (text: string, app?: string, ms = 2200, doc?: string) => ({ text, app, ms, doc });

const SCENARIOS: Record<string, Scenario[]> = {
  locataires: [
    {
      title: "Fuite d'eau signalée par Mme Rossi",
      docTitle: "Message au concierge",
      steps: [
        s("Je lis le mail de Mme Rossi, reçu à l'instant.", "mail", 1500),
        s("Elle signale une fuite d'eau sous l'évier, 3e étage, Rue du Lac 14.", "mail"),
        s("Une fuite d'eau est urgente selon les règles de la régie.", undefined, 1800),
        s("Je cherche le concierge de l'immeuble : M. Favre.", "fichiers"),
        s("J'écris à M. Favre.", "mail", 1600, "Bonjour Monsieur Favre,\n\n"),
        s("J'explique où et quoi.", "mail", 2400, "Mme Rossi (Rue du Lac 14, 3e étage) signale une fuite d'eau sous l'évier de la cuisine. "),
        s("Je demande un passage aujourd'hui.", "mail", 2400, "Pourriez-vous passer aujourd'hui et nous dire s'il faut faire venir le sanitaire ?\n\nMerci et belle journée,\nLa régie"),
        s("Je prépare aussi une réponse à Mme Rossi pour la rassurer.", "mail", 1800),
      ],
      action: {
        tool: "mail.send",
        summary: "Envoyer 2 messages : à M. Favre (concierge) et à Mme Rossi",
        sensitive: true,
        recipients: 2,
        why: {
          rule: "Une fuite d'eau est traitée comme urgente : le concierge est prévenu dans l'heure et le locataire reçoit une réponse.",
          ruleRef: "regles.md#urgences",
          sources: ["Mail de Mme Rossi", "Fiche immeuble Rue du Lac 14", "Contacts : M. Favre, concierge"],
        },
      },
      outcome: "Concierge prévenu, Mme Rossi rassurée.",
      minutesSaved: 15,
    },
    {
      title: "Demande de place de parc de M. Keller",
      docTitle: "Réponse à M. Keller",
      steps: [
        s("Je lis le mail de M. Keller.", "mail", 1500),
        s("Il demande une place de parc au sous-sol, Avenue des Alpes 3.", "mail"),
        s("Ce n'est pas urgent. Je regarde les places libres.", "fichiers"),
        s("La place n° 12 est libre depuis le 1er du mois.", "fichiers"),
        s("Je rédige la réponse.", "mail", 2400, "Bonjour Monsieur Keller,\n\nLa place n° 12 au sous-sol est disponible dès maintenant, pour 120 CHF par mois. "),
        s("Je propose la suite.", "mail", 2200, "Si elle vous convient, nous vous enverrons l'avenant à signer.\n\nMeilleures salutations,\nLa régie"),
      ],
      action: {
        tool: "mail.send",
        summary: "Répondre à M. Keller : place n° 12 disponible",
        sensitive: true,
        recipients: 1,
        why: {
          rule: "Les demandes de place de parc reçoivent une réponse avec les places libres et le tarif en vigueur.",
          ruleRef: "regles.md#places-de-parc",
          sources: ["Mail de M. Keller", "Liste des places, Avenue des Alpes 3", "Tarifs 2026"],
        },
      },
      outcome: "Réponse envoyée à M. Keller.",
      minutesSaved: 10,
    },
  ],
  relances: [
    {
      title: "Loyers impayés de novembre",
      docTitle: "Relance — premier rappel",
      steps: [
        s("J'ouvre les paiements de novembre dans la compta.", "compta", 1500),
        s("142 loyers attendus, 139 reçus.", "compta"),
        s("3 locataires ont plus de 10 jours de retard : M. Dupont, Mme Berset, M. Ochsner.", "compta", 2600),
        s("Je vérifie qu'aucun n'a d'arrangement de paiement en cours.", "fichiers"),
        s("Aucun arrangement. Je rédige 3 relances, ton cordial.", "mail", 1800, "Bonjour,\n\nSauf erreur de notre part, le loyer de novembre n'est pas encore parvenu sur notre compte. "),
        s("J'ajoute le montant et l'échéance de chacun.", "mail", 2400, "Nous vous remercions de bien vouloir effectuer le versement d'ici au 5 décembre. "),
        s("Je termine.", "mail", 1800, "Si le paiement a été fait entre-temps, merci de ne pas tenir compte de ce message.\n\nMeilleures salutations,\nLa régie"),
      ],
      action: {
        tool: "mail.send",
        summary: "Envoyer 3 relances de loyer (4’860 CHF au total)",
        sensitive: true,
        recipients: 3,
        why: {
          rule: "Un loyer en retard de plus de 10 jours reçoit un premier rappel cordial, sauf arrangement en cours.",
          ruleRef: "regles.md#relances",
          sources: ["Compta : paiements de novembre", "Dossiers locataires : arrangements"],
        },
      },
      outcome: "3 relances envoyées.",
      minutesSaved: 45,
    },
  ],
  compta: [
    {
      title: "Rapprochement bancaire du jour",
      steps: [
        s("Je lis le relevé bancaire du jour.", "compta", 1500),
        s("18 paiements reçus.", "compta"),
        s("Je les rapproche des loyers attendus.", "compta", 2600),
        s("18 sur 18 rapprochés, aucune différence.", "compta"),
      ],
      outcome: "18 paiements rapprochés, aucune différence.",
      minutesSaved: 30,
    },
    {
      title: "Facture de Sanitaires Morel SA",
      docTitle: "Facture n° 2026-418",
      steps: [
        s("Je lis la facture reçue par mail.", "mail", 1500, "Sanitaires Morel SA\nIntervention Rue du Lac 14, 3e étage\n"),
        s("Montant : 1’240.50 CHF, réparation d'une conduite.", "mail", 2200, "Montant : 1’240.50 CHF\n"),
        s("Je vérifie le bon de commande : conforme.", "fichiers"),
        s("Je prépare le paiement.", "compta", 2000, "Échéance : 30 jours\nCompte : CH93 0076 2011 6238 5295 7\n"),
      ],
      action: {
        tool: "compta.payment",
        summary: "Payer la facture de Sanitaires Morel SA (1’240.50 CHF)",
        sensitive: true,
        amountCHF: 1240.5,
        why: {
          rule: "Une facture conforme au bon de commande est préparée pour paiement.",
          ruleRef: "regles.md#factures",
          sources: ["Facture n° 2026-418", "Bon de commande BC-2026-087"],
        },
      },
      outcome: "Facture payée.",
      minutesSaved: 12,
    },
  ],
};

const HISTORY: { agentId: string; title: string; outcome: string; minutesSaved: number; daysAgo: number }[] = [
  { agentId: "locataires", title: "12 demandes de locataires triées", outcome: "12 demandes triées, 2 transmises au concierge.", minutesSaved: 60, daysAgo: 0.2 },
  { agentId: "compta", title: "Rapprochement bancaire", outcome: "21 paiements rapprochés, aucune différence.", minutesSaved: 30, daysAgo: 0.9 },
  { agentId: "relances", title: "Relances d'octobre, deuxième rappel", outcome: "2 deuxièmes rappels envoyés.", minutesSaved: 30, daysAgo: 1.1 },
  { agentId: "locataires", title: "Demande d'attestation de loyer", outcome: "Attestation envoyée à Mme Nguyen.", minutesSaved: 15, daysAgo: 1.4 },
  { agentId: "compta", title: "4 factures fournisseurs", outcome: "4 factures payées après validation.", minutesSaved: 40, daysAgo: 2.2 },
  { agentId: "locataires", title: "Bruit signalé Avenue des Alpes 3", outcome: "Rappel du règlement envoyé aux locataires de l'immeuble.", minutesSaved: 20, daysAgo: 2.6 },
  { agentId: "relances", title: "Suivi des arrangements de paiement", outcome: "3 arrangements à jour, aucun rappel nécessaire.", minutesSaved: 25, daysAgo: 3.1 },
  { agentId: "compta", title: "Rapprochement bancaire", outcome: "17 paiements rapprochés, 1 différence signalée.", minutesSaved: 30, daysAgo: 3.9 },
  { agentId: "locataires", title: "15 demandes de locataires triées", outcome: "15 demandes triées, 1 urgence traitée.", minutesSaved: 75, daysAgo: 4.3 },
  { agentId: "compta", title: "Décompte de charges, immeuble Rue du Lac 14", outcome: "Décompte préparé pour contrôle.", minutesSaved: 45, daysAgo: 5.2 },
];

export function startDemo(engine: Engine) {
  const now = engine.now().getTime();
  for (const h of HISTORY) {
    const startedAt = new Date(now - h.daysAgo * 24 * 3600 * 1000).toISOString();
    const t: Omit<Task, "id"> = { agentId: h.agentId, title: h.title, status: "terminee", startedAt, endedAt: startedAt, steps: [], outcome: h.outcome, minutesSaved: h.minutesSaved };
    engine.seed(t);
  }
  engine.setStreak("relances", 40);

  const cursor: Record<string, number> = {};
  const nextFor = (agentId: string) => {
    const list = SCENARIOS[agentId] ?? [];
    const i = cursor[agentId] ?? 0;
    cursor[agentId] = i + 1;
    return list[i % list.length];
  };

  const tryStart = (agentId: string) => {
    let st;
    try {
      st = engine.state().agents.find((a) => a.id === agentId);
    } catch {
      return;
    }
    if (!st || st.status !== "disponible" || st.pending > 0 || engine.isBusy(agentId)) return;
    const sc = nextFor(agentId);
    if (sc) engine.start(agentId, sc);
  };

  // Relances commence avec une validation en attente, Locataires et Compta travaillent en direct.
  const known = new Set(Object.keys(SCENARIOS));
  const agents = engine.state().agents.map((a) => a.id).filter((id) => known.has(id));
  if (agents.includes("relances")) engine.start("relances", { ...SCENARIOS.relances![0]!, steps: SCENARIOS.relances![0]!.steps.map((x) => ({ ...x, ms: 1 })) });
  if (agents.includes("relances")) cursor.relances = 1;
  setTimeout(() => agents.includes("locataires") && tryStart("locataires"), 800);
  setTimeout(() => agents.includes("compta") && tryStart("compta"), 9000);
  setInterval(() => {
    for (const id of agents) tryStart(id);
  }, 12000).unref();
}
