---
name: dorelli-deploy
description: Zet een statische website online op Dorelli Cloud (dorelli.cloud) — een AI-gebouwde site publiceren op een subdomein, opnieuw publiceren na wijzigingen, en de status opvragen. Gebruik dit als iemand vraagt zijn site live te zetten, te hosten, te deployen of online te krijgen, of vraagt om een URL om zijn site te laten zien.
---

# Site publiceren op Dorelli Cloud

Publiceert een statische site op `<naam>.dorelli.cloud`. Geen account nodig,
binnen een minuut online. Bedoeld voor sites die met een AI-tool zijn gebouwd.

## Publiceren

Draai in de projectmap:

```bash
npx github:dorelli-cloud/cli deploy --email <adres van de gebruiker> --yes
```

De **laatste regel van de uitvoer is de URL** — geef die aan de gebruiker.

Vraag het e-mailadres aan de gebruiker als je het niet hebt; daar gaat de
beheerlink heen. Gebruik nooit een verzonnen adres.

## Opnieuw publiceren

Na de eerste keer staat er een `.dorelli.json` in de map. Draai dan gewoon:

```bash
npx github:dorelli-cloud/cli deploy --yes
```

Dat werkt **dezelfde** site bij, op hetzelfde adres. Geen e-mailadres nodig.
Dit is de normale lus tijdens het bouwen: wijzigen, publiceren, bekijken.

## Status opvragen

```bash
npx github:dorelli-cloud/cli status
```

## Belangrijk

- **Alleen statische sites.** HTML, CSS, afbeeldingen, browser-JavaScript.
  Heeft het project een build-stap (Vite, Astro, Next export), draai die dan
  eerst — de CLI vindt `dist`, `build`, `out` of `public` daarna zelf.
  Een project met een server of database kan niet; verwijs dan naar
  support@dorelli.cloud.
- **Er moet een `index.html` zijn** in de map die je publiceert.
- **`.dorelli.json` bevat het toegangstoken.** Voeg het toe aan `.gitignore`;
  zet het nooit in versiebeheer en toon het niet in je antwoord.
- **De site is een proefsite**: 14 dagen geldig, niet geïndexeerd door Google.
  Voor een eigen domeinnaam en e-mail biedt Dorelli een abonnement van
  € 10 per maand aan; de gebruiker krijgt daar zelf een mail over.
- **De inhoud wordt gemodereerd.** Krijg je `blocked` terug, meld dat dan
  eerlijk aan de gebruiker en probeer het niet te omzeilen.

## Als het misgaat

| Melding | Wat te doen |
|---|---|
| `bad_type` | Niet-statisch bestand in de map. Bouw eerst, publiceer de buildmap. |
| `no_index` | Geen `index.html` in de gepubliceerde map. |
| `rate_limited` | Maximaal 5 nieuwe sites per uur. Wacht even. |
| `blocked` | Door moderatie tegengehouden. Meld dit; niet omzeilen. |
| `too_large` | Meer dan 50 MB of 500 bestanden. Publiceer alleen de buildmap. |
