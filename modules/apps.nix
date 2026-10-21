# Catalogue des apps que company.nix peut mettre dans le dock.
# Une entrée = un nom affiché, un paquet, et le fichier .desktop qui le lance.
{ lib, pkgs, ... }:
let
  inherit (lib) mkOption types;
in
{
  options.nova.catalog.apps = mkOption {
    type = types.attrsOf (types.submodule {
      options = {
        name = mkOption { type = types.str; };
        package = mkOption { type = types.package; };
        desktop = mkOption { type = types.str; description = "Nom du fichier .desktop fourni par le paquet."; };
      };
    });
    internal = true;
    description = "Apps installables ; company.nix choisit lesquelles dans nova.apps.";
  };

  config.nova.catalog.apps = {
    mail = { name = "Mail"; package = pkgs.thunderbird; desktop = "thunderbird.desktop"; };
    agenda = { name = "Agenda"; package = pkgs.gnome-calendar; desktop = "org.gnome.Calendar.desktop"; };
    fichiers = { name = "Fichiers"; package = pkgs.nautilus; desktop = "org.gnome.Nautilus.desktop"; };
    navigateur = { name = "Navigateur"; package = pkgs.firefox; desktop = "firefox.desktop"; };
    bureautique = { name = "Bureautique"; package = pkgs.libreoffice; desktop = "startcenter.desktop"; };
  };
}
