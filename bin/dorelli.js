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
  lijstBestanden,
  plaatsRegels,
  publiceerMap,
  wijzigOpSite,
} from "../src/deploy.js";

const HELP = `
dorelli: put your static website online

  npx dorelli deploy [folder]   publish (or publish again)
  npx dorelli status [folder]   show status and expiry date
  npx dorelli files             list the files on your site
  npx dorelli put <file...>     add or replace files on your site, in one publication
  npx dorelli rm <path...>      remove files from your site, in one publication
  npx dorelli mcp               run as an MCP server (for Claude Code and similar)

Options for put:
  --dir <folder>     the folder on your site, for example images (default: the top)

files, put and rm read ${CONFIG_BESTAND} from the current folder, or from --site <folder>.

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

/** The site of .dorelli.json in --site or the current folder, or stop with a clear line. */
function siteUit(opties) {
  const map = path.resolve(opties.site ?? ".");
  const config = leesConfig(map);
  if (!config?.site_id || !config?.deploy_token) {
    console.error(`No ${CONFIG_BESTAND} found in ${map}. Run this where you ran deploy, or pass --site <folder>.`);
    process.exit(1);
  }
  return { api: opties.api ?? STANDAARD_API, siteId: config.site_id, token: config.deploy_token };
}

async function files(argv) {
  const { opties } = argsParsen(argv);
  try {
    const r = await lijstBestanden(siteUit(opties));
    for (const p of r.files ?? []) console.log(p);
  } catch (e) {
    console.error(`Listing the files failed: ${e.message}`);
    // Na een fetch geen process.exit: op Windows breekt Node dan af met een
    // assertie en exitcode 127, en een script leest dat verkeerd.
    process.exitCode = 1;
  }
}

/** put and rm: one publication through POST /api/deploy/<id>/changes. */
async function wijzig(argv, soort) {
  const { opties, rest } = argsParsen(argv);
  if (rest.length === 0) {
    console.error(soort === "put" ? "Name at least one file: dorelli put photo.jpg --dir images" : "Name at least one path: dorelli rm old.html");
    process.exit(1);
  }
  const site = siteUit(opties);
  const zetten = Object.create(null);
  const weg = [];
  if (soort === "put") {
    const doel = (opties.dir ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    for (const bestand of rest) {
      if (!fs.existsSync(bestand) || !fs.statSync(bestand).isFile()) {
        console.error(`Not a file: ${bestand}`);
        process.exit(1);
      }
      const naam = path.basename(bestand);
      const pad = doel ? `${doel}/${naam}` : naam;
      // a/logo.png en b/logo.png komen allebei op dezelfde plek; stil de laatste nemen verrast.
      if (Object.hasOwn(zetten, pad)) {
        console.error(`Two files would both become ${pad}. Put them one at a time, each with its own --dir.`);
        process.exit(1);
      }
      zetten[pad] = new Uint8Array(fs.readFileSync(bestand));
    }
  } else {
    for (const p of rest) weg.push(p.replace(/\\/g, "/").replace(/^\/+/, ""));
  }
  process.stderr.write("Publishing…\n");
  try {
    const r = await wijzigOpSite({ ...site, zetten, weg });
    process.stderr.write(`  ${r.changed ?? 0} added or replaced, ${r.deleted ?? 0} removed; ${r.files} files on the site\n`);
    for (const regel of plaatsRegels(r.plaats, r.warnings)) process.stderr.write(`  ${regel}\n`);
    console.log(r.url);
  } catch (e) {
    console.error(`\nPublishing failed: ${e.message}`);
    if (e.code === "conflict") console.error("Tip: someone published at the same time; run the command again.");
    process.exitCode = 1;
  }
}

const [commando, ...rest] = process.argv.slice(2);

if (commando === "deploy") await deploy(rest);
else if (commando === "status") await status(rest);
else if (commando === "files") await files(rest);
else if (commando === "put") await wijzig(rest, "put");
else if (commando === "rm") await wijzig(rest, "rm");
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
