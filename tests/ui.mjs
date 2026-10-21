#!/usr/bin/env node
// Test de l'interface, de bout en bout : vrai daemon en démo, vrai navigateur.
// Vérifie l'accessibilité (WCAG AA, clair et sombre) et les gestes clés : valider, annuler, régler l'autonomie.
//   npm run test:ui     (après npm run build ; nécessite Nix pour générer company.json)

import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "nova-ui-"));
const company = join(dir, "company.json");
writeFileSync(company, process.env.NOVA_COMPANY_JSON ?? execFileSync("nix", ["eval", "--raw", ".#companyJson.demo"], { cwd: root }));
execFileSync("node", ["design/build.mjs", "theme", JSON.parse(readFileSync(company, "utf8")).brand.accent, join(dir, "theme.css")], { cwd: root });

const port = "7799";
const base = `http://127.0.0.1:${port}`;
cpSync(join(root, "companies/demo/data"), join(dir, "data"), { recursive: true });
const { ANTHROPIC_API_KEY: _k, ANTHROPIC_AUTH_TOKEN: _t, ...env } = process.env; // le test ne parle jamais au vrai modèle
const gateway = spawn("node", ["packages/nova-server/dist/gateway/main.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...env, NOVA_COMPANY: company, NOVA_DATA: join(dir, "data"), NOVA_DEMO: "1", NOVA_DEMO_SPEED: "4", NOVA_GATEWAY_PORT: "7798" },
});
const daemon = spawn("node", ["packages/nova-server/dist/daemon/main.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...env, NOVA_GATEWAY: "http://127.0.0.1:7798", NOVA_PERSON: "noa", NOVA_THEME_CSS: join(dir, "theme.css"), NOVA_HOME_DIR: "packages/nova-home/dist", NOVA_PORT: port },
});

// Un service tiers quelconque, exposé en MCP : ce que le dirigeant branche depuis l'écran Connecteurs.
const crm = createServer(async (req, res) => {
  if (req.headers.authorization !== "Bearer jeton-crm") return void res.writeHead(401).end();
  const s = new McpServer({ name: "crm", version: "1.0.0" });
  s.registerTool("chercher_client", { description: "Cherche un client", inputSchema: { nom: z.string() }, annotations: { readOnlyHint: true } }, async ({ nom }) => ({ content: [{ type: "text", text: nom }] }));
  s.registerTool("creer_client", { description: "Crée un client", inputSchema: { nom: z.string() } }, async ({ nom }) => ({ content: [{ type: "text", text: nom }] }));
  const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => void t.close());
  await s.connect(t);
  await t.handleRequest(req, res);
}).listen(7797, "127.0.0.1");

const state = async () => (await fetch(`${base}/api/state`)).json();
const until = async (what, fn, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Délai dépassé : ${what}`);
};

const browser = await chromium.launch();
const axe = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8");
let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${e.message}`);
  }
};

try {
  await until("gardien et daemon prêts", async () => (await fetch(`${base}/api/state`).catch(() => null))?.ok);

  for (const dark of [false, true])
    for (const hash of ["#/", "#/agents/locataires", "#/agents/relances", "#/demander", "#/design", "#/connecteurs"])
      await check(`accessibilité ${hash} (${dark ? "sombre" : "clair"})`, async () => {
        const page = await browser.newPage({ colorScheme: dark ? "dark" : "light" });
        await page.goto(`${base}/${hash}`);
        await page.waitForSelector("h1");
        await page.addScriptTag({ content: axe });
        const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
        await page.close();
        assert.deepEqual(r.violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target).join(", ")}`), []);
      });

  const page = await browser.newPage();
  await page.goto(`${base}/#/`);

  await check("une validation en attente se valide d'un clic", async () => {
    await until("validation en attente", async () => (await state()).approvals.length > 0);
    const before = (await state()).approvals.length;
    await page.getByRole("button", { name: "Valider" }).first().click();
    await until("validation traitée", async () => (await state()).approvals.length < before);
  });

  await check("une action différée s'annule pendant le délai", async () => {
    await until("action différée", async () => (await state()).tasks.some((t) => t.status === "differe"), 60000);
    await page.reload();
    await page.getByRole("button", { name: "Annuler" }).first().click();
    await until("annulation", async () => (await state()).tasks.some((t) => t.status === "annulee"));
  });

  await check("l'autonomie d'un agent se règle au clavier", async () => {
    await page.goto(`${base}/#/agents/compta`);
    const radio = page.getByRole("radio", { name: "Je valide l'important" });
    await radio.focus();
    await page.keyboard.press("ArrowRight");
    await until("autonomie changée", async () => (await state()).agents.find((a) => a.id === "compta").autonomy === "autonome");
  });

  await check("le journal enregistre les décisions humaines", async () => {
    const files = execFileSync("sh", ["-c", `cat ${join(dir, "data/journal")}/*.jsonl`]).toString();
    assert.match(files, /"quoi":"validation"/);
    assert.match(files, /"quoi":"annulee"/);
    assert.match(files, /"quoi":"autonomie"/);
  });

  await check("« / » ouvre Demander ; sans clé d'API, une phrase claire", async () => {
    await page.goto(`${base}/#/`);
    await page.keyboard.press("/");
    await page.waitForSelector("#question");
    await page.fill("#question", "Qui est en retard ?");
    await page.keyboard.press("Enter");
    await page.getByText("il manque la clé d'API").waitFor();
  });

  await check("une action validée passe vraiment par le connecteur (paiement ordonné)", async () => {
    const ordered = () => readFileSync(join(dir, "data/compta/ordres.csv"), "utf8").includes("2026-418");
    const pending = async () => (await state()).tasks.find((t) => t.agentId === "compta" && t.status === "en-attente" && t.action?.tool === "compta_payer");
    // La facture a peut-être déjà été validée par le test du clic : sinon, on attend qu'elle se présente.
    await until("facture payée ou en attente", async () => existsSync(join(dir, "data/compta/ordres.csv")) || (await pending()), 60000);
    const t = await pending();
    if (t) assert.equal((await fetch(`${base}/api/approvals/${t.id}/valider`, { method: "POST", headers: { "x-nova": "1" } })).status, 200);
    await until("ordre écrit", async () => existsSync(join(dir, "data/compta/ordres.csv")) && ordered());
  });

  await check("brancher un service MCP depuis l'écran Connecteurs", async () => {
    const p = await browser.newPage();
    await p.goto(`${base}/#/connecteurs`);
    await p.getByRole("button", { name: /Autre service/ }).click();
    const d = p.getByRole("dialog");
    await d.getByLabel("Nom").fill("CRM");
    await d.getByLabel("Adresse du serveur MCP").fill("http://127.0.0.1:7797/mcp");
    await d.getByLabel(/Jeton/).fill("mauvais");
    await d.getByRole("checkbox", { name: "Locataires" }).check();
    await d.getByRole("button", { name: "Brancher" }).click();
    await d.getByText("vérifie le jeton").waitFor();
    await d.getByLabel(/Jeton/).fill("jeton-crm");
    await d.getByRole("button", { name: "Brancher" }).click();
    await p.getByText(/2 outils · lecture seule · Locataires/).waitFor();
    await p.addScriptTag({ content: axe });
    const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
    assert.deepEqual(r.violations.map((v) => v.id), []);
    const tools = await (await fetch(`${base}/api/tools`)).json();
    assert.ok(tools.some((t) => t.name === "crm__chercher_client"));
    assert.ok(!readFileSync(join(dir, "data/connecteurs/ajoutes.json"), "utf8").includes("jeton-crm"));
    await p.close();
  });

  await check("un site extérieur ne peut pas piloter le daemon", async () => {
    const r = await fetch(`${base}/api/agents/compta/pause`, { method: "POST" });
    assert.equal(r.status, 403);
  });
} finally {
  await browser.close();
  daemon.kill();
  gateway.kill();
  crm.close();
}

if (failures) {
  console.error(`${failures} échec(s).`);
  process.exit(1);
}
