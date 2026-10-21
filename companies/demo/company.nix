# Entreprise de démonstration : une petite régie immobilière fictive.
# Ce fichier + le dossier data/ = toute l'entreprise. Rien d'autre à configurer.
{
  nova = {
    version = "0.1";
    demo = true;

    company = {
      name = "Régie Démo SA";
      address = "tu";
    };

    brand.accent = "#0A6CFF";

    people = {
      noa = { name = "Noa"; role = "dirigeant"; };
      sophie = { name = "Sophie"; role = "employe"; };
      lea = { name = "Léa"; role = "employe"; };
    };

    # Un espace par département. Noa dirige : voit tout. Sophie ne voit que la Gérance, Léa que la Comptabilité.
    departements = {
      gerance = { name = "Gérance"; couleur = "#0B5FD9"; membres = [ "sophie" ]; agents = [ "locataires" "relances" ]; };
      comptabilite = { name = "Comptabilité"; couleur = "#1A7F37"; membres = [ "lea" ]; agents = [ "compta" ]; };
      ppe = { name = "PPE"; couleur = "#6E56CF"; };
      facility = { name = "Facility"; couleur = "#A65200"; };
    };

    apps = [ "mail" "agenda" "fichiers" "navigateur" "bureautique" ];

    webApps.compta = {
      name = "Compta";
      url = "https://compta.example.ch";
    };

    agents = {
      locataires = {
        name = "Locataires";
        description = "Lit les demandes des locataires, repère les urgences et prépare les réponses.";
        autonomy = "je-valide-l-important";
        connectors = { mail = [ "read" "draft" "send" ]; fichiers = [ "read" ]; };
        skills = [ "gerance/tri-demandes" ];
      };
      relances = {
        name = "Relances";
        description = "Repère les loyers en retard et prépare les rappels.";
        autonomy = "je-valide-tout";
        connectors = { compta = [ "read" ]; mail = [ "draft" "send" ]; fichiers = [ "read" ]; };
        skills = [ "gerance/relances" ];
      };
      compta = {
        name = "Compta";
        description = "Rapproche les paiements et prépare les factures à payer.";
        autonomy = "je-valide-l-important";
        connectors = { compta = [ "read" "payment" ]; mail = [ "read" ]; fichiers = [ "read" ]; };
        skills = [ "gerance/comptabilite" ];
      };
    };

    limits.paymentApprovalAboveCHF = 500;

    # Données de départ (mémoire de l'entreprise), copiées au premier démarrage.
    data = ./data;
  };
}
