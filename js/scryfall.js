// Minimal Scryfall client with a localStorage cache.
const CACHE_KEY = 'scryfall-cache-v1';
const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
const save = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* full */ } };

const key = n => n.toLowerCase();

function slim(c) {
  const face = c.card_faces?.[0] || {};
  const imgs = c.image_uris || face.image_uris || {};
  return {
    name: c.name,
    type: c.type_line || face.type_line || '',
    cmc: c.cmc ?? 0,
    mana: c.mana_cost || face.mana_cost || '',
    ci: c.color_identity || [],
    img: imgs.normal || '',
    art: imgs.art_crop || '',
    uri: c.scryfall_uri,
    price: c.prices?.usd || c.prices?.usd_foil || null,
    gc: !!c.game_changer,
  };
}

// Fetch many cards by name (75 per request, Scryfall's limit).
export async function getCards(names) {
  const missing = [...new Set(names)].filter(n => !cache[key(n)]);
  for (let i = 0; i < missing.length; i += 75) {
    const chunk = missing.slice(i, i + 75);
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk.map(name => ({ name: name.split(' // ')[0] })) }),
      });
      const json = await res.json();
      for (const c of json.data || []) {
        const s = slim(c);
        cache[key(c.name)] = s;
        cache[key(c.name.split(' // ')[0])] = s;
      }
      await new Promise(r => setTimeout(r, 100));
    } catch (e) { console.warn('Scryfall fetch failed', e); }
  }
  save();
  const out = {};
  for (const n of names) out[n] = cache[key(n)] || cache[key(n.split(' // ')[0])] || null;
  return out;
}

export function imageFor(name) {
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
}
