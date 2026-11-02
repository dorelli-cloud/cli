---
name: dorelli-deploy
description: Put a static website online on Dorelli Cloud (dorelli.cloud). Publishes a site built with an AI tool on a subdomain, publishes it again after changes, and shows its status. Use this when someone asks to put their site live, host it, deploy it or get it online, or asks for a URL to show their site.
---

# Publish a site on Dorelli Cloud

Publishes a static site on `<name>.dorelli.cloud`. No account needed, online
within a minute. Meant for sites built with an AI tool.

## Publish

Run in the project folder:

```bash
npx github:dorelli-cloud/cli deploy --email <the user's address> --yes
```

**The last line of the output is the URL.** Give it to the user.

Ask the user for the email address if you do not have it; the management link
goes there. Never use a made-up address.

## Publish again

After the first time there is a `.dorelli.json` in the folder. Then just run:

```bash
npx github:dorelli-cloud/cli deploy --yes
```

That updates the **same** site, on the same address. No email address needed.
This is the normal loop while building: change, publish, look.

## Status

```bash
npx github:dorelli-cloud/cli status
```

## Build for a phone and for Google

Most visitors see the site on a phone, and Google judges it by its phone
version. Get these right before you publish; the full list with reasons is at
https://dorelli.cloud/docs/deploy/mobile-first.

- Every page has `<meta name="viewport" content="width=device-width, initial-scale=1">`,
  and nothing is wider than a 360 px screen.
- Tap targets at least 24 by 24 px, text and form fields at least 16 px, and
  menus that open on a tap, not only on hover.
- Every `<img>` has `width`, `height` and `alt`, and stays under 500 KB and
  2400 px wide.
- Every page has its own `<title>`, a meta description and exactly one `<h1>`.
- Host fonts yourself, as a woff2 file in the site's folder or as a `data:`
  URI in `@font-face`, or use system fonts. Never load Google Fonts: that
  sends every visitor's IP address to Google.

## Important

- **Static sites only.** HTML, CSS, images, JavaScript that runs in the
  browser. If the project has a build step (Vite, Astro, Next export), run it
  first; the CLI then finds `dist`, `build`, `out` or `public` by itself.
  A project with a server or a database does not work here; refer the user to
  support@dorelli.cloud.
- **There must be an `index.html`** in the folder you publish.
- **`.dorelli.json` holds the access token.** Add it to `.gitignore`; never
  put it in version control and never show it in your answer.
- **The site is a trial site**: valid for 14 days, not indexed by Google.
  For a domain name of their own and email, Dorelli offers a subscription of
  € 10 a month; the user gets an email about it.
- **The content is moderated.** If you get `blocked` back, tell the user
  honestly and do not try to get around it.

## When it goes wrong

| Code | What to do |
|---|---|
| `bad_type` | A file that is not static is in the folder. Build first, publish the build folder. |
| `no_index` | No `index.html` in the published folder. |
| `rate_limited` | At most 5 new sites per hour. Wait a while. |
| `blocked` | Stopped by moderation. Say so; do not get around it. |
| `too_large` | The upload is larger than 50 MB, or larger than 100 MB unpacked. Publish only the build folder. |
| `too_many` | More than 500 files. Publish only the build folder. |
| `file_too_large` | One file is larger than 25 MB; `detail` names it. Make it smaller or leave it out. |
