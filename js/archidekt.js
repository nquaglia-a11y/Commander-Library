// Parses Archidekt's "Export -> Text" format, e.g.
// 1x Hashaton, Scarab's Fist (drc) 1 [Commander{top}]
// 1x Ash Barrens (tdc) 339 [Maybeboard{noDeck}{noPrice},Land]
const LINE = /^(\d+)x?\s+(.+?)\s+\(([^)]+)\)\s+(\S+)(?:\s+\*[^*]*\*)*\s*(?:\[(.*)\])?\s*$/;
const SIMPLE = /^(\d+)x?\s+(.+?)\s*$/;

export function parseArchidektText(text) {
  const cards = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    let m = line.match(LINE);
    let qty, name, set = null, num = null, tags = [];
    if (m) {
      [, qty, name, set, num] = m;
      tags = (m[5] || '').split(',').map(t => t.trim()).filter(Boolean);
    } else if ((m = line.match(SIMPLE))) {
      [, qty, name] = m;
    } else continue;
    const flags = new Set();
    const categories = tags.map(t => {
      for (const f of t.matchAll(/\{(\w+)\}/g)) flags.add(f[1]);
      return t.replace(/\{\w+\}/g, '').trim();
    });
    const isMaybe = categories.includes('Maybeboard');
    const isCommander = categories.includes('Commander');
    const excluded = flags.has('noDeck');
    const cats = categories.filter(c => c !== 'Maybeboard' && c !== 'Commander');
    cards.push({
      qty: Number(qty), name: name.replace(/&#39;/g, "'").replace(/&amp;/g, '&'),
      set, num, categories: cats,
      board: isCommander ? 'commander' : isMaybe ? 'maybe' : excluded ? 'extra' : 'main',
    });
  }
  return cards;
}

export function deckFromText(text, meta = {}) {
  const cards = parseArchidektText(text);
  const commander = cards.filter(c => c.board === 'commander').map(c => c.name);
  return { ...meta, commanders: commander, cards };
}
