# Les fournisseurs réels des connecteurs, contre de vrais serveurs dans une VM :
#   Dovecot (IMAP), Mailpit (SMTP, avec son API pour vérifier la réception), Radicale (CalDAV).
{ self, pkgs }:
let
  nova = pkgs.callPackage ../packages/nova.nix { };
  rossi = ../companies/demo/data/mail/cur;
in
pkgs.testers.runNixOSTest {
  name = "nova-connecteurs-reels";

  nodes.machine = { config, pkgs, ... }: {
    virtualisation.memorySize = 2048;
    users.users.regie = { isNormalUser = true; password = "secret-de-test"; };

    services.dovecot2 = {
      enable = true;
      enablePAM = true;
      settings = {
        dovecot_config_version = config.services.dovecot2.package.version;
        dovecot_storage_version = config.services.dovecot2.package.version;
        mail_driver = "maildir";
        mail_path = "~/Maildir";
        protocols = [ "imap" ];
        ssl = "no";
        auth_allow_cleartext = "yes";
      };
    };

    services.mailpit.instances.default = { smtp-auth-accept-any = true; smtp-auth-allow-insecure = true; };

    services.radicale = {
      enable = true;
      settings = {
        auth = { type = "htpasswd"; htpasswd_filename = "/etc/radicale/users"; htpasswd_encryption = "plain"; };
        storage.filesystem_folder = "/var/lib/radicale/collections";
      };
    };
    # Test uniquement : mot de passe en clair dans le store.
    environment.etc."radicale/users".text = "regie:secret-de-test\n";
    environment.systemPackages = [ pkgs.curl ];
  };

  testScript = { nodes, ... }: let dovecot = nodes.machine.services.dovecot2.package; in ''
    machine.wait_for_unit("dovecot.service")
    machine.wait_for_unit("mailpit-default.service")
    machine.wait_for_unit("radicale.service")
    machine.wait_for_open_port(143)
    machine.wait_for_open_port(1025)
    machine.wait_for_open_port(5232)

    # Un mail reçu dans la boîte : la fuite d'eau de Mme Rossi (données de démonstration).
    machine.succeed("${dovecot}/libexec/dovecot/deliver -d regie < ${rossi}/*demo0*")

    # Un agenda vide sur le serveur CalDAV.
    machine.succeed("curl -sf -u regie:secret-de-test -X MKCALENDAR http://127.0.0.1:5232/regie/agenda/")

    machine.succeed(
        "NOVA_MAIL_BACKEND=imap NOVA_MAIL_USER=regie NOVA_MAIL_PASSWORD=secret-de-test "
        "NOVA_MAIL_IMAP_HOST=127.0.0.1 NOVA_MAIL_IMAP_PORT=143 NOVA_MAIL_SMTP_HOST=127.0.0.1 NOVA_MAIL_SMTP_PORT=1025 NOVA_MAIL_TLS=0 "
        "NOVA_LIVE_MAILPIT=http://127.0.0.1:8025 "
        "NOVA_AGENDA_BACKEND=caldav NOVA_AGENDA_URL=http://127.0.0.1:5232/ NOVA_AGENDA_USER=regie NOVA_AGENDA_PASSWORD=secret-de-test "
        "${pkgs.nodejs_22}/bin/node --test ${nova}/${nova.passthru.liveTests} >&2"
    )
  '';
}
