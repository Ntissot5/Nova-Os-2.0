// Nova Shell : la barre du haut de Nova OS.
// À gauche, le nom de l'entreprise (ouvre l'espace Entreprise) puis « Demander… » (questions en
// langage naturel). À droite, « 2 à valider » quand
// une action attend. Les données viennent de nova-daemon ; l'extension ne décide rien.

import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Soup from "gi://Soup?version=3.0";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const DAEMON = "http://127.0.0.1:7777/api/state";
const POLL_SECONDS = 3;

const NovaButton = GObject.registerClass(
  class NovaButton extends PanelMenu.Button {
    _init(name, styleClass, onActivate) {
      super._init(0.0, name, true);
      this._label = new St.Label({ text: name, y_align: Clutter.ActorAlign.CENTER, style_class: styleClass });
      this.add_child(this._label);
      this._onActivate = onActivate;
    }

    setText(text) {
      this._label.text = text;
      this.accessible_name = text;
    }

    vfunc_event(event) {
      const type = event.type();
      const key = type === Clutter.EventType.KEY_PRESS ? event.get_key_symbol() : null;
      if (
        type === Clutter.EventType.BUTTON_RELEASE ||
        type === Clutter.EventType.TOUCH_END ||
        key === Clutter.KEY_Return ||
        key === Clutter.KEY_space
      ) {
        this._onActivate();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    }
  },
);

const open = (hash) => GLib.spawn_command_line_async(`nova-open '${hash}'`);

export default class NovaShell extends Extension {
  enable() {
    this._session = new Soup.Session({ timeout: 2 });
    this._company = new NovaButton(readCompanyName(), "nova-company", () => open("#/"));
    this._ask = new NovaButton("Demander…", "nova-ask", () => open("#/demander"));
    this._pending = new NovaButton("", "nova-pending", () => open("#/"));
    this._pending.hide();

    // Le bouton « Activités » laisse sa place au nom de l'entreprise.
    Main.panel.statusArea.activities?.hide();
    Main.panel.addToStatusArea("nova-company", this._company, 0, "left");
    Main.panel.addToStatusArea("nova-ask", this._ask, 1, "left");
    Main.panel.addToStatusArea("nova-pending", this._pending, 0, "right");

    this._poll();
    this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
      this._poll();
      return GLib.SOURCE_CONTINUE;
    });
  }

  disable() {
    if (this._timer) GLib.source_remove(this._timer);
    this._timer = null;
    this._session?.abort();
    this._session = null;
    this._company?.destroy();
    this._ask?.destroy();
    this._pending?.destroy();
    this._company = this._ask = this._pending = null;
    Main.panel.statusArea.activities?.show();
  }

  _poll() {
    const session = this._session;
    if (!session) return;
    const msg = Soup.Message.new("GET", DAEMON);
    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (s, res) => {
      if (!this._pending) return;
      try {
        const bytes = s.send_and_read_finish(res);
        const state = JSON.parse(new TextDecoder().decode(bytes.get_data()));
        const n = state.approvals.length;
        this._pending.setText(n === 1 ? "1 à valider" : `${n} à valider`);
        this._pending.visible = n > 0;
      } catch {
        this._pending.visible = false;
      }
    });
  }
}

function readCompanyName() {
  try {
    const [, bytes] = Gio.File.new_for_path("/etc/nova/company.json").load_contents(null);
    return JSON.parse(new TextDecoder().decode(bytes)).company.name;
  } catch {
    return "Nova";
  }
}
