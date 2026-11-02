// Shared deploy logic for the CLI and the MCP server.
//
// Both are shells around the same HTTP API; on purpose there is no
// channel-specific logic here. Everything a user or an agent reads is English.

import fs from "fs";
import path from "path";
import { zipSync } from "fflate";

export const STANDAARD_API = process.env.DORELLI_API ?? "https://dorelli.cloud";
export const CONFIG_BESTAND = ".dorelli.json";

// Folders that never go along: build tools, version control, secrets.
const OVERSLAAN = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".vercel", ".netlify",
  ".cache", "coverage", ".turbo", ".parcel-cache", ".vscode", ".idea", ".claude",
]);

// Only what a browser can show statically; mirrors the allow list on the server.
const TOEGESTAAN = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".map",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".txt", ".webmanifest", ".json", ".xml", ".pdf", ".mp4", ".webm", ".mp3",
]);

/** Finds the folder to publish: a build folder, otherwise the folder itself. */
export function vindSiteMap(basis) {
  for (const kandidaat of ["dist", "build", "out", "public", "_site"]) {
    const pad = path.join(basis, kandidaat);
    if (fs.existsSync(path.join(pad, "index.html"))) return pad;
  }
  return basis;
}

/** Collects the files to publish, with the same limits as the server. */
export function verzamelBestanden(map, { maxBestanden = 500 } = {}) {
  const bestanden = {};
  const overgeslagen = [];
  let aantal = 0;

  const loop = (huidig, voorvoegsel) => {
    for (const item of fs.readdirSync(huidig, { withFileTypes: true })) {
      if (item.name.startsWith(".") || OVERSLAAN.has(item.name)) continue;
      const vol = path.join(huidig, item.name);
      const rel = voorvoegsel ? `${voorvoegsel}/${item.name}` : item.name;

      if (item.isSymbolicLink()) continue; // never point outside the folder
      if (item.isDirectory()) {
        loop(vol, rel);
        continue;
      }
      // _redirects has no extension, but the server knows it in the root.
      const omleidingen = !voorvoegsel && item.name === "_redirects";
      if (!omleidingen && !TOEGESTAAN.has(path.extname(item.name).toLowerCase())) {
        overgeslagen.push(rel);
        continue;
      }
      if (++aantal > maxBestanden) {
        throw new Error(`more than ${maxBestanden} files: publish a build folder instead of the whole project`);
      }
      bestanden[rel] = new Uint8Array(fs.readFileSync(vol));
    }
  };

  loop(map, "");
  return { bestanden, overgeslagen };
}

/**
 * Removes the location from photos before they leave the laptop, with the
 * same function as the server (lib/beeld-metadata.ts, converted by
 * scripts/cli-beeld-metadata.mjs). Only what is uploaded changes; the files
 * in the customer's folder stay as they are. If something goes wrong here,
 * the originals go along and the server does its own pass, as always.
 *
 * `haal` is there for the test; normally it loads the function itself.
 */
export async function zonderPlaats(bestanden, haal) {
  try {
    const functie = haal ?? (await import("./beeld-metadata.js")).haalLocatieWeg;
    const lijst = Object.entries(bestanden).map(([pad, inhoud]) => ({ pad, inhoud }));
    const r = functie(lijst);
    // Only a result with exactly the same paths, in the same order, counts.
    const vorm = r?.bestanden?.length === lijst.length && Array.isArray(r.weg) && Array.isArray(r.niet);
    if (!vorm || !r.bestanden.every((b, i) => b.pad === lijst[i].pad && b.inhoud instanceof Uint8Array)) {
      throw new Error("unexpected result");
    }
    const schoon = {};
    for (const b of r.bestanden) schoon[b.pad] = b.inhoud;
    return { bestanden: schoon, plaats: { weg: r.weg, niet: r.niet, fout: false } };
  } catch {
    return { bestanden, plaats: { weg: [], niet: [], fout: true } };
  }
}

/**
 * What the CLI and the MCP say about the location in photos, followed by
 * what the server reports (its `warnings`). Empty when there is nothing to say.
 */
export function plaatsRegels(plaats, warnings = []) {
  const regels = [];
  if (plaats?.fout) {
    regels.push("Could not remove the location from photos here; the server removes it before the site goes online.");
  } else if (plaats) {
    const n = plaats.weg.length;
    if (n === 1) regels.push("Removed the location from 1 photo before it left your computer.");
    if (n > 1) regels.push(`Removed the location from ${n} photos before they left your computer.`);
    if (plaats.niet.length) {
      const lijst = plaats.niet.slice(0, 5).join(", ") + (plaats.niet.length > 5 ? ` and ${plaats.niet.length - 5} more` : "");
      regels.push(`Not sure the location is gone from: ${lijst}. The server tries again; to be sure, remove the location yourself.`);
    }
  }
  for (const w of Array.isArray(warnings) ? warnings : []) {
    if (typeof w?.message === "string" && w.message) regels.push(`Server: ${w.message}`);
  }
  return regels;
}

export function maakZip(bestanden) {
  return zipSync(bestanden, { level: 6 });
}

export function leesConfig(map) {
  const pad = path.join(map, CONFIG_BESTAND);
  if (!fs.existsSync(pad)) return null;
  try {
    return JSON.parse(fs.readFileSync(pad, "utf8"));
  } catch {
    return null;
  }
}

export function schrijfConfig(map, data) {
  fs.writeFileSync(path.join(map, CONFIG_BESTAND), JSON.stringify(data, null, 2) + "\n");
}

async function verwerk(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message ?? `HTTP ${res.status}`);
    err.code = json.error ?? String(res.status);
    throw err;
  }
  return json;
}

/** First publication: creates a new site. */
export async function publiceerNieuw({ api = STANDAARD_API, zip, email, slug, bron = "cli" }) {
  const res = await fetch(`${api}/api/deploy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      slug: slug || undefined,
      source: bron,
      zip_base64: Buffer.from(zip).toString("base64"),
    }),
  });
  return verwerk(res);
}

/** Publish again on the same slug. */
export async function publiceerOpnieuw({ api = STANDAARD_API, zip, siteId, token }) {
  const res = await fetch(`${api}/api/deploy/${siteId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ zip_base64: Buffer.from(zip).toString("base64") }),
  });
  return verwerk(res);
}

export async function haalStatus({ api = STANDAARD_API, siteId, token }) {
  const res = await fetch(`${api}/api/deploy/${siteId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return verwerk(res);
}

/**
 * Publishes a folder: chooses between new and again based on .dorelli.json,
 * and writes that file after a first publication.
 */
export async function publiceerMap({ map, email, slug, api = STANDAARD_API, bron = "cli" }) {
  const siteMap = vindSiteMap(map);
  if (!fs.existsSync(path.join(siteMap, "index.html"))) {
    throw new Error(
      `no index.html found in ${siteMap}: a static site needs a start page`
    );
  }

  const { bestanden: origineel, overgeslagen } = verzamelBestanden(siteMap);
  // Right before packing: the location comes out of the photos we send.
  const { bestanden, plaats } = await zonderPlaats(origineel);
  const zip = maakZip(bestanden);
  const config = leesConfig(map);

  if (config?.site_id && config?.deploy_token) {
    const r = await publiceerOpnieuw({ api, zip, siteId: config.site_id, token: config.deploy_token });
    return { ...r, nieuw: false, overgeslagen, siteMap, bestanden: Object.keys(bestanden).length, plaats };
  }

  if (!email) throw new Error("an email address is needed for the first publication");
  const r = await publiceerNieuw({ api, zip, email, slug, bron });
  schrijfConfig(map, {
    site_id: r.site_id,
    slug: r.slug,
    url: r.url,
    // This token is the proof of ownership; keep it out of version control.
    deploy_token: r.deploy_token,
  });
  return { ...r, nieuw: true, overgeslagen, siteMap, bestanden: Object.keys(bestanden).length, plaats };
}
