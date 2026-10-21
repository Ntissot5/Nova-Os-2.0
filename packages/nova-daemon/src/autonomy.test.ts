import { test } from "node:test";
import assert from "node:assert/strict";
import { chf, decide, suggestion } from "./autonomy.js";
import type { Action } from "./types.js";

const limits = { paymentApprovalAboveCHF: 500, undoDelaySeconds: 120 };
const why = { rule: "r", sources: [] };
const send: Action = { tool: "mail.send", summary: "Envoyer", sensitive: true, recipients: 1, why };
const read: Action = { tool: "mail.read", summary: "Lire", sensitive: false, why };

test("une lecture part toujours tout de suite", () => {
  assert.deepEqual(decide(read, "je-valide-tout", limits), { kind: "immediat" });
});

test("je valide tout : un envoi attend une validation", () => {
  assert.equal(decide(send, "je-valide-tout", limits).kind, "validation");
});

test("je valide l'important : un envoi courant part après le délai d'annulation", () => {
  assert.deepEqual(decide(send, "je-valide-l-important", limits), { kind: "differe", seconds: 120 });
});

test("je valide l'important : un envoi massif ou à un inconnu attend", () => {
  assert.equal(decide({ ...send, recipients: 12 }, "je-valide-l-important", limits).kind, "validation");
  assert.equal(decide({ ...send, unknownRecipient: true }, "je-valide-l-important", limits).kind, "validation");
});

test("autonome : même un envoi massif garde le délai d'annulation", () => {
  assert.deepEqual(decide({ ...send, recipients: 12 }, "autonome", limits), { kind: "differe", seconds: 120 });
});

test("un paiement au-dessus du plafond est toujours validé, même en autonome", () => {
  const pay: Action = { tool: "compta.payment", summary: "Payer", sensitive: true, amountCHF: 1200, why };
  const d = decide(pay, "autonome", limits);
  assert.equal(d.kind, "validation");
  assert.match(d.kind === "validation" ? d.reason : "", /500 CHF/);
});

test("un petit paiement en autonome part après le délai", () => {
  const pay: Action = { tool: "compta.payment", summary: "Payer", sensitive: true, amountCHF: 80, why };
  assert.equal(decide(pay, "autonome", limits).kind, "differe");
});

test("Nova propose plus d'autonomie après 40 validations sans correction", () => {
  assert.equal(suggestion("je-valide-tout", 39), undefined);
  assert.match(suggestion("je-valide-tout", 40) ?? "", /40 validations/);
  assert.equal(suggestion("autonome", 100), undefined);
});

test("montants au format suisse", () => {
  assert.equal(chf(4860), "4’860 CHF");
  assert.equal(chf(1240.5), "1’240.50 CHF");
  assert.equal(chf(500), "500 CHF");
});
