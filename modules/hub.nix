# Le Hub : là où vit data/, et nova-gateway, le gardien par lequel passe tout accès aux sources.
# Phase 1 : gardien, connecteurs MCP, questions. À venir : identité Authentik (OIDC) pour les postes distants.
{ config, lib, pkgs, ... }:
let
  cfg = config.nova;
  nova = pkgs.callPackage ../packages/nova.nix { };
  inherit (lib) mkOption types;

  mailEnv =
    if cfg.connectors.mail.backend == "imap" then
      with cfg.connectors.mail; {
        NOVA_MAIL_BACKEND = "imap";
        NOVA_MAIL_USER = user;
        NOVA_MAIL_FROM = address;
        NOVA_MAIL_IMAP_HOST = imapHost;
        NOVA_MAIL_IMAP_PORT = toString imapPort;
        NOVA_MAIL_SMTP_HOST = smtpHost;
        NOVA_MAIL_SMTP_PORT = toString smtpPort;
        NOVA_MAIL_TLS = if tls then "1" else "0";
      }
    else { NOVA_MAIL_BACKEND = "maildir"; NOVA_MAIL_FROM = cfg.connectors.mail.address; };

  agendaEnv =
    if cfg.connectors.agenda.backend == "caldav" then
      with cfg.connectors.agenda; { NOVA_AGENDA_BACKEND = "caldav"; NOVA_AGENDA_URL = url; NOVA_AGENDA_USER = user; }
    else { NOVA_AGENDA_BACKEND = "ics"; };
in
{
  options.nova = {
    data = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = "Dossier data/ initial de l'entreprise (copié au premier démarrage, jamais écrasé ensuite).";
    };

    connectors = {
      mail = {
        backend = mkOption { type = types.enum [ "maildir" "imap" ]; default = "maildir"; description = "maildir : data/mail/ ; imap : la vraie boîte (IMAP + SMTP)."; };
        address = mkOption { type = types.str; default = "regie@example.org"; description = "Adresse d'expédition de la boîte."; };
        user = mkOption { type = types.str; default = cfg.connectors.mail.address; defaultText = "nova.connectors.mail.address"; description = "Identifiant IMAP/SMTP (souvent l'adresse elle-même)."; };
        imapHost = mkOption { type = types.str; default = ""; };
        imapPort = mkOption { type = types.port; default = 993; };
        smtpHost = mkOption { type = types.str; default = ""; };
        smtpPort = mkOption { type = types.port; default = 465; };
        tls = mkOption { type = types.bool; default = true; description = "TLS direct (993/465). Désactiver seulement en test."; };
      };
      agenda = {
        backend = mkOption { type = types.enum [ "ics" "caldav" ]; default = "ics"; description = "ics : data/agenda/ ; caldav : le serveur d'agenda de l'entreprise."; };
        url = mkOption { type = types.str; default = ""; };
        user = mkOption { type = types.str; default = ""; };
      };
    };

    sourceDir = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = "Dossier de l'entreprise (company.nix) : inclus dans chaque export.";
    };

    flakeLock = mkOption {
      type = types.nullOr types.path;
      default = null;
      description = "flake.lock utilisé pour construire la machine : inclus dans chaque export (versions exactes).";
    };

    sauvegarde = {
      enable = mkOption { type = types.bool; default = true; description = "Un export complet chaque nuit dans /var/lib/nova/exports."; };
      garder = mkOption { type = types.ints.positive; default = 7; description = "Nombre d'exports gardés."; };
    };

    models.question = mkOption {
      type = types.str;
      default = "claude-sonnet-5-5";
      description = "Modèle des questions en langage naturel (D-017).";
    };

    secretsFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/secrets/nova.env";
      description = ''
        Fichier d'environnement lu par le gardien, jamais copié dans le store Nix (fourni par sops-nix) :
        ANTHROPIC_API_KEY=…, NOVA_MAIL_PASSWORD=…, NOVA_AGENDA_PASSWORD=…
      '';
    };
  };

  config = {
    users.users.nova-gateway = { isSystemUser = true; group = "nova"; description = "Nova, gardien du Hub"; };

    systemd.tmpfiles.rules = [
      "d /var/lib/nova 0750 root nova -"
      "d /var/lib/nova/data 2770 nova-gateway nova -"
      "d /var/lib/nova/exports 0700 nova-gateway nova -"
    ];

    # La commande `nova` (export, verifier, import) et ce qu'elle exporte avec data/.
    environment.systemPackages = [ nova ];
    environment.etc = lib.mkMerge [
      (lib.mkIf (cfg.sourceDir != null) { "nova/source/company.nix".source = cfg.sourceDir + "/company.nix"; })
      (lib.mkIf (cfg.flakeLock != null) { "nova/flake.lock".source = cfg.flakeLock; })
    ];

    # ---------- Flotte : retour arrière et révocation, demandés par le gardien, exécutés par systemd ----------

    systemd.services.nova-retour = {
      description = "Nova : revenir à la version précédente du système";
      serviceConfig.Type = "oneshot";
      script = ''
        ${config.nix.package}/bin/nix-env -p /nix/var/nix/profiles/system --rollback
        exec /nix/var/nix/profiles/system/bin/switch-to-configuration switch
      '';
    };

    # Une révocation est gardée dans data/flotte/revocations.json (elle voyage avec l'export) et réappliquée
    # à chaque activation : NixOS régénère les comptes, un simple verrouillage serait sinon effacé.
    systemd.services."nova-revoquer@" = {
      description = "Nova : révoquer l'accès de %i";
      serviceConfig.Type = "oneshot";
      scriptArgs = "%i";
      path = [ pkgs.shadow pkgs.systemd ];
      script = ''
        case "$1" in ${lib.concatStringsSep "|" (lib.attrNames cfg.people)}) ;; *) echo "Personne inconnue : $1"; exit 1 ;; esac
        usermod -L "$1"
        loginctl terminate-user "$1" || true
      '';
    };
    systemd.services."nova-retablir@" = {
      description = "Nova : rétablir l'accès de %i";
      serviceConfig.Type = "oneshot";
      scriptArgs = "%i";
      path = [ pkgs.shadow ];
      script = ''
        case "$1" in ${lib.concatStringsSep "|" (lib.attrNames cfg.people)}) ;; *) echo "Personne inconnue : $1"; exit 1 ;; esac
        usermod -U "$1"
      '';
    };
    system.activationScripts.nova-revocations = {
      deps = [ "users" ];
      text = ''
        f=/var/lib/nova/data/flotte/revocations.json
        if [ -f "$f" ]; then
          for u in $(${pkgs.jq}/bin/jq -r '.[]' "$f"); do ${pkgs.shadow}/bin/usermod -L "$u" 2>/dev/null || true; done
        fi
      '';
    };

    security.polkit.enable = true;
    security.polkit.extraConfig = ''
      // Le gardien de Nova peut demander ces opérations, et seulement elles.
      polkit.addRule(function (action, subject) {
        if (action.id == "org.freedesktop.systemd1.manage-units" && subject.user == "nova-gateway" && action.lookup("verb") == "start") {
          var unit = action.lookup("unit");
          if (unit == "nova-retour.service" || /^nova-(revoquer|retablir)@[a-z0-9_-]+\.service$/.test(unit)) return polkit.Result.YES;
        }
      });
    '';

    # Sauvegarde : un export complet chaque nuit, les plus anciens supprimés.
    systemd.services.nova-sauvegarde = lib.mkIf cfg.sauvegarde.enable {
      description = "Nova : export complet de l'entreprise";
      serviceConfig = {
        Type = "oneshot";
        User = "nova-gateway";
        Group = "nova";
        UMask = "0077";
        ProtectSystem = "strict";
        ReadWritePaths = [ "/var/lib/nova/exports" ];
        ProtectHome = true;
        PrivateTmp = true;
        NoNewPrivileges = true;
      };
      path = [ pkgs.coreutils pkgs.findutils ];
      script = ''
        ${lib.getExe' nova "nova"} export --sortie /var/lib/nova/exports
        ls -1t /var/lib/nova/exports/nova-export-*.tar.gz | tail -n +${toString (cfg.sauvegarde.garder + 1)} | xargs -r rm -f
      '';
    };
    systemd.timers.nova-sauvegarde = lib.mkIf cfg.sauvegarde.enable {
      wantedBy = [ "timers.target" ];
      timerConfig = { OnCalendar = "*-*-* 02:30"; Persistent = true; RandomizedDelaySec = "15m"; };
    };

    # Au premier démarrage, data/ de l'entreprise est copié en place, puis n'est plus jamais écrasé.
    systemd.services.nova-data = lib.mkIf (cfg.data != null) {
      description = "Nova : données de départ de l'entreprise";
      wantedBy = [ "multi-user.target" ];
      before = [ "nova-gateway.service" ];
      unitConfig.ConditionPathExists = "!/var/lib/nova/data/.initialise";
      serviceConfig.Type = "oneshot";
      script = ''
        cp -rn --no-preserve=mode,ownership ${cfg.data}/. /var/lib/nova/data/
        chown -R nova-gateway:nova /var/lib/nova/data
        chmod -R u+rwX,g+rwX,o-rwx /var/lib/nova/data
        touch /var/lib/nova/data/.initialise
      '';
    };

    systemd.services.nova-gateway = {
      description = "Nova : gardien du Hub (connecteurs, droits, autonomie, journal, agents)";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" "nova-data.service" ];
      wants = [ "network-online.target" ];
      environment = {
        NOVA_COMPANY = "/etc/nova/company.json";
        NOVA_DATA = "/var/lib/nova/data";
        NOVA_DEMO = if cfg.demo then "1" else "0";
        NOVA_MODEL_QUESTION = cfg.models.question;
        NOVA_SKILLS = "${nova}/share/nova-verticals";
      } // mailEnv // agendaEnv;
      path = [ pkgs.systemd ]; # systemctl : demandes à la flotte (polkit)
      serviceConfig = {
        ExecStart = lib.getExe' nova "nova-gateway";
        User = "nova-gateway";
        Group = "nova";
        UMask = "0007";
        EnvironmentFile = lib.optional (cfg.secretsFile != null) "-${cfg.secretsFile}";
        Restart = "always";
        RestartSec = 2;
        # Le gardien ne peut écrire que dans data/.
        ProtectSystem = "strict";
        ReadWritePaths = [ "/var/lib/nova/data" ];
        ProtectHome = true;
        PrivateTmp = true;
        NoNewPrivileges = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
      };
    };
  };
}
