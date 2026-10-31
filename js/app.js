import { getCards, imageFor } from './scryfall.js?v=202610312357';
import { deckFromText } from './archidekt.js?v=202610312357';

const app = document.getElementById('app');
const preview = document.getElementById('preview');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const json = url => fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);

// ---------- data ----------
const LOCAL_DECKS = 'local-decks-v1';
const localDecks = () => JSON.parse(localStorage.getItem(LOCAL_DECKS) || '{}');
const statusKey = deckId => `upgrade-status-${deckId}`;
const getStatus = deckId => JSON.parse(localStorage.getItem(statusKey(deckId)) || '{}');
const setStatus = (deckId, card, value) => {
  const s = getStatus(deckId);
  if (value) s[card] = value; else delete s[card];
  localStorage.setItem(statusKey(deckId), JSON.stringify(s));
};

let gameChangers = null;
async function loadGameChangers() {
  if (!gameChangers) gameChangers = new Set((await json('data/game-changers.json'))?.cards || []);
  return gameChangers;
}

async function listDecks() {
  const repo = (await json('data/decks/index.json')) || [];
  const local = Object.values(localDecks()).map(d => ({ ...d, local: true }));
  return [...repo, ...local.filter(l => !repo.some(r => r.id === l.id))];
}

async function loadDeck(id) {
  const local = localDecks()[id];
  if (local) return { ...local, local: true };
  return json(`data/decks/${id}.json`);
}

// ---------- shared bits ----------
const PIP = { W: '#f8f6d8', U: '#aae0fa', B: '#cbc2bf', R: '#f9aa8f', G: '#9bd3ae' };
const pips = ci => (ci || []).map(c => `<span class="pip" style="background:${PIP[c]}" title="${c}">${c}</span>`).join('') || '<span class="pip" title="Colorless">C</span>';

function cardTile(name, info, extra = '') {
  const img = info?.img || imageFor(name);
  return `<div class="card" data-img="${esc(img)}">
    <a href="${esc(info?.uri || `https://scryfall.com/search?q=!%22${encodeURIComponent(name)}%22`)}" target="_blank" rel="noopener">
      <img loading="lazy" src="${esc(img)}" alt="${esc(name)}">
    </a>
    <div class="card-name">${esc(name)}</div>${extra}
  </div>`;
}

app.addEventListener('mouseover', e => {
  const t = e.target.closest('.row-card[data-img]');
  if (!t) return;
  preview.innerHTML = `<img src="${esc(t.dataset.img)}" alt="">`;
  preview.hidden = false;
});
app.addEventListener('mousemove', e => {
  if (preview.hidden) return;
  preview.style.left = Math.min(e.clientX + 20, innerWidth - 260) + 'px';
  preview.style.top = Math.min(e.clientY - 40, innerHeight - 360) + 'px';
});
app.addEventListener('mouseout', e => { if (e.target.closest('.row-card')) preview.hidden = true; });

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'];
const typeOf = info => {
  const t = (info?.type || '').split('—')[0].split('//')[0];
  return TYPE_ORDER.find(x => t.includes(x)) || 'Other';
};
const plural = t => ({ Sorcery: 'Sorceries', Other: 'Other' }[t] || t + 's');

// ---------- views ----------
async function viewLibrary() {
  const decks = await listDecks();
  const cmdNames = decks.flatMap(d => d.commanders || []);
  const info = await getCards(cmdNames);
  const upgrades = await Promise.all(decks.map(d => json(`data/upgrades/${d.id}.json`)));
  app.innerHTML = `
    <section class="hero"><h1>My decks</h1>
      <p class="muted">Every deck you've imported, with upgrade ideas from new sets.</p></section>
    <div class="deck-grid">${decks.map((d, i) => {
      const c = info[d.commanders?.[0]];
      const picks = (upgrades[i]?.sets || []).flatMap(s => s.picks || []);
      const st = getStatus(d.id);
      const open = picks.filter(p => !st[p.name]).length;
      return `<a class="deck-card" href="#/deck/${esc(d.id)}">
        <div class="deck-art" style="background-image:url('${esc(c?.art || '')}')"></div>
        <div class="deck-body">
          <div class="deck-title">${esc(d.name)}</div>
          <div class="muted">${esc((d.commanders || []).join(' + '))}</div>
          <div class="deck-meta">${pips(c?.ci?.length ? c.ci : d.colors)} ${d.bracket ? `<span class="tag">Bracket ${esc(d.bracket)}</span>` : ''}
            ${open ? `<span class="tag hot">${open} upgrade ideas</span>` : ''}
            ${d.local ? '<span class="tag">only on this device</span>' : ''}</div>
        </div></a>`;
    }).join('') || '<p>No decks yet. <a href="#/import">Import one</a>.</p>'}</div>`;
}

async function viewDeck(id, tab = 'deck') {
  const deck = await loadDeck(id);
  if (!deck) { app.innerHTML = `<p>Deck not found. <a href="#/">Back</a></p>`; return; }
  const gcs = await loadGameChangers();
  const upgrades = await json(`data/upgrades/${id}.json`);
  const main = deck.cards.filter(c => c.board === 'main');
  const maybe = deck.cards.filter(c => c.board === 'maybe');
  const picks = (upgrades?.sets || []).flatMap(s => s.picks || []);
  const info = await getCards([...deck.commanders, ...deck.cards.map(c => c.name), ...picks.map(p => p.name), ...picks.flatMap(p => p.cut ? [p.cut] : [])]);
  const cmd = info[deck.commanders[0]];
  const total = [...main, ...deck.cards.filter(c => c.board === 'commander')].reduce((s, c) => s + c.qty, 0);
  const gcInDeck = main.filter(c => gcs.has(c.name) || info[c.name]?.gc);
  let ci = [...new Set(deck.commanders.flatMap(n => info[n]?.ci || []))];
  if (!ci.length) ci = deck.colors || [];
  const edhrec = `https://edhrec.com/commanders/${slug(deck.commanders.join(' '))}`;
  const st = getStatus(id);
  const openCount = picks.filter(p => !st[p.name]).length;

  app.innerHTML = `
    <section class="deck-head">
      <div class="cmd-imgs">${deck.commanders.map(n => `<img src="${esc(info[n]?.img || imageFor(n))}" alt="${esc(n)}">`).join('')}</div>
      <div>
        <h1>${esc(deck.commanders.join(' + '))}</h1>
        <div class="muted">${esc(deck.name)} · ${total} cards · imported ${esc(deck.importedAt || '')}</div>
        <div class="deck-meta">${pips(ci)} ${deck.bracket ? `<span class="tag">Bracket ${esc(deck.bracket)}</span>` : ''}
          <span class="tag">No Game Changers</span></div>
        <div class="links">
          ${deck.source ? `<a href="${esc(deck.source)}" target="_blank" rel="noopener">Archidekt</a>` : ''}
          <a href="${esc(edhrec)}" target="_blank" rel="noopener">EDHREC page</a>
        </div>
        ${gcInDeck.length ? `<div class="warn">Game Changers in this list: ${gcInDeck.map(c => esc(c.name)).join(', ')}</div>` : ''}
      </div>
    </section>
    <nav class="tabs">
      <a href="#/deck/${esc(id)}" class="${tab === 'deck' ? 'on' : ''}">Decklist</a>
      <a href="#/deck/${esc(id)}/upgrades" class="${tab === 'upgrades' ? 'on' : ''}">Upgrades${openCount ? ` <span class="count">${openCount}</span>` : ''}</a>
      <a href="#/deck/${esc(id)}/maybe" class="${tab === 'maybe' ? 'on' : ''}">Maybeboard (${maybe.length})</a>
    </nav>
    <div id="tab"></div>`;

  const el = document.getElementById('tab');
  if (tab === 'deck') renderDecklist(el, main, info);
  else if (tab === 'maybe') renderDecklist(el, maybe, info);
  else renderUpgrades(el, id, upgrades, info, deck);
}

function renderDecklist(el, cards, info) {
  const haveTypes = cards.some(c => info[c.name]?.type);
  const mode = haveTypes ? (localStorage.getItem('group-mode') || 'type') : 'cat';
  const groups = {};
  for (const c of cards) {
    const g = mode === 'type' ? plural(typeOf(info[c.name])) : (c.categories[0] || 'Uncategorized');
    (groups[g] ||= []).push(c);
  }
  const order = mode === 'type' ? [...TYPE_ORDER.map(plural), 'Other'] : Object.keys(groups).sort();
  const view = localStorage.getItem('view-mode') || 'grid';
  el.innerHTML = `
    <div class="toolbar">
      <label>Group by <select id="grp"><option value="type">Card type</option><option value="cat">My Archidekt categories</option></select></label>
      <label>View <select id="vw"><option value="grid">Images</option><option value="list">Text list</option></select></label>
    </div>
    ${order.filter(g => groups[g]).map(g => {
      const list = groups[g].sort((a, b) => (info[a.name]?.cmc ?? 0) - (info[b.name]?.cmc ?? 0) || a.name.localeCompare(b.name));
      const n = list.reduce((s, c) => s + c.qty, 0);
      return `<section class="group"><h2>${esc(g)} <span class="muted">${n}</span></h2>
        ${view === 'grid'
          ? `<div class="card-grid">${list.map(c => cardTile(c.name, info[c.name], c.qty > 1 ? `<div class="qty">×${c.qty}</div>` : '')).join('')}</div>`
          : `<ul class="text-list">${list.map(c => `<li class="row-card" data-img="${esc(info[c.name]?.img || imageFor(c.name))}">${c.qty > 1 ? c.qty + ' ' : ''}${esc(c.name)} <span class="muted">${esc(info[c.name]?.mana || '')}</span></li>`).join('')}</ul>`}
      </section>`;
    }).join('')}`;
  const grp = el.querySelector('#grp'); grp.value = mode;
  const vw = el.querySelector('#vw'); vw.value = view;
  grp.onchange = () => { localStorage.setItem('group-mode', grp.value); renderDecklist(el, cards, info); };
  vw.onchange = () => { localStorage.setItem('view-mode', vw.value); renderDecklist(el, cards, info); };
}

const community = p => (p.sources || []).filter(x => x.kind !== 'analysis').length;
const communityBadge = p => {
  const n = community(p);
  return n ? `<span class="tag ${n >= 3 ? 'good' : ''}" title="How many community sources include this card">In ${n} source${n > 1 ? 's' : ''}</span>`
    : `<span class="tag" title="Found by searching the set; no Hashaton list uses it yet">Claude's pick</span>`;
};
const STATUS = { want: 'Want it', added: 'Got it / added', pass: 'Pass' };
const STATUS_SHORT = { want: '♥ Want', added: '✓ Got', pass: '✕ Pass' };

function showDetail(p, info) {
  if (!p) return;
  const i = info[p.name];
  let m = document.getElementById('modal');
  if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-bg"></div><div class="modal-box">
    <button class="modal-x" aria-label="Close">✕</button>
    <img src="${esc(i?.img || imageFor(p.name))}" alt="${esc(p.name)}">
    <div><h2>${esc(p.name)}</h2><div class="muted small">${esc(p.set)}</div>
      <p>${esc(p.why)}</p>
      ${p.cut ? `<p class="cut"><b>Suggested cut:</b> ${esc(p.cut)}${p.cutWhy ? ` · ${esc(p.cutWhy)}` : ''}</p>` : ''}
      ${p.sources?.length ? `<p class="small"><b>Sources</b><br>${p.sources.map(src => `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label)}</a>`).join('<br>')}</p>` : ''}
      <p class="small"><a href="${esc(i?.uri || `https://scryfall.com/search?q=!%22${encodeURIComponent(p.name)}%22`)}" target="_blank" rel="noopener">Open on Scryfall</a></p>
    </div></div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; };
  m.querySelector('.modal-bg').onclick = close;
  m.querySelector('.modal-x').onclick = close;
  document.onkeydown = e => { if (e.key === 'Escape') close(); };
}

function renderUpgrades(el, deckId, upgrades, info, deck) {
  if (!upgrades?.sets?.length) {
    el.innerHTML = `<p class="muted">No upgrade research yet for this deck. Ask Claude in the project to research the newest set for it.</p>`;
    return;
  }
  const inDeck = new Set(deck.cards.filter(c => c.board !== 'maybe').map(c => c.name));
  const inMaybe = new Set(deck.cards.filter(c => c.board === 'maybe').map(c => c.name));
  const openKey = `open-sets-${deckId}`;
  const openSets = JSON.parse(localStorage.getItem(openKey) || '{}');
  const filter = localStorage.getItem('upgrade-filter') || 'open';
  const st = getStatus(deckId);
  el.innerHTML = `
    <div class="toolbar">
      <span class="muted">Researched ${esc(upgrades.researchedAt)} · tap a card for the reason and suggested cut</span>
      <button id="expand-all" class="btn-lite">Open / close all</button>
      <label>Show <select id="flt">
        <option value="open">Not decided yet</option><option value="want">Want it</option>
        <option value="added">Added</option><option value="pass">Passed</option><option value="all">Everything</option>
      </select></label>
    </div>
    ${upgrades.summary ? `<details class="note"><summary>How these were picked</summary><p>${esc(upgrades.summary)}</p><p class="muted small">${esc(upgrades.method || '')}</p></details>` : ''}
    ${upgrades.sets.map(s => {
      const pct = p => Math.max(p.edhrec?.b2 || 0, p.edhrec?.b3 || 0) + (p.edhrec?.avg || '').split('1').length * 5;
      const picks = [...(s.picks || [])].sort(s.kind === 'edhrec' ? (a, b) => pct(b) - pct(a) : (a, b) => (a.tier === 'strong' ? 0 : 1) - (b.tier === 'strong' ? 0 : 1) || community(b) - community(a)).filter(p => filter === 'all' || (filter === 'open' ? !st[p.name] : st[p.name] === filter));
      const isOpen = openSets[s.code] ?? false;
      return `<details class="group set-group" data-code="${esc(s.code)}" ${isOpen ? 'open' : ''}>
        <summary><h2>${esc(s.name)} <span class="muted">${s.kind === 'edhrec' ? 'Bracket 2-3 staples' : esc(s.code?.toUpperCase() || '') + ' · ' + esc(s.released || '')}</span> <span class="count-pill">${picks.length}</span></h2></summary>
        ${s.note ? `<p class="muted">${esc(s.note)}</p>` : ''}
        ${picks.length ? `<div class="card-grid big">${picks.map(p => {
          const i = info[p.name];
          const owned = inDeck.has(p.name);
          const img = i?.img || imageFor(p.name);
          return `<div class="pick ${st[p.name] ? 'decided-' + st[p.name] : ''}">
            <button class="pick-img" data-detail="${esc(p.name)}" title="Show why"><img loading="lazy" src="${esc(img)}" alt="${esc(p.name)}"></button>
            <div class="pick-tags">${p.tier === 'strong' ? '<span class="tag hot">Strong</span>' : '<span class="tag">Maybe</span>'}
              ${p.edhrec ? `<span class="tag good" title="Share of Bracket 2 / Bracket 3 Hashaton decks on EDHREC">${[p.edhrec.b2 != null ? 'B2 ' + p.edhrec.b2 + '%' : '', p.edhrec.b3 != null ? 'B3 ' + p.edhrec.b3 + '%' : ''].filter(Boolean).join(' · ') || 'Average deck'}</span>` : communityBadge(p)} ${i?.price ? `<span class="tag">$${esc(i.price)}</span>` : ''} ${owned ? '<span class="tag">in deck</span>' : ''} ${inMaybe.has(p.name) ? '<span class="tag">in maybeboard</span>' : ''}</div>
            <div class="status compact">${Object.entries(STATUS_SHORT).map(([k, v]) => `<button data-card="${esc(p.name)}" data-s="${k}" class="${st[p.name] === k ? 'on' : ''}" title="${esc(STATUS[k])}">${v}</button>`).join('')}</div>
          </div>`;
        }).join('')}</div>` : '<p class="muted">Nothing in this view for this set.</p>'}
        ${s.skipped?.length && filter === 'all' ? `<details><summary>Considered but skipped (${s.skipped.length})</summary><ul>${s.skipped.map(k => `<li><b>${esc(k.name)}</b>: ${esc(k.reason)}</li>`).join('')}</ul></details>` : ''}
      </details>`;
    }).join('')}`;
  const byName = Object.fromEntries(upgrades.sets.flatMap(s => (s.picks || []).map(p => [p.name, { ...p, set: s.name }])));
  el.querySelectorAll('.pick-img').forEach(b => b.onclick = () => showDetail(byName[b.dataset.detail], info));
  el.querySelectorAll('details.set-group').forEach(dt => dt.addEventListener('toggle', () => {
    const o = JSON.parse(localStorage.getItem(openKey) || '{}'); o[dt.dataset.code] = dt.open; localStorage.setItem(openKey, JSON.stringify(o));
  }));
  const expand = el.querySelector('#expand-all');
  if (expand) expand.onclick = () => { const all = [...el.querySelectorAll('details.set-group')]; const open = !all.every(d => d.open); all.forEach(d => { d.open = open; }); };
  const flt = el.querySelector('#flt'); flt.value = filter;
  flt.onchange = () => { localStorage.setItem('upgrade-filter', flt.value); renderUpgrades(el, deckId, upgrades, info, deck); };
  el.querySelectorAll('.status button').forEach(b => b.onclick = () => {
    const cur = getStatus(deckId)[b.dataset.card];
    setStatus(deckId, b.dataset.card, cur === b.dataset.s ? null : b.dataset.s);
    const now = getStatus(deckId);
    const open = upgrades.sets.flatMap(s => s.picks || []).filter(p => !now[p.name]).length;
    const badge = document.querySelector('.tabs .count');
    if (badge) badge.textContent = open;
    renderUpgrades(el, deckId, upgrades, info, deck);
  });
}

async function viewSets() {
  const sets = (await json('data/sets.json')) || [];
  app.innerHTML = `<section class="hero"><h1>Sets tracked</h1>
    <p class="muted">Sets that have been checked against your decks. When a new one releases, ask Claude to research it.</p></section>
    <table class="sets"><thead><tr><th>Set</th><th>Released</th><th>Researched</th><th></th></tr></thead><tbody>
    ${sets.map(s => `<tr><td>${esc(s.name)} <span class="muted">${esc(s.code.toUpperCase())}</span></td><td>${esc(s.released)}</td>
      <td>${s.researched ? '✓' : '<span class="muted">not yet</span>'}</td>
      <td><a href="https://edhrec.com/sets/${esc(s.code)}" target="_blank" rel="noopener">EDHREC</a></td></tr>`).join('')}
    </tbody></table>`;
}

const PRIORITY = { 1: 'Next to buy', 2: 'Soon', 3: 'Someday' };
const prioKey = 'shopping-priority-v1';
const getPrio = () => JSON.parse(localStorage.getItem(prioKey) || '{}');

async function viewShopping() {
  const decks = await listDecks();
  const ups = await Promise.all(decks.map(d => json(`data/upgrades/${d.id}.json`)));
  const items = [];
  decks.forEach((d, i) => {
    const st = getStatus(d.id);
    for (const s of ups[i]?.sets || []) for (const p of s.picks || []) {
      if (st[p.name] === 'want') items.push({ ...p, deck: d, set: s });
    }
  });
  const info = await getCards(items.map(x => x.name));
  const prio = getPrio();
  const pk = x => `${x.deck.id}|${x.name}`;
  items.sort((a, b) => (prio[pk(a)] || 2) - (prio[pk(b)] || 2) || a.deck.name.localeCompare(b.deck.name));
  const total = items.reduce((s, x) => s + (parseFloat(info[x.name]?.price) || 0), 0);
  const nextTotal = items.filter(x => (prio[pk(x)] || 2) === 1).reduce((s, x) => s + (parseFloat(info[x.name]?.price) || 0), 0);
  const tcg = n => `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(n)}`;
  const ck = n => `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(n)}`;
  app.innerHTML = `<section class="hero"><h1>Shopping list</h1>
    <p class="muted">Every upgrade you marked "Want it", across all decks. Set a priority to build your next-in-line list.</p></section>
    ${items.length ? `<div class="totals"><div><b>${items.length}</b> cards</div>
      <div>Next to buy: <b>$${nextTotal.toFixed(2)}</b></div><div>Everything: <b>$${total.toFixed(2)}</b></div>
      <div class="muted small">Prices are Scryfall's TCGplayer market price, for reference.</div></div>
    <table class="shop"><thead><tr><th></th><th>Card</th><th>For deck</th><th>Swap out</th><th>Price</th><th>Priority</th><th>Buy</th><th></th></tr></thead><tbody>
    ${items.map(x => { const i = info[x.name]; return `<tr>
      <td><span class="row-card thumb" data-img="${esc(i?.img || imageFor(x.name))}"><img src="${esc(i?.img || imageFor(x.name))}" alt=""></span></td>
      <td><b>${esc(x.name)}</b><div class="muted small">${esc(x.set.name)}</div></td>
      <td><a href="#/deck/${esc(x.deck.id)}/upgrades">${esc(x.deck.name)}</a></td>
      <td>${x.cut ? esc(x.cut) : '<span class="muted">your call</span>'}</td>
      <td>${i?.price ? '$' + esc(i.price) : '<span class="muted">?</span>'}</td>
      <td><select data-k="${esc(pk(x))}" class="prio">${Object.entries(PRIORITY).map(([v, l]) => `<option value="${v}" ${(prio[pk(x)] || 2) == v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="small"><a href="${tcg(x.name)}" target="_blank" rel="noopener">TCGplayer</a> · <a href="${ck(x.name)}" target="_blank" rel="noopener">Card Kingdom</a></td>
      <td><button class="bought" data-deck="${esc(x.deck.id)}" data-card="${esc(x.name)}">Got it</button></td></tr>`; }).join('')}
    </tbody></table>` : '<p class="muted">Nothing here yet. Open a deck\'s Upgrades tab and press "Want it" on cards you like.</p>'}`;
  app.querySelectorAll('.prio').forEach(sel => sel.onchange = () => {
    const p = getPrio(); p[sel.dataset.k] = Number(sel.value); localStorage.setItem(prioKey, JSON.stringify(p)); viewShopping();
  });
  app.querySelectorAll('.bought').forEach(b => b.onclick = () => { setStatus(b.dataset.deck, b.dataset.card, 'added'); viewShopping(); });
}

function viewImport() {
  app.innerHTML = `<section class="hero"><h1>Import a deck</h1>
    <p class="muted">On Archidekt, open your deck, choose <b>Export</b>, pick <b>Text</b>, and copy it. Paste it below with the deck link.</p></section>
    <form id="imp" class="form">
      <label>Archidekt link<input name="url" placeholder="https://archidekt.com/decks/…" required></label>
      <label>Deck name<input name="name" placeholder="Optional, defaults to the commander"></label>
      <label>Bracket<select name="bracket"><option>2-3</option><option>2</option><option>3</option><option>1</option><option>4</option></select></label>
      <label>Archidekt text export<textarea name="text" rows="14" placeholder="1x Hashaton, Scarab's Fist (drc) 1 [Commander{top}]" required></textarea></label>
      <button>Import</button>
      <p class="muted small">Imported decks are saved in this browser. To make one visible to friends, share it in the project chat and Claude will add it to the site.</p>
    </form><div id="imp-out"></div>`;
  document.getElementById('imp').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const idMatch = String(f.get('url')).match(/decks\/(\d+)/);
    const deck = deckFromText(String(f.get('text')), { source: f.get('url'), bracket: f.get('bracket'), importedAt: new Date().toISOString().slice(0, 10) });
    if (!deck.commanders.length) {
      document.getElementById('imp-out').innerHTML = '<p class="warn">No commander found. Make sure the commander is in the "Commander" category on Archidekt.</p>';
      return;
    }
    deck.id = slug(deck.commanders[0].split(',')[0]) + (idMatch ? '-' + idMatch[1] : '');
    deck.name = f.get('name') || deck.commanders.join(' + ');
    const all = localDecks(); all[deck.id] = deck;
    localStorage.setItem(LOCAL_DECKS, JSON.stringify(all));
    location.hash = `#/deck/${deck.id}`;
  };
}

// ---------- router ----------
async function route() {
  const [, page, id, tab] = location.hash.split('/');
  window.scrollTo(0, 0);
  try {
    if (page === 'deck' && id) await viewDeck(decodeURIComponent(id), tab || 'deck');
    else if (page === 'sets') await viewSets();
    else if (page === 'import') viewImport();
    else if (page === 'shopping') await viewShopping();
    else await viewLibrary();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="warn">Something went wrong: ${esc(e.message)}</p>`;
  }
}
addEventListener('hashchange', route);
route();
