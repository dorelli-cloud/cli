# dorelli

Put your static website online on [Dorelli Cloud](https://dorelli.cloud),
from your terminal or straight from an AI tool.

Built with Lovable, v0, Claude or Cursor? One command and your site is live
on `your-name.dorelli.cloud`. No account needed.

```bash
npx github:dorelli-cloud/cli deploy --email you@example.com
```

The last line of the output is your URL. Done.

> The package runs straight from GitHub; you only need Node 18+ and git.
> Once it is on npm the command gets shorter (`npx dorelli`).

## What it does

- Finds your build folder (`dist`, `build`, `out`, `public`) by itself, or
  uses the current folder.
- Skips what does not belong: `node_modules`, `.git`, `.env`, and everything
  that is not a static file.
- Removes the stored location (GPS) from your photos before they leave your
  computer, with the same code as the server. That happens in what is sent;
  the photos in your folder stay as they are. The output says how many photos
  that was, and which ones are not certainly clean. The server checks them
  again afterwards.
- Writes `.dorelli.json` with your site id and token. Run it again and the
  **same** site is updated, handy while you iterate with an AI tool.

> Keep `.dorelli.json` out of version control: the token is your access to the site.

All output is in English, so an agent or a developer anywhere can read what
went wrong. The last line of a successful deploy is always the URL.

## Commands

```bash
npx github:dorelli-cloud/cli deploy [folder]   # publish or update
npx github:dorelli-cloud/cli status [folder]   # address, status and expiry date
npx github:dorelli-cloud/cli files             # list the files on your site
npx github:dorelli-cloud/cli put <file...>     # add or replace files, in one publish
npx github:dorelli-cloud/cli rm <path...>      # remove files, in one publish
npx github:dorelli-cloud/cli mcp               # run as an MCP server
```

Options for `deploy`: `--email`, `--slug`, `--yes` (never ask anything, for
scripts and AI tools).

`put` and `rm` change a few files without the rest of the site on your
computer, for example a new photo: `put photo.jpg --dir images`. Each command
is one publish with the same check as a deploy, and photos lose their stored
location first. They read `.dorelli.json` from the current folder, or from
`--site <folder>`. Since version 0.4.0.

Typing it often? Install it once, and after that it is just `dorelli`:

```bash
npm install -g github:dorelli-cloud/cli
dorelli deploy
```

## From Claude Code, Codex or Cursor

Those tools have a terminal, so this works without installing anything:

> "Deploy this folder to Dorelli with npx github:dorelli-cloud/cli deploy"

Prefer an MCP tool, so the model can call it itself:

```bash
claude mcp add dorelli -- npx -y github:dorelli-cloud/cli mcp
```

After that `deploy_site` and `site_status` are available.

## What is hosted

Static sites: HTML, CSS, images and JavaScript that runs in the browser. If
your project needs a server, a database or a build step, build it first
(`npm run build`) and publish the output folder.

A trial site stays up for 14 days and is not indexed by Google. Want to keep
it, with your own domain name and email? Dorelli does that for € 10 a month;
after publishing you get an email with the management link.

## Using another server

```bash
DORELLI_API=https://example.test npx github:dorelli-cloud/cli deploy
```

## For the developer

This repo is a mirror. The source lives in `packages/dorelli/` in the main
repo of dorelli.cloud; change it there and copy it here, not the other way
round. `src/beeld-metadata.js` is generated from `lib/beeld-metadata.ts` in
the main repo (`node scripts/cli-beeld-metadata.mjs`); do not edit it by hand.

MIT license.
