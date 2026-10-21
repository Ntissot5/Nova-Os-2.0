# Le vocabulaire de company.nix : tout ce qu'une entreprise peut déclarer.
# Tout ce qui n'est pas déclaré a une valeur par défaut décidée par Nova.
{ lib, config, ... }:
let
  inherit (lib) mkOption types;

  autonomy = types.enum [ "je-valide-tout" "je-valide-l-important" "autonome" ];

  person = types.submodule {
    options = {
      name = mkOption { type = types.str; description = "Nom affiché."; };
      role = mkOption {
        type = types.enum [ "dirigeant" "employe" ];
        default = "employe";
        description = "Le dirigeant voit et contrôle tout ; un employé voit ses apps et ses agents.";
      };
    };
  };

  agent = types.submodule {
    options = {
      name = mkOption { type = types.str; description = "Nom du métier, affiché dans le dock (« Compta »)."; };
      description = mkOption { type = types.str; description = "Ce que fait l'agent, en une phrase."; };
      autonomy = mkOption {
        type = autonomy;
        default = "je-valide-tout";
        description = "Niveau d'autonomie de départ ; le dirigeant le change ensuite depuis l'espace Entreprise.";
      };
      connectors = mkOption {
        type = types.attrsOf (types.listOf types.str);
        default = { };
        example = { mail = [ "read" "draft" "send" ]; compta = [ "read" ]; };
        description = "Connecteurs et droits accordés à l'agent. Rien d'autre ne lui est accessible.";
      };
      skills = mkOption { type = types.listOf types.str; default = [ ]; description = "Skills métier chargés par l'agent."; };
    };
  };

  departement = types.submodule {
    options = {
      name = mkOption { type = types.str; description = "Nom affiché (« Gérance »)."; };
      couleur = mkOption {
        type = types.strMatching "#[0-9A-Fa-f]{6}";
        default = "#0B5FD9";
        description = "Couleur du département dans le dock et ses espaces. Vérifiée au build : contraste AA avec du texte blanc.";
      };
      membres = mkOption { type = types.listOf types.str; default = [ ]; description = "Les personnes du département (nova.people)."; };
      agents = mkOption { type = types.listOf types.str; default = [ ]; description = "Les agents du département (nova.agents). Un agent appartient à un seul département."; };
    };
  };
in
{
  options.nova = {
    version = mkOption { type = types.str; default = "0.1"; description = "Version de Nova OS visée par cette entreprise."; };

    company = {
      name = mkOption { type = types.str; description = "Raison sociale, affichée dans la barre du haut."; };
      address = mkOption {
        type = types.enum [ "tu" "vous" ];
        default = "tu";
        description = "Comment Nova s'adresse aux personnes de l'entreprise.";
      };
    };

    brand.accent = mkOption {
      type = types.strMatching "#[0-9A-Fa-f]{6}";
      default = "#0A6CFF";
      description = "Unique couleur d'accent. Vérifiée au build : contraste AA obligatoire.";
    };

    people = mkOption { type = types.attrsOf person; default = { }; description = "Les personnes de l'entreprise (une par poste)."; };

    apps = mkOption {
      type = types.listOf (types.enum (builtins.attrNames config.nova.catalog.apps));
      default = [ "mail" "agenda" "fichiers" "navigateur" "bureautique" ];
      description = "Apps du dock, dans l'ordre. Voir modules/apps.nix pour le catalogue.";
    };

    webApps = mkOption {
      type = types.attrsOf (types.submodule {
        options = {
          name = mkOption { type = types.str; };
          url = mkOption { type = types.str; };
        };
      });
      default = { };
      example = { compta = { name = "Compta"; url = "https://compta.example.ch"; }; };
      description = "Logiciels en ligne de l'entreprise, ouverts comme des apps dans le dock.";
    };

    agents = mkOption { type = types.attrsOf agent; default = { }; description = "Les agents de l'entreprise, un par métier."; };

    limits = {
      paymentApprovalAboveCHF = mkOption {
        type = types.ints.unsigned;
        default = 500;
        description = "Au-dessus de ce montant, un paiement est toujours validé par un humain, quel que soit le niveau d'autonomie.";
      };
      undoDelaySeconds = mkOption {
        type = types.ints.between 30 600;
        default = 120;
        description = "Délai pendant lequel tout envoi d'un agent reste annulable.";
      };
    };

    departements = mkOption {
      type = types.attrsOf departement;
      default = { };
      description = ''
        Un espace par département (D-029). Chaque personne ne voit et ne pilote que les agents de ses départements ;
        le dirigeant voit tout. Sans départements, tout le monde voit tout.
      '';
    };

    demo = mkOption { type = types.bool; default = false; description = "Joue les scénarios de démonstration (Phase 0)."; };

    # Ce que nova-daemon lit : la partie de company.nix utile à l'interface, en JSON.
    companyJson = mkOption {
      type = types.str;
      readOnly = true;
      internal = true;
      default = builtins.toJSON {
        inherit (config.nova) version company brand apps limits;
        people = lib.mapAttrs (_: p: { inherit (p) name role; }) config.nova.people;
        agents = lib.mapAttrs (_: a: { inherit (a) name description autonomy connectors skills; }) config.nova.agents;
        departements = lib.mapAttrs (_: d: { inherit (d) name couleur membres agents; }) config.nova.departements;
      };
    };
  };

  config.assertions =
    let
      deps = config.nova.departements;
      tousAgents = lib.concatMap (d: d.agents) (lib.attrValues deps);
    in
    lib.concatLists (lib.mapAttrsToList (id: d:
      map (m: { assertion = config.nova.people ? ${m}; message = "nova.departements.${id} : « ${m} » n'est pas dans nova.people."; }) d.membres
      ++ map (a: { assertion = config.nova.agents ? ${a}; message = "nova.departements.${id} : l'agent « ${a} » n'existe pas."; }) d.agents
    ) deps)
    ++ map (a: { assertion = lib.count (x: x == a) tousAgents == 1; message = "L'agent « ${a} » appartient à plusieurs départements."; }) (lib.unique tousAgents);
}
