{
  description = "Nova OS : le système d'exploitation de l'entreprise";

  inputs = {
    # Canal stable NixOS (D-002), épinglé par flake.lock.
    nixpkgs.url = "https://channels.nixos.org/nixos-26.05/nixexprs.tar.xz";
    disko = {
      url = "git+https://github.com/nix-community/disko?shallow=1";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, disko }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      lib = nixpkgs.lib;

      # Une entreprise = un dossier companies/<nom>/ avec company.nix (+ data/).
      companies = lib.genAttrs (builtins.attrNames (builtins.readDir ./companies)) (name: ./companies/${name});

      # La machine d'une entreprise : Nova + company.nix. Phase 0 : un seul poste « hub+poste ».
      machine = name: dir: lib.nixosSystem {
        inherit system;
        specialArgs = { inherit self; };
        modules = [
          self.nixosModules.nova
          (dir + "/company.nix")
          { networking.hostName = "nova-${name}"; }
        ];
      };
    in
    {
      nixosModules.nova = { imports = [ ./modules disko.nixosModules.disko ]; };

      nixosConfigurations = lib.mapAttrs machine companies;

      packages.${system} = {
        nova = pkgs.callPackage ./packages/nova.nix { };
        nova-shell = pkgs.callPackage ./packages/nova-shell { };
        default = self.packages.${system}.nova;
      } // lib.mapAttrs' (name: _: lib.nameValuePair "installer-${name}" (import ./packages/installer.nix { inherit self nixpkgs system name; })) companies;

      # Ce que nova-daemon lit, généré depuis company.nix (utile en développement : scripts/dev).
      companyJson = lib.mapAttrs (_: m: m.config.nova.companyJson) self.nixosConfigurations;

      checks.${system} = {
        unit = self.packages.${system}.nova;
      } // lib.mapAttrs' (name: _: lib.nameValuePair "vm-${name}" (import ./tests/vm.nix { inherit self pkgs name; })) companies;

      devShells.${system}.default = pkgs.mkShell { packages = [ pkgs.nodejs_22 pkgs.prefetch-npm-deps ]; };
    };
}
