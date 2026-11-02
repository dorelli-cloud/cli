#!/usr/bin/env node
// CLI for Dorelli Cloud.
//
// Meant to be run by an AI tool as well: Claude Code, Codex and Cursor all
// have a shell and follow "run npx dorelli deploy" without the user having to
// configure anything. That is why the output is short and unambiguous, and the
// result is always on the last line.
//
// All output is English, like llms.txt: an agent or a developer outside the
// Netherlands can read what went wrong.

import fs from "fs";
import path from "path";
import readline from "readline";
import {
  CONFIG_BESTAND,
  STANDAARD_API,
  haalStatus,
  leesConfig,
  plaatsRegels,
  publiceerMap,
} from "../src/deploy.js";

const HELP = `
dorelli: put your static website online

  npx dorelli deploy [folder]   publish (or publish again)
  npx dorelli status [folder]   show status and expiry date
  npx dorelli mcp               run as an MCP server (for Claude Code and similar)

Options for deploy:
  --email <address>  needed for the first publication
  --slug <name>      the subdomain you want (otherwise we pick one)
  --yes              never ask anything (for scripts and AI tools)

The first publication writes ${CONFIG_BESTAND} with your site id and token.
Keep that file, but keep it out of version control.

An app with a database (Node/Next)? That is built on GitHub, not here:
add the GitHub Action dorelli-deploy with plan: app to your repository.
See https://dorelli.cloud/deploy and https://dorelli.cloud/pricing.
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
    console.error(`Folder does not exist: ${map}`);
    process.exit(1);
  }

  const bestaand = leesConfig(map);
  let email = opties.email;
  if (!bestaand && !email) {
    if (opties.yes || !process.stdin.isTTY) {
      console.error("The first publication needs an email address: --email you@example.com");
      process.exit(1);
    }
    email = await vraag("Email address (for the management link): ");
  }

  process.stderr.write(bestaand ? "Publishing again…\n" : "Publishing…\n");

  try {
    const r = await publiceerMap({ map, email, slug: opties.slug, api });

    for (const o of r.overgeslagen.slice(0, 5)) {
      process.stderr.write(`  skipped (not static): ${o}\n`);
    }
    if (r.overgeslagen.length > 5) {
      process.stderr.write(`  …and ${r.overgeslagen.length - 5} more files\n`);
    }
    process.stderr.write(`  ${r.bestanden} ${r.bestanden === 1 ? "file" : "files"} from ${path.relative(map, r.siteMap) || "."}\n`);
    for (const regel of plaatsRegels(r.plaats, r.warnings)) process.stderr.write(`  ${regel}\n`);
    if (r.nieuw) {
      process.stderr.write(`  ${CONFIG_BESTAND} created: keep it, do not commit it\n`);
      process.stderr.write(`  management link sent to ${email}\n`);
    }

    // The last line is the URL: easy to read for people and scripts.
    console.log(r.url);
  } catch (e) {
    console.error(`\nPublishing failed: ${e.message}`);
    if (e.code === "blocked") {
      console.error("Moderation stopped the content.");
    } else if (e.code === "bad_type") {
      console.error("Tip: the CLI publishes static sites. Build your project first (npm run build), or use the GitHub Action with plan: app for a Node app.");
    } else if (e.code === "rate_limited") {
      console.error("Tip: wait a while; there is a limit on new sites per hour.");
    }
    process.exit(1);
  }
}

async function status(argv) {
  const { rest, opties } = argsParsen(argv);
  const map = path.resolve(rest[0] ?? ".");
  const config = leesConfig(map);
  if (!config?.site_id) {
    console.error(`No ${CONFIG_BESTAND} found in ${map}. Nothing published from here yet?`);
    process.exit(1);
  }
  try {
    const r = await haalStatus({
      api: opties.api ?? STANDAARD_API,
      siteId: config.site_id,
      token: config.deploy_token,
    });
    console.log(`${r.url}\nplan: ${r.plan ?? "website"}\nstatus: ${r.status}\nexpires: ${r.expires_at}\n${r.plan === "app" ? `image: ${r.image ?? "-"}` : `files: ${r.files}`}`);
  } catch (e) {
    console.error(`Getting the status failed: ${e.message}`);
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
