#!/usr/bin/env node
// CLI voor Dorelli Cloud.
//
// Bedoeld om óók door een AI-tool gedraaid te worden: Claude Code, Codex en
// Cursor hebben allemaal een shell en volgen "run npx dorelli deploy" zonder
// dat de gebruiker iets hoeft te configureren. Daarom is de uitvoer kort en
// eenduidig, en staat het resultaat altijd op de laatste regel.

import fs from "fs";
import path from "path";
import readline from "readline";
import {
  CONFIG_BESTAND,
  STANDAARD_API,
  haalStatus,
  leesConfig,
  publiceerMap,
} from "../src/deploy.js";

const HELP = `
dorelli — zet je statische website online

  npx dorelli deploy [map]     publiceer (of publiceer opnieuw)
  npx dorelli status [map]     toon status en verloopdatum
  npx dorelli mcp              draai als MCP-server (voor Claude Code e.d.)

Opties bij deploy:
  --email <adres>    nodig bij de eerste publicatie
  --slug <naam>      gewenst subdomein (anders kiezen wij er een)
  --yes              niets vragen (voor gebruik door scripts en AI-tools)

De eerste publicatie schrijft ${CONFIG_BESTAND} met je site-id en token.
Bewaar dat bestand, maar zet het niet in versiebeheer.

Een app met database (Node/Next)? Die wordt op GitHub gebouwd, niet hier:
zet de GitHub Action dorelli-deploy met plan: app in je repository.
Zie https://dorelli.cloud/deployen en https://dorelli.cloud/prijzen.
`;

function argsParsen(argv) {
  const opties = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes" || a === "-y") opties.yes = true;
    else if (a.startsWith("--")) opties[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  return { opties, rest };
}

function vraag(tekst) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((r) => rl.question(tekst, (a) => (rl.close(), r(a.trim()))));
}

async function deploy(argv) {
  const { opties, rest } = argsParsen(argv);
  const map = path.resolve(rest[0] ?? ".");
  const api = opties.api ?? STANDAARD_API;

  if (!fs.existsSync(map)) {
    console.error(`Map bestaat niet: ${map}`);
    process.exit(1);
  }

  const bestaand = leesConfig(map);
  let email = opties.email;
  if (!bestaand && !email) {
    if (opties.yes || !process.stdin.isTTY) {
      console.error("Eerste publicatie heeft een e-mailadres nodig: --email jij@voorbeeld.nl");
      process.exit(1);
    }
    email = await vraag("E-mailadres (voor de beheerlink): ");
  }

  process.stderr.write(bestaand ? "Opnieuw publiceren…\n" : "Publiceren…\n");

  try {
    const r = await publiceerMap({ map, email, slug: opties.slug, api });

    for (const o of r.overgeslagen.slice(0, 5)) {
      process.stderr.write(`  overgeslagen (niet-statisch): ${o}\n`);
    }
    if (r.overgeslagen.length > 5) {
      process.stderr.write(`  …en nog ${r.overgeslagen.length - 5} bestanden\n`);
    }
    process.stderr.write(`  ${r.bestanden} bestanden uit ${path.relative(map, r.siteMap) || "."}\n`);
    if (r.nieuw) {
      process.stderr.write(`  ${CONFIG_BESTAND} aangemaakt — bewaren, niet committen\n`);
      process.stderr.write(`  beheerlink is gemaild naar ${email}\n`);
    }

    // Laatste regel is de URL: makkelijk te lezen voor mens en script.
    console.log(r.url);
  } catch (e) {
    console.error(`\nPubliceren mislukt: ${e.message}`);
    if (e.code === "blocked") {
      console.error("De inhoud is door de moderatie tegengehouden.");
    } else if (e.code === "bad_type") {
      console.error("Tip: de CLI publiceert statische sites. Bouw je project eerst (npm run build), of gebruik voor een Node-app de GitHub Action met plan: app.");
    } else if (e.code === "rate_limited") {
      console.error("Tip: wacht even; er geldt een limiet op nieuwe sites per uur.");
    }
    process.exit(1);
  }
}

async function status(argv) {
  const { rest, opties } = argsParsen(argv);
  const map = path.resolve(rest[0] ?? ".");
  const config = leesConfig(map);
  if (!config?.site_id) {
    console.error(`Geen ${CONFIG_BESTAND} gevonden in ${map} — nog niets gepubliceerd?`);
    process.exit(1);
  }
  try {
    const r = await haalStatus({
      api: opties.api ?? STANDAARD_API,
      siteId: config.site_id,
      token: config.deploy_token,
    });
    console.log(`${r.url}\nplan: ${r.plan ?? "website"}\nstatus: ${r.status}\nverloopt: ${r.expires_at}\n${r.plan === "app" ? `image: ${r.image ?? "-"}` : `bestanden: ${r.files}`}`);
  } catch (e) {
    console.error(`Status ophalen mislukt: ${e.message}`);
    process.exit(1);
  }
}

const [commando, ...rest] = process.argv.slice(2);

if (commando === "deploy") await deploy(rest);
else if (commando === "status") await status(rest);
else if (commando === "mcp") await import("../src/mcp.js");
else if (commando === "--version" || commando === "-v") {
  const pkg = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
  );
  console.log(pkg.version);
} else {
  console.log(HELP.trim());
  if (commando && commando !== "help" && commando !== "--help") process.exit(1);
}
