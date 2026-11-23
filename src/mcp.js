// MCP server (stdio) for Dorelli Cloud.
//
// Deliberately without an SDK: the stdio protocol is newline-separated
// JSON-RPC, and that takes a handful of lines. The package keeps one
// dependency (fflate), and nothing can go stale out of our sight.
//
// Two protocol eras on the same stdin, like the remote server (lib/mcp.ts):
// a message that carries a `_meta` envelope with a protocol version gets the
// stateless rules of 2026-07-28 (server/discover, no handshake); a message
// without one gets the 2025 rules with the `initialize` handshake. The era
// test is the one the official SDK uses, so a client that probes with
// server/discover first (Claude Code since 2.1.292) gets a real answer
// instead of a slow fallback.
//
// Use in Claude Code:  claude mcp add dorelli -- npx -y github:dorelli-cloud/cli mcp
//
// Tool descriptions and results are English: a model reads them.

import path from "path";
import { createRequire } from "module";
import { STANDAARD_API, haalStatus, leesConfig, locatieRegels, plaatsRegels, publiceerMap } from "./deploy.js";

/** The stateless revision: every request carries its own version and capabilities. */
const PROTOCOL_MODERN = "2026-07-28";
/** What `initialize` answers when the client asks for one of these; otherwise PROTOCOL. */
const PROTOCOLLEN_LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const PROTOCOL = "2025-06-18";
// One version, from package.json: --version, the changelog and this server say the same.
const VERSIE = createRequire(import.meta.url)("../package.json").version;
const SERVER = { name: "dorelli", version: VERSIE };

const META_VERSIE = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const TOOLS = [
  {
    name: "deploy_site",
    description:
      "Publish a folder with a static website on Dorelli Cloud. The site is online at <name>.dorelli.cloud within a minute. The first publication needs an email address; after that .dorelli.json remembers the site and this publishes the same site again.",
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Path to the folder with the site. A build folder (dist, build, out, public) is found automatically.",
        },
        email: {
          type: "string",
          description: "Email address for the management link. Only needed for the first publication.",
        },
        slug: {
          type: "string",
          description: "The subdomain you want, for example 'bakery-jansen'. Optional.",
        },
        location: {
          type: "string",
          description:
            "Where the site runs: a code from https://dorelli.cloud/api/locations, such as 'azure:westeurope'. Only for the first publication. Optional; without it Dorelli chooses, in the EU.",
        },
      },
      required: ["directory"],
    },
  },
  {
    name: "site_status",
    description:
      "Show the status of a site published earlier: its address, whether it is still active, and when the trial ends.",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Folder with .dorelli.json" },
      },
      required: ["directory"],
    },
  },
];

function stuur(bericht) {
  process.stdout.write(JSON.stringify(bericht) + "\n");
}

function antwoord(id, result) {
  stuur({ jsonrpc: "2.0", id, result });
}

function foutmelding(id, code, message, data) {
  stuur({ jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } });
}

function tekst(inhoud, isError = false) {
  return { content: [{ type: "text", text: inhoud }], isError };
}

async function roepTool(naam, args) {
  const map = path.resolve(args?.directory ?? ".");

  if (naam === "deploy_site") {
    const bestaand = leesConfig(map);
    if (!bestaand && !args?.email) {
      return tekst(
        "The first publication needs an email address (parameter 'email'). The management link goes there.",
        true
      );
    }
    const r = await publiceerMap({
      map,
      email: args?.email,
      slug: args?.slug,
      location: args?.location,
      api: STANDAARD_API,
      bron: "cli",
    });
    const regels = [
      r.nieuw ? `Site published: ${r.url}` : `Site updated: ${r.url}`,
      `${r.bestanden} ${r.bestanden === 1 ? "file" : "files"} from ${path.relative(map, r.siteMap) || "."}`,
      `Trial runs until ${r.expires_at}`,
    ];
    if (r.nieuw) regels.push(`Management link sent to ${args.email}. Created .dorelli.json: keep it, do not commit it.`);
    if (r.overgeslagen.length) {
      regels.push(`Skipped (not static): ${r.overgeslagen.slice(0, 5).join(", ")}${r.overgeslagen.length > 5 ? " …" : ""}`);
    }
    regels.push(...plaatsRegels(r.plaats, r.warnings));
    regels.push(...locatieRegels(r));
    return tekst(regels.join("\n"));
  }

  if (naam === "site_status") {
    const config = leesConfig(map);
    if (!config?.site_id) return tekst(`No .dorelli.json in ${map}: nothing has been published from here yet.`, true);
    const r = await haalStatus({ api: STANDAARD_API, siteId: config.site_id, token: config.deploy_token });
    return tekst(`${r.url}\nstatus: ${r.status}\nexpires: ${r.expires_at}\nfiles: ${r.files}`);
  }

  return tekst(`Unknown tool: ${naam}`, true);
}

/** A tools/call in either era; a failed deploy is a result the model reads, not a protocol error. */
async function toolResultaat(params) {
  try {
    return await roepTool(params?.name, params?.arguments);
  } catch (e) {
    return tekst(`Failed: ${e.message}`, true);
  }
}

/** Every modern result carries `resultType` and who answered. */
function modern(result) {
  return { ...result, resultType: "complete", _meta: { [META_SERVER_INFO]: SERVER } };
}

/**
 * One 2026-07-28 request. The checks run in the SDK's order: the envelope's
 * shape, then whether we speak the version, then the method. There are no
 * headers on stdio, so Mcp-Method and Mcp-Name do not apply here.
 */
async function verwerkModern(id, method, params) {
  const meta = params._meta;
  const versie = meta[META_VERSIE];
  const slecht = (sleutel, probleem) =>
    foutmelding(id, -32602, `Invalid _meta envelope for protocol revision ${PROTOCOL_MODERN}: ${sleutel}: ${probleem}`, { envelope: { key: sleutel, problem: probleem } });
  if (typeof versie !== "string") return slecht(META_VERSIE, "invalid");
  const caps = meta[META_CLIENT_CAPABILITIES];
  if (caps === undefined) return slecht(META_CLIENT_CAPABILITIES, "missing");
  if (typeof caps !== "object" || caps === null || Array.isArray(caps)) return slecht(META_CLIENT_CAPABILITIES, "invalid");
  if (versie !== PROTOCOL_MODERN) {
    return foutmelding(id, -32022, `Unsupported protocol version: ${versie}`, { supported: [PROTOCOL_MODERN], requested: versie });
  }
  if (method === "server/discover") {
    return antwoord(id, modern({ supportedVersions: [PROTOCOL_MODERN], capabilities: { tools: { listChanged: false } }, ttlMs: 0, cacheScope: "private" }));
  }
  if (method === "tools/list") {
    // The same two tools for everyone, so a client may keep the list for an hour.
    return antwoord(id, modern({ tools: TOOLS, ttlMs: 3_600_000, cacheScope: "public" }));
  }
  if (method === "tools/call") return antwoord(id, modern(await toolResultaat(params)));
  return foutmelding(id, -32601, "Method not found");
}

/** One 2025-era message: the handshake, then methods without an envelope. */
async function verwerkLegacy(id, method, params) {
  if (method === "initialize") {
    const gevraagd = params?.protocolVersion;
    return antwoord(id, {
      protocolVersion: PROTOCOLLEN_LEGACY.includes(gevraagd) ? gevraagd : PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER,
    });
  }
  if (method === "tools/list") return antwoord(id, { tools: TOOLS });
  if (method === "tools/call") return antwoord(id, await toolResultaat(params));
  if (method === "ping") return antwoord(id, {});
  return foutmelding(id, -32601, `unknown method: ${method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (stuk) => {
  buffer += stuk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const regel = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!regel) continue;

    let bericht;
    try {
      bericht = JSON.parse(regel);
    } catch {
      continue; // skip an unreadable line; there is no id to answer
    }
    // A line that is JSON but not a message (null, a number, an array) has no
    // id to answer either, and must never stop the server.
    if (!bericht || typeof bericht !== "object" || Array.isArray(bericht)) continue;

    const { id, method, params } = bericht;
    // Notifications (without an id) need no answer.
    if (id === undefined) continue;

    try {
      const meta = params && typeof params === "object" ? params._meta : undefined;
      if (meta && typeof meta === "object" && meta[META_VERSIE] !== undefined) await verwerkModern(id, method, params);
      else await verwerkLegacy(id, method, params);
    } catch (e) {
      foutmelding(id, -32603, e.message);
    }
  }
});
