# Test de bout en bout : une VM démarre l'entreprise, ouvre la session, et l'API répond.
# Lancé par `nix flake check` (KVM nécessaire). Capture d'écran du bureau dans le résultat.
{ self, pkgs, name }:
pkgs.testers.runNixOSTest {
  name = "nova-${name}";

  nodes.machine = {
    imports = [ self.nixosModules.nova ../companies/${name}/company.nix ];
    nova.disk.enable = false; # la VM de test fournit son propre disque
    virtualisation = { memorySize = 4096; cores = 2; resolution = { x = 1440; y = 900; }; };
  };

  testScript = { nodes, ... }:
    let user = nodes.machine.services.displayManager.autoLogin.user; in ''
      machine.wait_for_unit("display-manager.service")
      machine.wait_until_succeeds("pgrep -u ${user} gnome-shell", timeout=300)
      machine.wait_for_unit("nova-daemon.service", "${user}")

      with subtest("l'API du poste répond avec l'entreprise de company.nix"):
          state = machine.wait_until_succeeds("curl -sf http://127.0.0.1:7777/api/state")
          assert '"agents"' in state, state

      with subtest("l'interface est servie"):
          machine.succeed("curl -sf http://127.0.0.1:7777/ | grep -q '<div id=\"root\">'")

      with subtest("une action sans en-tête X-Nova est refusée"):
          code = machine.succeed("curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:7777/api/agents/x/pause")
          assert code.strip() == "403", code

      with subtest("le journal s'écrit dans data/"):
          machine.wait_until_succeeds("ls /var/lib/nova/data/journal/*.jsonl", timeout=60)

      with subtest("le poste se signale prêt"):
          machine.wait_for_unit("nova-pret.service")

      machine.sleep(15)
      machine.screenshot("bureau")
    '';
}
