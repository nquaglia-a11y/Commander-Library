# Commander Library

A personal library of Commander decks with an EDHREC-style deck view and a running list of upgrade ideas from every new Magic set.

Live site: https://nquaglia-a11y.github.io/Commander-Library/

## How it works

- **Decks** live in `data/decks/`. Each deck is an Archidekt text export (`<id>.txt`) plus the generated `<id>.json`.
- **Upgrade ideas** live in `data/upgrades/<id>.json`, grouped by set. Each pick has a reason, a suggested cut, and sources.
- **Card data and images** come from Scryfall at view time and are cached in the browser.
- **Your decisions** on each upgrade (Want it / Added / Pass) are saved in your browser.

House rules applied to every recommendation: Bracket 2-3, and no Game Changers (`data/game-changers.json`, plus Scryfall's game changer flag).

## Adding a deck

1. On Archidekt: open the deck, Export, Text, copy.
2. Save it as `data/decks/<id>.txt`.
3. Run `node scripts/build-deck.mjs <id> "<archidekt url>" "<deck name>"`.

Or use the Import page on the site, which saves the deck in your browser only.

## Running locally

Any static file server works, for example `python3 -m http.server` and open http://localhost:8000.
