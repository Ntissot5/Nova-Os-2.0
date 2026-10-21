# Le poste de travail : Nova Desktop. Un bureau complet dont le dock est la boîte (D-013) :
# Entreprise · apps · agents. Moteur GNOME invisible, tout ce qui se voit est Nova.
{ config, lib, pkgs, ... }:
let
  cfg = config.nova;
  nova = pkgs.callPackage ../packages/nova.nix { };
  nova-shell = pkgs.callPackage ../packages/nova-shell { };
  dock = pkgs.gnomeExtensions.dash-to-dock;
  blur = pkgs.gnomeExtensions.blur-my-shell; # le verre : flou derrière le dock et la barre du haut
  port = 7777;

  # Le dirigeant du poste en démonstration ; sur une vraie flotte, un poste = une personne (Phase 3).
  person = lib.findFirst (n: cfg.people.${n}.role == "dirigeant") (lib.head (lib.attrNames cfg.people)) (lib.attrNames cfg.people);

  theme = pkgs.runCommand "nova-theme.css" { } ''
    ${pkgs.nodejs_22}/bin/node ${../design}/build.mjs theme '${cfg.brand.accent}' $out
  '';

  # Ouvre une vue de Nova Home comme une app, sans chrome de navigateur.
  open = pkgs.writeShellScriptBin "nova-open" ''
    exec ${pkgs.chromium}/bin/chromium \
      --app="http://127.0.0.1:${toString port}/$1" \
      --user-data-dir="''${XDG_STATE_HOME:-$HOME/.local/state}/nova-home" \
      --class=nova-home --no-first-run --no-default-browser-check \
      --ozone-platform-hint=auto --hide-crash-restore-bubble
  '';

  openWeb = id: url: pkgs.writeShellScript "nova-web-${id}" ''
    exec ${pkgs.chromium}/bin/chromium --app=${lib.escapeShellArg url} \
      --user-data-dir="''${XDG_STATE_HOME:-$HOME/.local/state}/nova-web-${id}" --no-first-run
  '';

  # Icône d'agent ou d'app : monogramme sur carré arrondi, couleur d'accent de l'entreprise.
  icon = id: letter: pkgs.writeTextDir "share/icons/hicolor/scalable/apps/${id}.svg" ''
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect x="8" y="8" width="112" height="112" rx="28" fill="${cfg.brand.accent}"/>
      <text x="64" y="84" font-family="Inter, sans-serif" font-size="56" font-weight="600" text-anchor="middle" fill="#fff">${letter}</text>
    </svg>
  '';

  entry = { id, name, exec, comment ? null, letter }: [
    (pkgs.makeDesktopItem {
      name = id;
      desktopName = name;
      inherit exec comment;
      icon = id;
      categories = [ "Office" ];
      startupWMClass = "nova-home";
    })
    (icon id letter)
  ];

  entreprise = entry { id = "nova-entreprise"; name = "Entreprise"; exec = "nova-open \"#/\""; comment = "Toute la boîte en une vision"; letter = "◉"; };
  agents = lib.mapAttrsToList (id: a: entry {
    id = "nova-agent-${id}";
    inherit (a) name;
    exec = "nova-open \"#/agents/${id}\"";
    comment = a.description;
    letter = lib.substring 0 1 a.name;
  }) cfg.agents;
  webApps = lib.mapAttrsToList (id: w: entry {
    id = "nova-web-${id}";
    inherit (w) name;
    exec = "${openWeb id w.url}";
    letter = lib.substring 0 1 w.name;
  }) cfg.webApps;

  apps = map (a: cfg.catalog.apps.${a}) cfg.apps;

  # Ordre du dock : Entreprise, les apps de la boîte, puis les agents.
  favorites = [ "nova-entreprise.desktop" ]
    ++ map (a: a.desktop) apps
    ++ lib.mapAttrsToList (id: _: "nova-web-${id}.desktop") cfg.webApps
    ++ lib.mapAttrsToList (id: _: "nova-agent-${id}.desktop") cfg.agents;

  # Le fond : les mêmes formes douces que Nova Home (design/tokens.json, « backdrop »).
  wallpaper = pkgs.writeText "nova-fond.svg" ''
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
      <defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter></defs>
      <rect width="1920" height="1080" fill="#E8ECF4"/>
      <g filter="url(#f)" opacity=".9">
        <circle cx="300" cy="80" r="560" fill="${cfg.brand.accent}" fill-opacity=".55"/>
        <circle cx="1760" cy="260" r="420" fill="#F2B8CF"/>
        <circle cx="1350" cy="1180" r="520" fill="#C7C1F4"/>
        <circle cx="620" cy="1120" r="360" fill="#B8E6DA"/>
      </g>
    </svg>
  '';
in
{
  config = {
    services.displayManager.gdm.enable = true;
    services.desktopManager.gnome.enable = true;
    services.displayManager.autoLogin = lib.mkIf cfg.demo { enable = true; user = person; };

    # Soustraction : on retire tout ce que l'entreprise n'a pas choisi.
    services.gnome.core-apps.enable = false;
    services.gnome.core-developer-tools.enable = false;
    services.gnome.games.enable = false;
    environment.gnome.excludePackages = with pkgs; [ gnome-tour gnome-user-docs epiphany yelp ];

    environment.systemPackages = [ open nova-shell dock blur pkgs.gnome-console ]
      ++ map (a: a.package) apps
      ++ lib.flatten (entreprise ++ agents ++ webApps);

    # Tout est décidé dans company.nix : réglages appliqués et verrouillés.
    programs.dconf.profiles.user.databases = [{
      lockAll = true;
      settings = {
        "org/gnome/shell" = {
          enabled-extensions = [ dock.extensionUuid blur.extensionUuid nova-shell.extensionUuid ];
          disable-user-extensions = false;
          favorite-apps = favorites;
          welcome-dialog-last-shown-version = "999";
        };
        "org/gnome/shell/extensions/dash-to-dock" = {
          dock-position = "BOTTOM";
          dock-fixed = true;
          extend-height = false;
          dash-max-icon-size = lib.gvariant.mkInt32 52;
          show-trash = false;
          show-mounts = false;
          show-show-apps-button = false;
          disable-overview-on-startup = true;
          running-indicator-style = "DOTS";
          transparency-mode = "FIXED";
          background-opacity = 0.45;
          custom-background-color = true;
          background-color = "#ffffff";
          custom-theme-shrink = true;
          apply-custom-theme = false;
          show-icons-emblems = true;
          show-icons-notifications-counter = true;
          click-action = "focus-or-appspread";
        };
        "org/gnome/shell/extensions/blur-my-shell/panel".blur = true;
        "org/gnome/shell/extensions/blur-my-shell/dash-to-dock".blur = true;
        "org/gnome/desktop/interface" = {
          font-name = "Inter Variable 11";
          document-font-name = "Inter Variable 11";
          enable-hot-corners = false;
          color-scheme = "default";
        };
        "org/gnome/desktop/background" = {
          picture-uri = "file://${wallpaper}";
          picture-uri-dark = "file://${wallpaper}";
          picture-options = "zoom";
        };
        "org/gnome/desktop/screensaver".picture-uri = "file://${wallpaper}";
        "org/gnome/mutter".dynamic-workspaces = true;
      };
    }];

    # nova-daemon : l'API locale du poste, lancée avec la session de chaque personne.
    systemd.user.services.nova-daemon = {
      description = "Nova : API locale du poste";
      wantedBy = [ "graphical-session.target" ];
      partOf = [ "graphical-session.target" ];
      environment = {
        NOVA_COMPANY = "/etc/nova/company.json";
        NOVA_HOME_DIR = "${nova}/share/nova-home";
        NOVA_THEME_CSS = "${theme}";
        NOVA_DATA = "/var/lib/nova/data";
        NOVA_PORT = toString port;
        NOVA_DEMO = if cfg.demo then "1" else "0";
      };
      path = [ pkgs.glib.bin ]; # gdbus, pour les pastilles du dock
      serviceConfig = {
        ExecStart = "${nova}/bin/nova-daemon";
        Environment = [ "NOVA_PERSON=%u" ];
        Restart = "always";
        RestartSec = 2;
      };
    };

    # À l'ouverture de session, l'espace Entreprise s'ouvre.
    environment.etc."xdg/autostart/nova-entreprise.desktop".text = ''
      [Desktop Entry]
      Type=Application
      Name=Entreprise
      Exec=nova-open "#/"
      X-GNOME-Autostart-Delay=2
    '';

    # Signal « poste prêt » pour scripts/bench-install (port série de la VM), ignoré ailleurs.
    systemd.services.nova-pret = {
      description = "Nova : signale que le poste est prêt";
      wantedBy = [ "graphical.target" ];
      after = [ "display-manager.service" ];
      path = [ pkgs.curl ];
      serviceConfig = { Type = "oneshot"; RemainAfterExit = true; };
      script = ''
        until curl -sf http://127.0.0.1:${toString port}/api/state >/dev/null; do sleep 1; done
        [ -w /dev/ttyS0 ] && echo NOVA_PRET > /dev/ttyS0 || true
      '';
    };
  };
}
