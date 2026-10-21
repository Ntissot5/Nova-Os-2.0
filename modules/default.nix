# Nova OS : tous les modules. company.nix ne fait que donner des valeurs à nova.*.
{
  imports = [
    ./options.nix
    ./apps.nix
    ./base.nix
    ./disk.nix
    ./hub.nix
    ./poste.nix
  ];
}
