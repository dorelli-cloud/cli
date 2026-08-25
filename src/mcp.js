// MCP-server (stdio) voor Dorelli Hosting.
//
// Bewust zonder SDK: het stdio-protocol is regel-gescheiden JSON-RPC, en dat is
// een handvol regels. Zo blijft het pakket op één afhankelijkheid (fflate) en
// is er niets dat kan verouderen buiten ons zicht om.
//
// Gebruik in Claude Code:  claude mcp add dorelli -- npx -y dorelli mcp

import path from "path";
import { STANDAARD_API, haalStatus, leesConfig, publiceerMap } from "./deploy.js";

const PROTOCOL = "2024-11-05";

const TOOLS = [
  {
    name: "deploy_site",
    description:
      "Publiceer een map met een statische website op Dorelli Hosting. De site komt binnen een minuut online op <naam>.dorelli.cloud. Bij de eerste publicatie is een e-mailadres nodig; daarna onthoudt .dorelli.json de site en publiceert dit dezelfde site opnieuw.",
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Pad naar de map met de site. Een build-map (dist, build, out, public) wordt automatisch gevonden.",
        },
        email: {
          type: "string",
          description: "E-mailadres voor de beheerlink. Alleen nodig bij de eerste publicatie.",
        },
        slug: {
          type: "string",
          description: "Gewenst subdomein, bijvoorbeeld 'bakkerij-jansen'. Optioneel.",
        },
      },
      required: ["directory"],
    },
  },
  {
    name: "site_status",
    description:
      "Toon de status van een eerder gepubliceerde site: adres, of hij nog actief is, en wanneer de proefperiode afloopt.",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Map met .dorelli.json" },
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

function foutmelding(id, code, message) {
  stuur({ jsonrpc: "2.0", id, error: { code, message } });
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
        "Voor de eerste publicatie is een e-mailadres nodig (parameter 'email'). Daar gaat de beheerlink heen.",
        true
      );
    }
    const r = await publiceerMap({
      map,
      email: args?.email,
      slug: args?.slug,
      api: STANDAARD_API,
      bron: "cli",
    });
    const regels = [
      r.nieuw ? `Site gepubliceerd: ${r.url}` : `Site bijgewerkt: ${r.url}`,
      `${r.bestanden} bestanden uit ${path.relative(map, r.siteMap) || "."}`,
      `Proefperiode loopt tot ${r.expires_at}`,
    ];
    if (r.nieuw) regels.push(`Beheerlink gemaild naar ${args.email}. .dorelli.json aangemaakt — bewaren, niet committen.`);
    if (r.overgeslagen.length) {
      regels.push(`Overgeslagen (niet-statisch): ${r.overgeslagen.slice(0, 5).join(", ")}${r.overgeslagen.length > 5 ? " …" : ""}`);
    }
    return tekst(regels.join("\n"));
  }

  if (naam === "site_status") {
    const config = leesConfig(map);
    if (!config?.site_id) return tekst(`Geen .dorelli.json in ${map} — er is hier nog niets gepubliceerd.`, true);
    const r = await haalStatus({ api: STANDAARD_API, siteId: config.site_id, token: config.deploy_token });
    return tekst(`${r.url}\nstatus: ${r.status}\nverloopt: ${r.expires_at}\nbestanden: ${r.files}`);
  }

  return tekst(`Onbekende tool: ${naam}`, true);
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
      continue; // onleesbare regel overslaan; geen id om op te antwoorden
    }

    const { id, method, params } = bericht;
    // Notificaties (zonder id) hoeven geen antwoord.
    if (id === undefined) continue;

    try {
      if (method === "initialize") {
        antwoord(id, {
          protocolVersion: PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: "dorelli", version: "0.1.0" },
        });
      } else if (method === "tools/list") {
        antwoord(id, { tools: TOOLS });
      } else if (method === "tools/call") {
        antwoord(id, await roepTool(params?.name, params?.arguments));
      } else if (method === "ping") {
        antwoord(id, {});
      } else {
        foutmelding(id, -32601, `onbekende methode: ${method}`);
      }
    } catch (e) {
      // Een mislukte deploy is een normaal resultaat voor de aanroeper, geen
      // protocolfout: teruggeven als tekst zodat het model het kan lezen.
      if (method === "tools/call") antwoord(id, tekst(`Mislukt: ${e.message}`, true));
      else foutmelding(id, -32603, e.message);
    }
  }
});
