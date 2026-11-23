// Launch Radar dashboard — reads window.TOKEN_RADAR (written by main.ts),
// renders the ranked board, a detail view per protocol and the live reference
// panel. No network: every byte comes from data.js beside this page.
(function () {
  'use strict';
  const D = window.TOKEN_RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.body.insertAdjacentHTML('beforeend', '<p style="padding:20px">No radar data found next to this page.</p>');
    return;
  }
  const rows = D.rows;
  const live = D.live || [];

  const $ = (id) => document.getElementById(id);
  const qEl = $('q'), catEl = $('cat'), chainEl = $('chain'),
        watchEl = $('watch'), sortEl = $('sort'),
        rowsEl = $('rows'), countEl = $('count'), detailEl = $('detail');

  function usd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="flat">n/a</span>';
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'n/a';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Fill the filter dropdowns from the data itself.
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  for (const c of cats) catEl.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
  for (const c of chains) chainEl.insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');

  let selected = null;

  function visible() {
    const q = qEl.value.trim().toLowerCase();
    const cat = catEl.value, chain = chainEl.value, watchOnly = watchEl.checked;
    let out = rows.filter((r) => {
      if (watchOnly && !r.on_watchlist) return false;
      if (cat && r.category !== cat) return false;
      if (chain && !r.chains.includes(chain)) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
      return true;
    });
    const key = sortEl.value;
    if (key === 'tvl') out = [...out].sort((a, b) => b.tvl_usd - a.tvl_usd);
    else if (key === 'growth') out = [...out].sort((a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9));
    else if (key === 'age') out = [...out].sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1));
    return out;
  }

  function render() {
    const list = visible();
    countEl.innerHTML = 'Showing <b>' + list.length + '</b> of ' + rows.length +
      ' ranked protocols · ' + rows.filter((r) => r.on_watchlist).length + ' on the watchlist';
    rowsEl.innerHTML = list.map((r) => {
      const sel = selected === r.slug ? ' class="sel"' : '';
      return '<tr data-slug="' + esc(r.slug) + '"' + sel + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="nm">' + esc(r.name) + '</span>' +
        (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        '<br><span class="sl">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + r.chains.slice(0, 3).map(esc).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + usd(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
  }

  function showDetail(slug) {
    const r = rows.find((x) => x.slug === slug);
    if (!r) { detailEl.hidden = true; selected = null; render(); return; }
    selected = slug;
    const b = r.breakdown;
    const growthShown = r.change_7d === null ? 'n/a (treated as 0%)' : r.change_7d.toFixed(2) + '%';
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + ' <span>rank #' + r.rank + ' · ' + esc(r.slug) + '</span></h2>' +
      '<div class="facts"><span>Category <b>' + esc(r.category || '—') + '</b></span>' +
      '<span>Chains <b>' + r.chains.map(esc).join(', ') + '</b></span>' +
      '<span>TVL <b>' + usd(r.tvl_usd) + '</b></span>' +
      '<span>7-day change <b>' + growthShown + '</b></span>' +
      '<span>Tracked for <b>' + (r.age_days === null ? 'unknown' : r.age_days + ' days') + '</b></span>' +
      '<span>' + (r.on_watchlist ? 'On the watchlist' : 'Below the watchlist floor') + '</span></div>' +
      '<div class="math">implied = base × growth × maturity\n' +
      '  base     = round(TVL ^ ' + D.model.exponent + ') × ' + D.model.scale + ' = ' + usd(b.base) + '\n' +
      '  growth   = 1 + clamp(' + growthShown + ', ' + D.model.growthLow + '%, ' + D.model.growthHigh + '%) / 100 × ' + D.model.growthWeight + ' = ' + b.growth.toFixed(3) + '\n' +
      '  maturity = ' + D.model.maturityFloor + ' + min(age, ' + D.model.maturityDays + 'd) / ' + D.model.maturityDays + ' × ' + D.model.maturitySpan + ' = ' + b.maturity.toFixed(3) + '\n' +
      '  implied  = ' + usd(r.implied_value_usd) + '</div>' +
      '<h3>How to farm it</h3><ol>' +
      r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    detailEl.hidden = false;
    render();
  }

  rowsEl.addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  // Live-token reference panel.
  $('liveRows').innerHTML = live.map((p) =>
    '<li><b>' + esc(p.name) + '</b> — market cap <span class="m">' + usd(p.mcap_usd) +
    '</span>, TVL ' + usd(p.tvl_usd) + ' · ' + esc(p.category || '—') + '</li>').join('');

  // Header meta and methodology.
  $('meta').innerHTML = '<b>' + rows.length + '</b> ranked · <b>' +
    rows.filter((r) => r.on_watchlist).length + '</b> watchlist · snapshot <b>' + esc(D.asOf) + '</b>';
  $('modelVer').textContent = D.modelVersion;
  $('asOf').textContent = D.asOf;
  $('formula').innerHTML = 'Each protocol scores <code>implied = round(TVL ^ ' + D.model.exponent +
    ') × ' + D.model.scale + ' × growth × maturity</code>, where growth follows the 7-day TVL change ' +
    '(clamped ' + D.model.growthLow + '% to +' + D.model.growthHigh + '%, weight ' + D.model.growthWeight +
    ') and maturity follows how long the protocol has run with no token (' + D.model.maturityFloor +
    ' + up to ' + D.model.maturitySpan + ' over ' + D.model.maturityDays +
    ' days; unknown age counts as ' + D.model.unknownAgeDays + ' days). The same formula scores every row — no name is special-cased. ' +
    'Below the watchlist floor, a row must pass the watchlist’s own test: no token recorded, and not a wrapped, staked or bridged product and not an exchange.';

  // Controls re-render; the hash opens a detail or a filter on load.
  for (const el of [qEl, catEl, chainEl, watchEl, sortEl]) {
    el.addEventListener('input', () => { render(); });
    el.addEventListener('change', () => { render(); });
  }
  function applyHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const detail = h.get('detail'), filter = h.get('filter'), chain = h.get('chain');
    if (filter && [...catEl.options].some((o) => o.value === filter)) catEl.value = filter;
    if (chain && [...chainEl.options].some((o) => o.value === chain)) chainEl.value = chain;
    render();
    if (detail) {
      showDetail(detail);
      detailEl.scrollIntoView({ block: 'start' });
    }
  }
  render();
  applyHash();
})();
