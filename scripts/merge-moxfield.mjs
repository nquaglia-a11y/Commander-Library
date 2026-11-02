// Adds a "Moxfield Top Decks" section to each deck's upgrade file.
// Input: data/moxfield/top-decks.json, collected from Moxfield in a browser:
//   meta[deckId]  = [[publicId, likes, deckName], ...]   (top 3 most-liked Bracket 2 decks)
//   picks[deckId] = [[cardName, "123" (which of the top decks run it), inMaybeboard], ...]
//                   (cards in 2+ of the top decks that are not in the main deck)
// Cards already recommended in another section get the Moxfield decks added as sources
// instead of being repeated. Game Changers are dropped.
// Usage: node scripts/merge-moxfield.mjs [checkedAt]
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = p => JSON.parse(fs.readFileSync(root + p, 'utf8'));
const mox = read('data/moxfield/top-decks.json');
const gcs = new Set(read('data/game-changers.json').cards);
const index = read('data/decks/index.json');
const checkedAt = process.argv[2] || mox.checkedAt;

for (const { id, commanders } of index) {
  const meta = mox.meta[id];
  if (!meta) continue;
  const file = `data/upgrades/${id}.json`;
  const raw = fs.readFileSync(root + file, 'utf8');
  const indent = raw.match(/\n( +)"/)?.[1].length || 2;
  const up = JSON.parse(raw);
  const cmd = commanders[0].split(',')[0];
  const deckSrc = n => {
    const [pid, likes, name] = meta[n - 1];
    return { label: `Moxfield #${n}: ${name.trim()} (${likes} likes)`, url: `https://moxfield.com/decks/${pid}`, kind: 'community' };
  };
  up.sets = up.sets.filter(s => s.code !== 'moxfield');
  for (const s of up.sets) for (const p of s.picks || []) p.sources = (p.sources || []).filter(x => !x.url?.startsWith('https://moxfield.com/decks/') || x.url.includes('/public'));
  const existing = new Map(up.sets.flatMap(s => (s.picks || []).map(p => [p.name, p])));

  const picks = [];
  let merged = 0;
  for (const [name, which, maybe] of mox.picks[id] || []) {
    if (gcs.has(name)) continue;
    const nums = [...which].map(Number);
    const sources = nums.map(deckSrc);
    const old = existing.get(name);
    if (old) { old.sources = [...(old.sources || []), ...sources]; merged++; continue; }
    picks.push({
      name,
      tier: nums.length === meta.length ? 'strong' : 'consider',
      why: `In ${nums.length} of the ${meta.length} most-liked Bracket 2 ${cmd} decks on Moxfield${maybe ? '. It is already in your maybeboard' : ''}.`,
      sources,
      mox: { n: nums.length, of: meta.length },
    });
  }
  const section = {
    code: 'moxfield',
    name: 'Moxfield Top Decks',
    released: `checked ${checkedAt}`,
    kind: 'moxfield',
    note: `Cards that at least 2 of the 3 most-liked Bracket 2 ${cmd} decks on Moxfield run and your deck doesn't. Cards already listed in another section got these decks added to their sources instead (${merged} of them). Game Changers removed.`,
    decks: meta.map(([pid, likes, name]) => ({ name: name.trim(), likes, url: `https://moxfield.com/decks/${pid}` })),
    picks,
  };
  const at = up.sets.findIndex(s => s.kind === 'edhrec');
  up.sets.splice(at + 1, 0, section);
  fs.writeFileSync(root + file, JSON.stringify(up, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`${id}: ${picks.length} new picks, ${merged} merged into existing picks`);
}
