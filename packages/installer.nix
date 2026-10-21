# Image d'installation (D-006) : démarre, installe l'entreprise sans aucune question, redémarre.
# Tout est dans l'image (système déjà construit) : aucune connexion réseau n'est nécessaire.
{ self, nixpkgs, system, name }:
let
  target = self.nixosConfigurations.${name};
  toplevel = target.config.system.build.toplevel;
  disko = target.config.system.build.diskoScript;
in
(nixpkgs.lib.nixosSystem {
  inherit system;
  modules = [
    "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
    ({ pkgs, lib, ... }: {
      image.baseName = lib.mkForce "nova-${name}";
      isoImage.storeContents = [ toplevel disko ];
      isoImage.squashfsCompression = "zstd -Xcompression-level 6";
      boot.kernelParams = [ "console=tty1" "console=ttyS0,115200" ];
      boot.supportedFilesystems.zfs = lib.mkForce false;

      systemd.services.nova-install = {
        description = "Nova OS : installation automatique";
        wantedBy = [ "multi-user.target" ];
        after = [ "systemd-udev-settle.service" ];
        path = with pkgs; [ coreutils util-linux systemd nix nixos-install-tools ];
        serviceConfig = {
          Type = "oneshot";
          StandardOutput = "tty";
          StandardError = "tty";
          TTYPath = "/dev/console";
        };
        script = ''
          set -euo pipefail
          say() { echo "$@"; [ -w /dev/ttyS0 ] && echo "$@" > /dev/ttyS0 || true; }
          say "Nova OS : installation de « ${target.config.nova.company.name} »"

          # Clé de secours du disque chiffré : générée ici, jamais stockée dans la configuration.
          key=$(head -c 20 /dev/urandom | base32 | tr -d '=')
          printf '%s' "$key" > /tmp/nova-luks-key

          say "Préparation du disque…"
          ${disko}

          say "Installation du système…"
          nixos-install --no-root-passwd --no-channel-copy --system ${toplevel}

          # Déverrouillage automatique par la puce TPM2 quand la machine en a une.
          if [ -e /dev/tpmrm0 ]; then
            systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=7 --unlock-key-file=/tmp/nova-luks-key /dev/disk/by-partlabel/disk-main-luks
            say "Disque chiffré, déverrouillé par la puce TPM2."
          fi
          install -m 0400 /tmp/nova-luks-key /mnt/var/lib/nova/cle-de-secours
          say "Clé de secours : $key"
          say "NOVA_INSTALLE"
          sleep 5
          systemctl reboot
        '';
      };
    })
  ];
}).config.system.build.isoImage
