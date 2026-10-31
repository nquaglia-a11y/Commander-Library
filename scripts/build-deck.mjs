// Usage: node scripts/build-deck.mjs <id> "<archidekt url>" ["Deck name"]
// Reads data/decks/<id>.txt (Archidekt text export) and writes data/decks/<id>.json,
// then refreshes data/decks/index.json.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { deckFromText } from '../js/archidekt.js';

const [id, source, name] = process.argv.slice(2);
if (!id) { console.error('usage: build-deck.mjs <id> <url> [name]'); process.exit(1); }
const dir = new URL('../data/decks/', import.meta.url);
const text = readFileSync(new URL(`${id}.txt`, dir), 'utf8');
const prev = (() => { try { return JSON.parse(readFileSync(new URL(`${id}.json`, dir), "utf8")); } catch { return {}; } })();
const deck = deckFromText(text, { id, name: name || prev.name || id, colors: prev.colors, bracket: prev.bracket || "2-3", source: source || prev.source, importedAt: new Date().toISOString().slice(0, 10) });
const main = deck.cards.filter(c => c.board === 'main' || c.board === 'commander').reduce((s, c) => s + c.qty, 0);
writeFileSync(new URL(`${id}.json`, dir), JSON.stringify(deck, null, 2) + '\n');
const index = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => {
  const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  return { id: d.id, name: d.name, commanders: d.commanders, colors: d.colors, bracket: d.bracket, source: d.source };
});
writeFileSync(new URL('index.json', dir), JSON.stringify(index, null, 2) + '\n');
console.log(`${id}: ${main} cards in deck, commanders: ${deck.commanders.join(' + ')}`);
