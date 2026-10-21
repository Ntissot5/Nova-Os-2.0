# Le Hub : là où vit data/, la seule partie de l'entreprise qui compte.
# Phase 0 : le dossier data/ et le journal. Phase 1 : Authentik, nova-gateway, connecteurs MCP.
{ config, lib, ... }:
let
  cfg = config.nova;
in
{
  options.nova.data = lib.mkOption {
    type = lib.types.nullOr lib.types.path;
    default = null;
    description = "Dossier data/ initial de l'entreprise (copié au premier démarrage, jamais écrasé ensuite).";
  };

  config = {
    systemd.tmpfiles.rules = [
      "d /var/lib/nova 0750 root nova -"
      "d /var/lib/nova/data 2770 root nova -"
      "d /var/lib/nova/data/journal 2770 root nova -"
      "d /var/lib/nova/data/approvals 2770 root nova -"
      (if cfg.data != null
        then "C /var/lib/nova/data/memory 2770 root nova - ${cfg.data}/memory"
        else "d /var/lib/nova/data/memory 2770 root nova -")
    ];
  };
}
