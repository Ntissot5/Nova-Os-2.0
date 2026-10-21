// Règles d'autonomie (D-014). Cette fonction est la seule à décider si une action part,
// part après un délai d'annulation, ou attend un humain. En Phase 1 elle vit dans nova-gateway.

import type { Action, Autonomy, CompanyConfig, Decision } from "./types.js";

const MANY_RECIPIENTS = 5;

export function decide(action: Action, autonomy: Autonomy, limits: CompanyConfig["limits"]): Decision {
  if (!action.sensitive) return { kind: "immediat" };

  // Garde-fou permanent : au-dessus du plafond, un paiement est toujours validé par un humain.
  // Le montant vient de l'aperçu du connecteur ; on ne se fie pas au nom de l'outil.
  if ((action.amountCHF ?? 0) > limits.paymentApprovalAboveCHF) {
    return { kind: "validation", reason: `Paiement au-dessus de ${chf(limits.paymentApprovalAboveCHF)}` };
  }

  if (autonomy === "je-valide-tout") return { kind: "validation", reason: "Tu valides toutes les actions de cet agent" };

  if (autonomy === "je-valide-l-important") {
    const reason = importance(action, limits);
    if (reason) return { kind: "validation", reason };
  }

  // Garde-fou permanent : tout envoi part après un délai, annulable.
  return { kind: "differe", seconds: limits.undoDelaySeconds };
}

function importance(action: Action, limits: CompanyConfig["limits"]): string | null {
  if ((action.amountCHF ?? 0) > limits.paymentApprovalAboveCHF) return `Montant au-dessus de ${chf(limits.paymentApprovalAboveCHF)}`;
  if ((action.recipients ?? 1) > MANY_RECIPIENTS) return `Plus de ${MANY_RECIPIENTS} destinataires`;
  if (action.unknownRecipient) return "Destinataire inconnu";
  return null;
}

// Format suisse, indépendant des données de langue du système : 4’860 CHF, 1’240.50 CHF.
export function chf(n: number) {
  const [int, dec] = Math.abs(n).toFixed(n % 1 ? 2 : 0).split(".");
  return `${n < 0 ? "-" : ""}${int!.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}${dec ? `.${dec}` : ""} CHF`;
}

export const TRUST_STREAK = 40;

/** Nova propose de monter d'un niveau quand la confiance est acquise. */
export function suggestion(autonomy: Autonomy, streak: number): string | undefined {
  if (streak < TRUST_STREAK) return undefined;
  if (autonomy === "je-valide-tout") return `${streak} validations d'affilée sans correction. Lui confier les actions courantes ?`;
  if (autonomy === "je-valide-l-important") return `${streak} validations d'affilée sans correction. Le laisser travailler en autonomie ?`;
  return undefined;
}
