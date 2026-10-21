// Les phrases que voit la personne pendant qu'un agent ou une question consulte une source (D-015).

/** Phrase affichée pendant qu'un outil est consulté. */
export function stepText(tool: string, args: Record<string, unknown>) {
  const q = (k: string) => (typeof args[k] === "string" && args[k] ? ` « ${args[k]} »` : "");
  switch (tool) {
    case "mail_chercher":
      return `Je cherche dans les mails${q("texte") || q("expediteur")}…`;
    case "mail_lire":
      return "Je lis un mail…";
    case "agenda_evenements":
      return `Je regarde l'agenda du ${String(args.du ?? "")} au ${String(args.au ?? "")}…`;
    case "compta_loyers":
      return `Je regarde les loyers de ${String(args.mois ?? "")} dans la compta…`;
    case "compta_retards":
      return "Je cherche les loyers en retard dans la compta…";
    case "compta_paiements":
      return "Je regarde les paiements reçus…";
    case "compta_factures":
      return "Je regarde les factures fournisseurs…";
    case "fichiers_chercher":
      return `Je cherche dans les fichiers${q("query")}…`;
    case "fichiers_lire":
      return `Je lis ${String(args.path ?? "un fichier")}…`;
    case "fichiers_lister":
      return "Je parcours les dossiers…";
    case "telephone_appels":
      return "Je regarde le journal d'appels…";
    case "mail_brouillon":
      return `J'écris à ${names(args.a)}…`;
    case "mail_envoyer":
      return "Je prépare l'envoi…";
    case "compta_payer":
      return `Je prépare le paiement de la facture ${String(args.facture ?? "")}…`;
    case "agenda_creer":
      return `J'ajoute « ${String(args.titre ?? "un rendez-vous")} » à l'agenda…`;
    case "fichiers_ecrire":
      return `J'écris ${String(args.path ?? "un fichier")}…`;
    default:
      return "Je consulte une source…";
  }
}


/** « Maria Rossi <maria.rossi@…> » → « Maria Rossi » ; plusieurs destinataires séparés par des virgules. */
export function names(list: unknown) {
  const arr = Array.isArray(list) ? list : [list];
  return arr.map((x) => String(x ?? "").replace(/\s*<.*>/, "").trim()).filter(Boolean).join(", ") || "un destinataire";
}
