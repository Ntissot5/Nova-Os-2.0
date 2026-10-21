# Ce que toute machine Nova a en commun : langue, clavier, réseau, utilisateurs, mises à jour atomiques.
{ config, lib, pkgs, ... }:
let
  cfg = config.nova;
in
{
  options.nova.people = lib.mkOption {
    type = lib.types.attrsOf (lib.types.submodule {
      options.hashedPassword = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Mot de passe haché (mkpasswd). Phase 1 : remplacé par l'identité Authentik.";
      };
    });
  };

  config = {
    system.stateVersion = "26.05";

    nix.settings = {
      experimental-features = [ "nix-command" "flakes" ];
      auto-optimise-store = true;
    };

    time.timeZone = "Europe/Zurich";
    i18n.defaultLocale = "fr_CH.UTF-8";
    console.keyMap = "fr_CH";
    services.xserver.xkb = { layout = "ch"; variant = "fr"; };

    networking.networkmanager.enable = true;
    networking.firewall.enable = true;

    # Mises à jour atomiques : chaque mise à jour est une génération, on garde les 10 dernières.
    boot.loader.systemd-boot = { enable = true; configurationLimit = 10; };
    boot.loader.efi.canTouchEfiVariables = true;
    boot.initrd.systemd.enable = true;
    boot.plymouth.enable = true;
    boot.kernelParams = [ "quiet" "splash" ];

    fonts.packages = [ pkgs.inter ];

    users.mutableUsers = false;
    users.groups.nova = { };
    users.users = lib.mapAttrs (_: p: {
      isNormalUser = true;
      description = p.name;
      extraGroups = [ "networkmanager" "nova" ] ++ lib.optional (p.role == "dirigeant") "wheel";
      hashedPassword = p.hashedPassword;
      # Démonstration uniquement : mot de passe « demo ». Une vraie entreprise déclare hashedPassword.
      password = if p.hashedPassword == null && cfg.demo then "demo" else null;
    }) cfg.people;

    assertions = lib.mapAttrsToList (n: p: {
      assertion = p.hashedPassword != null || cfg.demo;
      message = "nova.people.${n} : déclare hashedPassword (les mots de passe en clair ne sont permis qu'en démonstration).";
    }) cfg.people;

    # La couleur d'accent est vérifiée à chaque construction : contraste AA obligatoire.
    system.checks = [
      (pkgs.runCommand "nova-accent-aa" { } ''
        ${pkgs.nodejs_22}/bin/node ${../design}/build.mjs check '${cfg.brand.accent}'
        touch $out
      '')
    ];

    environment.etc."nova/company.json".text = cfg.companyJson;
  };
}
