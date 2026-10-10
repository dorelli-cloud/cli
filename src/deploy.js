// Gedeelde deploy-logica voor de CLI en de MCP-server.
//
// Beide zijn schillen om dezelfde HTTP-API; er staat hier bewust geen
// kanaalspecifieke logica in.

import fs from "fs";
import path from "path";
import { zipSync } from "fflate";

export const STANDAARD_API = process.env.DORELLI_API ?? "https://dorelli.cloud";
export const CONFIG_BESTAND = ".dorelli.json";

// Mappen die nooit mee moeten: buildgereedschap, versiebeheer, geheimen.
const OVERSLAAN = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".vercel", ".netlify",
  ".cache", "coverage", ".turbo", ".parcel-cache", ".vscode", ".idea", ".claude",
]);

// Alleen wat een browser statisch kan tonen; spiegelt de whitelist op de server.
const TOEGESTAAN = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".map",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".txt", ".webmanifest", ".json", ".xml", ".pdf", ".mp4", ".webm", ".mp3",
]);

/** Zoekt de map die gepubliceerd moet worden: een buildmap, anders de map zelf. */
export function vindSiteMap(basis) {
  for (const kandidaat of ["dist", "build", "out", "public", "_site"]) {
    const pad = path.join(basis, kandidaat);
    if (fs.existsSync(path.join(pad, "index.html"))) return pad;
  }
  return basis;
}

/** Verzamelt de publiceerbare bestanden, met dezelfde grenzen als de server. */
export function verzamelBestanden(map, { maxBestanden = 500 } = {}) {
  const bestanden = {};
  const overgeslagen = [];
  let aantal = 0;

  const loop = (huidig, voorvoegsel) => {
    for (const item of fs.readdirSync(huidig, { withFileTypes: true })) {
      if (item.name.startsWith(".") || OVERSLAAN.has(item.name)) continue;
      const vol = path.join(huidig, item.name);
      const rel = voorvoegsel ? `${voorvoegsel}/${item.name}` : item.name;

      if (item.isSymbolicLink()) continue; // nooit buiten de map wijzen
      if (item.isDirectory()) {
        loop(vol, rel);
        continue;
      }
      // _redirects heeft geen extensie, maar de server kent hem in de wortel.
      const omleidingen = !voorvoegsel && item.name === "_redirects";
      if (!omleidingen && !TOEGESTAAN.has(path.extname(item.name).toLowerCase())) {
        overgeslagen.push(rel);
        continue;
      }
      if (++aantal > maxBestanden) {
        throw new Error(`meer dan ${maxBestanden} bestanden — publiceer een buildmap in plaats van het hele project`);
      }
      bestanden[rel] = new Uint8Array(fs.readFileSync(vol));
    }
  };

  loop(map, "");
  return { bestanden, overgeslagen };
}

/**
 * Haalt de plaats uit foto's voordat ze de laptop verlaten, met dezelfde
 * functie als de server (lib/beeld-metadata.ts, omgezet door
 * scripts/cli-beeld-metadata.mjs). Alleen wat geüpload wordt verandert; de
 * bestanden in de map van de klant blijven zoals ze zijn. Gaat hier iets mis,
 * dan gaan de originelen mee en doet de server zijn eigen ronde, zoals altijd.
 *
 * `haal` is er voor de proef; normaal laadt hij de functie zelf.
 */
export async function zonderPlaats(bestanden, haal) {
  try {
    const functie = haal ?? (await import("./beeld-metadata.js")).haalLocatieWeg;
    const lijst = Object.entries(bestanden).map(([pad, inhoud]) => ({ pad, inhoud }));
    const r = functie(lijst);
    // Alleen een uitkomst met precies dezelfde paden, op dezelfde volgorde, telt.
    const vorm = r?.bestanden?.length === lijst.length && Array.isArray(r.weg) && Array.isArray(r.niet);
    if (!vorm || !r.bestanden.every((b, i) => b.pad === lijst[i].pad && b.inhoud instanceof Uint8Array)) {
      throw new Error("onverwachte uitkomst");
    }
    const schoon = {};
    for (const b of r.bestanden) schoon[b.pad] = b.inhoud;
    return { bestanden: schoon, plaats: { weg: r.weg, niet: r.niet, fout: false } };
  } catch {
    return { bestanden, plaats: { weg: [], niet: [], fout: true } };
  }
}

/**
 * Wat de CLI en de MCP over de plaats in foto's zeggen, en daarna wat de
 * server meldt (zijn `warnings`, in het Engels). Leeg als er niets te zeggen is.
 */
export function plaatsRegels(plaats, warnings = []) {
  const regels = [];
  if (plaats?.fout) {
    regels.push("De plaats in foto's kon hier niet weg; de server haalt hem eruit voordat de site online komt.");
  } else if (plaats) {
    const n = plaats.weg.length;
    if (n === 1) regels.push("Plaats uit 1 foto gehaald voordat hij je computer verliet.");
    if (n > 1) regels.push(`Plaats uit ${n} foto's gehaald voordat ze je computer verlieten.`);
    if (plaats.niet.length) {
      const lijst = plaats.niet.slice(0, 5).join(", ") + (plaats.niet.length > 5 ? ` en nog ${plaats.niet.length - 5}` : "");
      regels.push(`Niet zeker zonder plaats: ${lijst}. De server probeert het nog een keer; wil je zeker zijn, haal de plaats er dan zelf uit.`);
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

/** Eerste publicatie: maakt een nieuwe site aan. */
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

/** Opnieuw publiceren op dezelfde slug. */
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
 * Publiceert een map: kiest zelf tussen nieuw en opnieuw op basis van
 * .dorelli.json, en schrijft dat bestand na een eerste publicatie weg.
 */
export async function publiceerMap({ map, email, slug, api = STANDAARD_API, bron = "cli" }) {
  const siteMap = vindSiteMap(map);
  if (!fs.existsSync(path.join(siteMap, "index.html"))) {
    throw new Error(
      `geen index.html gevonden in ${siteMap} — een statische site heeft een startpagina nodig`
    );
  }

  const { bestanden: origineel, overgeslagen } = verzamelBestanden(siteMap);
  // Vlak voor het inpakken: de plaats gaat uit de foto's die we versturen.
  const { bestanden, plaats } = await zonderPlaats(origineel);
  const zip = maakZip(bestanden);
  const config = leesConfig(map);

  if (config?.site_id && config?.deploy_token) {
    const r = await publiceerOpnieuw({ api, zip, siteId: config.site_id, token: config.deploy_token });
    return { ...r, nieuw: false, overgeslagen, siteMap, bestanden: Object.keys(bestanden).length, plaats };
  }

  if (!email) throw new Error("e-mailadres nodig voor de eerste publicatie");
  const r = await publiceerNieuw({ api, zip, email, slug, bron });
  schrijfConfig(map, {
    site_id: r.site_id,
    slug: r.slug,
    url: r.url,
    // Dit token is het bewijs van eigendom; niet in versiebeheer zetten.
    deploy_token: r.deploy_token,
  });
  return { ...r, nieuw: true, overgeslagen, siteMap, bestanden: Object.keys(bestanden).length, plaats };
}
