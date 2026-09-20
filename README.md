# dorelli

Zet je statische website online op [Dorelli Cloud](https://dorelli.cloud) —
vanuit je terminal of rechtstreeks vanuit een AI-tool.

Gebouwd met Lovable, v0, Claude of Cursor? Eén commando en je site staat live
op `jouw-naam.dorelli.cloud`. Geen account nodig.

```bash
npx github:dorelli-cloud/cli deploy --email jij@voorbeeld.nl
```

De laatste regel van de uitvoer is je URL. Klaar.

> Het pakket draait rechtstreeks vanaf GitHub; je hebt alleen Node 18+ en git
> nodig. Zodra het op npm staat wordt het commando korter (`npx dorelli`).

## Wat het doet

- Zoekt zelf je buildmap (`dist`, `build`, `out`, `public`) of gebruikt de
  huidige map.
- Slaat over wat er niet in hoort: `node_modules`, `.git`, `.env`, en alles
  wat geen statisch bestand is.
- Schrijft `.dorelli.json` met je site-id en token. Draai je het nog eens, dan
  wordt **dezelfde** site bijgewerkt — handig als je met een AI-tool aan het
  itereren bent.

> Zet `.dorelli.json` niet in versiebeheer: het token is je toegang tot de site.

## Commando's

```bash
npx github:dorelli-cloud/cli deploy [map]   # publiceren of bijwerken
npx github:dorelli-cloud/cli status [map]   # adres, status en verloopdatum
npx github:dorelli-cloud/cli mcp            # draaien als MCP-server
```

Opties bij `deploy`: `--email`, `--slug`, `--yes` (niets vragen, voor scripts
en AI-tools).

Typ je het vaker, installeer het dan één keer — daarna heet het gewoon
`dorelli`:

```bash
npm install -g github:dorelli-cloud/cli
dorelli deploy
```

## Vanuit Claude Code, Codex of Cursor

Die tools hebben een terminal, dus dit werkt zonder installatie:

> "Deploy deze map naar Dorelli met npx github:dorelli-cloud/cli deploy"

Liever als MCP-tool, dan kan het model het zelf aanroepen:

```bash
claude mcp add dorelli -- npx -y github:dorelli-cloud/cli mcp
```

Daarna zijn `deploy_site` en `site_status` beschikbaar.

## Wat wordt gehost

Statische sites: HTML, CSS, afbeeldingen en JavaScript dat in de browser
draait. Heeft je project een server, database of een build-stap nodig, bouw
het dan eerst (`npm run build`) en publiceer de uitvoermap.

Een proefsite blijft 14 dagen staan en wordt niet door Google geïndexeerd.
Wil je hem houden, met je eigen domeinnaam en e-mail erbij? Dat regelt Dorelli
voor € 10 per maand — je krijgt na publicatie een mail met de beheerlink.

## Zelf een andere server gebruiken

```bash
DORELLI_API=https://voorbeeld.test npx github:dorelli-cloud/cli deploy
```

## Voor de ontwikkelaar

Deze repo is een spiegel. De bron staat in `packages/dorelli/` in de
hoofdrepo van dorelli.cloud; wijzig hem daar en kopieer hem hierheen, niet
andersom.

MIT-licentie.
