# Disque chiffré (LUKS2) partitionné par disko. Déverrouillage par TPM2 quand la machine en a une,
# sinon par la clé de secours générée à l'installation.
{ config, lib, ... }:
let
  cfg = config.nova.disk;
in
{
  options.nova.disk = {
    enable = lib.mkOption { type = lib.types.bool; default = true; description = "Laisser Nova partitionner et chiffrer le disque."; };
    device = lib.mkOption { type = lib.types.str; default = "/dev/vda"; description = "Disque d'installation (effacé)."; };
  };

  config = lib.mkIf cfg.enable {
    disko.devices.disk.main = {
      type = "disk";
      inherit (cfg) device;
      content = {
        type = "gpt";
        partitions = {
          ESP = {
            size = "1G";
            type = "EF00";
            content = {
              type = "filesystem";
              format = "vfat";
              mountpoint = "/boot";
              mountOptions = [ "umask=0077" ];
            };
          };
          luks = {
            size = "100%";
            content = {
              type = "luks";
              name = "nova";
              # Écrit par l'installateur, jamais stocké dans la configuration.
              passwordFile = "/tmp/nova-luks-key";
              settings = {
                allowDiscards = true;
                crypttabExtraOpts = [ "tpm2-device=auto" ];
              };
              content = {
                type = "filesystem";
                format = "ext4";
                mountpoint = "/";
              };
            };
          };
        };
      };
    };
  };
}
