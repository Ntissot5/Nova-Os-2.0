# Phase 3, mesure de la ROADMAP : exporter la boîte d'une machine, l'importer sur une machine vierge,
# 0 différence et moins de 30 minutes. Puis la flotte : révoquer et rétablir un accès depuis le Hub.
{ self, pkgs, name ? "demo" }:
let
  machine = extra: { lib, ... }: {
    imports = [ self.nixosModules.nova ../companies/${name}/company.nix extra ];
    nova.disk.enable = false;
    nova.poste.enable = false; # Hub seul : pas de bureau dans ce test
    # Comme les machines de flake.nix : la configuration source part dans l'export.
    nova.sourceDir = ../companies/${name};
    nova.flakeLock = ../flake.lock;
    virtualisation.memorySize = 2048;
  };
in
pkgs.testers.runNixOSTest {
  name = "nova-portabilite";

  nodes = {
    ancienne = machine { };
    # Une machine neuve de la même entreprise, sans les données de départ.
    neuve = machine ({ lib, ... }: { nova.data = lib.mkForce null; });
  };

  testScript = ''
    import json, time
    start_all()
    for m in (ancienne, neuve):
        m.wait_for_unit("nova-gateway.service")
        m.wait_for_open_port(7700)

    # La boîte vit un peu : les agents de démonstration travaillent et écrivent dans data/.
    ancienne.wait_until_succeeds("ls /var/lib/nova/data/mail/.Brouillons/cur/ | grep -q nova", timeout=120)

    t0 = time.time()
    with subtest("export complet sur l'ancienne machine"):
        out = ancienne.succeed("sudo -u nova-gateway nova export --sortie /var/lib/nova/exports")
        print(out)
        archive = ancienne.succeed("ls /var/lib/nova/exports/nova-export-*.tar.gz").strip()
        empreinte = out.split("empreinte ")[-1].strip()
        ancienne.succeed(f"cp {archive} /tmp/export.tar.gz && chmod 644 /tmp/export.tar.gz")
        ancienne.copy_from_vm("/tmp/export.tar.gz", "")

    with subtest("l'archive se vérifie sans Nova"):
        ancienne.succeed("mkdir -p /tmp/x && tar -xzf /tmp/export.tar.gz -C /tmp/x && cd /tmp/x/nova-export && sha256sum -c --quiet SHA256SUMS")

    with subtest("import sur la machine neuve, 0 différence"):
        neuve.copy_from_host(str(ancienne.out_dir / "export.tar.gz"), "/tmp/export.tar.gz")
        neuve.succeed("systemctl stop nova-gateway")
        print(neuve.succeed("nova import /tmp/export.tar.gz --data /var/lib/nova/data --remplacer"))
        neuve.succeed("chown -R nova-gateway:nova /var/lib/nova/data && chmod -R u+rwX,g+rwX,o-rwx /var/lib/nova/data")
        verif = neuve.succeed("nova verifier /tmp/export.tar.gz --data /var/lib/nova/data")
        assert "0 différence" in verif, verif
        assert empreinte in verif, (empreinte, verif)
        neuve.succeed("systemctl start nova-gateway")
        neuve.wait_for_open_port(7700)

    with subtest("la machine neuve repart avec l'entreprise importée"):
        neuve.succeed("grep -q 'Fuite' /var/lib/nova/data/mail/cur/*")
        neuve.succeed("test -f /var/lib/nova/entreprise-importee/company.nix")
        state = json.loads(neuve.succeed("curl -sf -H 'x-nova-person: noa' http://127.0.0.1:7700/api/state"))
        assert state["company"]["name"] == "Régie Démo SA", state["company"]

    duree = time.time() - t0
    print(f"NOVA_BENCH_EXPORT {duree:.1f} s")
    assert duree < 30 * 60, duree

    with subtest("flotte : révoquer un accès coupe Nova et verrouille le compte"):
        h = "-H 'x-nova-person: noa' -H 'content-type: application/json'"
        ancienne.succeed(f"curl -sf -X POST {h} http://127.0.0.1:7700/api/flotte/revoquer/sophie")
        ancienne.wait_until_succeeds("passwd -S sophie | grep -q ' L '")
        code = ancienne.succeed("curl -s -o /dev/null -w '%{http_code}' -H 'x-nova-person: sophie' http://127.0.0.1:7700/api/state")
        assert code.strip() == "403", code
        flotte = json.loads(ancienne.succeed(f"curl -sf {h} http://127.0.0.1:7700/api/flotte"))
        assert any(p["id"] == "sophie" and p["revoque"] for p in flotte["personnes"]), flotte

    with subtest("la révocation survit à une réactivation du système"):
        ancienne.succeed("/run/current-system/bin/switch-to-configuration test")
        ancienne.succeed("passwd -S sophie | grep -q ' L '")

    with subtest("flotte : rétablir l'accès"):
        ancienne.succeed(f"curl -sf -X POST {h} http://127.0.0.1:7700/api/flotte/retablir/sophie")
        ancienne.wait_until_succeeds("passwd -S sophie | grep -q ' P '")
        ancienne.succeed("curl -sf -H 'x-nova-person: sophie' http://127.0.0.1:7700/api/state >/dev/null")

    with subtest("le dirigeant ne peut pas être révoqué, une personne inconnue non plus"):
        ancienne.fail(f"curl -sf -X POST {h} http://127.0.0.1:7700/api/flotte/revoquer/noa")
        ancienne.fail(f"curl -sf -X POST {h} http://127.0.0.1:7700/api/flotte/revoquer/root")
        ancienne.succeed("passwd -S root | grep -qv ' L '")
  '';
}
