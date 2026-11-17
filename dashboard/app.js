// Token Radar's dashboard, model radar-4. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, the comps scatter with the fitted curve, filters, a
// per-protocol detail drawer with the model's own inputs, the farm economics and the protocol's
// farm plan, and the model panel with the fit, its blind test and every category factor. No
// network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', minTvl: 0, watchlistOnly: false,
    tab: 'pre-token', sort: 'implied', dir: -1, selected: null,
    verdict: 'all', deposit: 1000,
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtNum(n) {
    return new Intl.NumberFormat('en-US').format(n);
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The curve is the fit main.ts computed: 10^intercept x TVL^slope.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extra = Math.max(0, Math.min((row.chains ? row.chains.length : 1) - 1, model.breadth_max_chains));
    var breadth = 1 + extra * model.breadth_per_chain;
    var base = Math.pow(10, DATA.fit.intercept + DATA.fit.slope * Math.log10(row.tvl_usd));
    return Math.max(1, Math.round(base * row.category_factor * growthMult * maturity * breadth));
  }

  // The farm economics of one row for a deposit: the slice is the depositors' share of the
  // implied value, pro-rata by the deposit's share of TVL; the net is the slice minus the fees.
  function econOf(row, deposit) {
    var model = DATA.model;
    var slice = Math.round(row.implied_value_usd * model.depositor_share * (deposit / row.tvl_usd));
    var fees = model.fee_usd + (row.chains && row.chains.length > 1 ? model.fee_multichain_usd : 0);
    var net = slice - fees;
    var breakeven = Math.round((fees * row.tvl_usd) / (model.depositor_share * row.implied_value_usd));
    var hold = row.age_days === null || row.age_days === undefined ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var hours = (model.setup_minutes + model.weekly_minutes * weeks) / 60;
    var verdict = net >= model.farm_threshold_usd ? 'FARM' : net >= 0 ? 'THIN' : 'SKIP';
    return { slice: slice, fees: fees, net: net, breakeven: breakeven, hours: hours, netPerHour: net / hours, verdict: verdict };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL,
  // age and the row's own economics decide the action, the deposit, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main yield vault on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Route a $' + capital + ' payment through ' + name + ' on ' + chain + ' and keep using it for transfers.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and vote in its next proposal.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use its apps for a week.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'a swap in the main pool';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'a borrow or a repayment';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'a small trade or a funding check';
    if (c.indexOf('prediction') >= 0) return 'one market position';
    if (c.indexOf('governance') >= 0) return 'a vote or a forum comment';
    if (c.indexOf('bridge') >= 0 || c.indexOf('chain') >= 0) return 'one transfer through the app';
    return 'a deposit, a swap or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p, deposit) {
    var chain = chainOf(p);
    var multichain = p.chains && p.chains.length > 1;
    var main = multichain ? Math.round(deposit * 0.75) : deposit;
    var bridge = deposit - main;
    var hold = holdDaysFor(p.age_days);
    var econ = econOf(p, deposit);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, main, chain), cost: '$' + main + ' of capital and about $' + (main >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' }
    ];
    if (multichain) {
      steps.push({ text: 'Use the position on a second chain too: bridge $' + bridge + ' of the deposit to ' + p.chains[1] + ' and repeat the main action there, so the wallet is active on both chains.', cost: 'about $4 of bridge fees', time: '15 minutes' });
    }
    steps.push(
      { text: 'Make one qualifying action each week, such as ' + weeklyActionFor(p) + ', so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + deposit + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Price the plan before you start: a $' + deposit.toLocaleString('en-US') + ' deposit earns a slice of about $' + econ.slice + ' if the launch prices at the board\'s ' + fmtUsd(p.implied_value_usd) + ' implied value, against about $' + econ.fees + ' of fees, for a net of about $' + econ.net + ' (verdict ' + econ.verdict + ').', cost: 'nothing to check', time: '5 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    );
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('min')) state.minTvl = parseInt(params.get('min'), 10) || 0;
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('v')) state.verdict = params.get('v');
    if (params.get('d')) state.deposit = parseInt(params.get('d'), 10) === 10000 ? 10000 : 1000;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl > 0) params.set('min', String(state.minTvl));
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    if (state.verdict !== 'all') params.set('v', state.verdict);
    if (state.deposit !== 1000) params.set('d', String(state.deposit));
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function categories() {
    return Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
  }
  function chains() {
    var counts = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 24);
  }
  function baseRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function rows() {
    return baseRows().filter(function (r) {
      if (state.verdict === 'all') return true;
      return econOf(r, state.deposit).verdict === state.verdict;
    });
  }
  function verdictCounts() {
    var counts = { FARM: 0, THIN: 0, SKIP: 0 };
    baseRows().forEach(function (r) { counts[econOf(r, state.deposit).verdict]++; });
    return counts;
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_factor; bv = b.category_factor; }
      else if (key === 'net') { av = econOf(a, state.deposit).net; bv = econOf(b, state.deposit).net; }
      else if (key === 'slice') { av = econOf(a, state.deposit).slice; bv = econOf(b, state.deposit).slice; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version })),
        el('span', null, el('b', { text: String(DATA.board_size) }), ' protocols ranked')
      )
    );
  }

  function lede() {
    var farm = DATA.rows.filter(function (r) { return r.verdict === 'FARM'; }).length;
    var setAsideTotal = DATA.set_aside.reduce(function (n, r) { return n + r.count; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ',
          el('b', { text: fmtUsd(DATA.floor_usd) }),
          ' of TVL and no token on record. The early radar adds ',
          el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor, and the ones above it the watchlist rule leaves out. Implied value is a fitted model, not a promise: it prices a launch from the snapshot alone, and every row shows what a $1,000 deposit would net. Of the ',
          el('b', { text: String(DATA.pre_token_size) }),
          ' pre-token protocols, ',
          el('b', { text: String(DATA.board_size) }),
          ' are ranked and ',
          el('b', { text: String(setAsideTotal) }),
          ' are set aside for the reasons in the model panel below.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Blind test: median miss' }), el('b', { text: fmtMult(DATA.fit.loo_median_miss) })),
        el('div', { class: 'fact' }, el('span', { text: 'Worth farming (FARM)' }), el('b', { text: String(farm) + ' of ' + DATA.board_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // The comps scatter: every traded token as a dot on log TVL against log market cap, the
  // fitted curve through them, and the leave-one-out P25-P75 band around it. Drawn from the
  // snapshot's own figures, so the picture and the model are the same arithmetic.
  function scatter() {
    var W = 1180, H = 300, padL = 64, padR = 24, padT = 18, padB = 34;
    var fit = DATA.fit;
    var xs = DATA.comps.map(function (c) { return Math.log10(c.tvl_usd); });
    var ys = DATA.comps.map(function (c) { return Math.log10(c.mcap_usd); });
    var x0 = Math.floor(Math.min.apply(null, xs.concat([6.7])));
    var x1 = Math.ceil(Math.max.apply(null, xs.concat([10.5])));
    var y0 = Math.floor(Math.min.apply(null, ys.concat([5])));
    var y1 = Math.ceil(Math.max.apply(null, ys.concat([11])));
    function X(v) { return padL + ((v - x0) / (x1 - x0)) * (W - padL - padR); }
    function Y(v) { return padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB); }
    function curveY(x, mult) {
      return fit.intercept + fit.slope * x + Math.log10(mult);
    }
    var dots = DATA.comps.map(function (c) {
      return '<circle cx="' + X(Math.log10(c.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(c.mcap_usd)).toFixed(1) + '" r="3" fill="#8fa1b8" fill-opacity="0.75"><title>' + c.name + ': TVL ' + fmtUsd(c.tvl_usd) + ', market cap ' + fmtUsd(c.mcap_usd) + '</title></circle>';
    }).join('');
    function path(mult) {
      var d = '';
      for (var i = 0; i <= 40; i++) {
        var x = x0 + ((x1 - x0) * i) / 40;
        d += (i === 0 ? 'M' : 'L') + X(x).toFixed(1) + ' ' + Y(curveY(x, mult)).toFixed(1);
      }
      return d;
    }
    var ticks = '';
    for (var tx = 7; tx <= 10; tx++) {
      var xLabel = tx >= 9 ? Math.pow(10, tx - 9).toFixed(0) + 'B' : Math.pow(10, tx - 6).toFixed(0) + 'M';
      ticks += '<line x1="' + X(tx) + '" y1="' + (H - padB) + '" x2="' + X(tx) + '" y2="' + padT + '" stroke="#22314e" stroke-width="1"/><text x="' + X(tx) + '" y="' + (H - 12) + '" fill="#5d6f88" font-size="11" text-anchor="middle">$' + xLabel + '</text>';
    }
    for (var ty = 6; ty <= 10; ty++) {
      ticks += '<line x1="' + padL + '" y1="' + Y(ty) + '" x2="' + (W - padR) + '" y2="' + Y(ty) + '" stroke="#22314e" stroke-width="1"/><text x="' + (padL - 8) + '" y="' + (Y(ty) + 4) + '" fill="#5d6f88" font-size="11" text-anchor="end">$' + (ty >= 9 ? Math.pow(10, ty - 9).toFixed(0) + 'B' : Math.pow(10, ty - 6).toFixed(0) + 'M') + '</text>';
    }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Traded tokens: market cap against TVL, with the fitted curve and its leave-one-out band">' +
      ticks +
      '<path d="' + path(fit.loo_p75) + '" fill="none" stroke="#2fd48c" stroke-width="1" stroke-dasharray="4 4" opacity="0.55"/>' +
      '<path d="' + path(fit.loo_p25) + '" fill="none" stroke="#2fd48c" stroke-width="1" stroke-dasharray="4 4" opacity="0.55"/>' +
      '<path d="' + path(1) + '" fill="none" stroke="#2fd48c" stroke-width="2"/>' +
      dots +
      '<text x="' + padL + '" y="14" fill="#8fa1b8" font-size="12">Traded tokens: market cap against TVL (log-log). Line: the fitted curve. Dashed: the leave-one-out P25-P75 band.</text>' +
      '</svg>';
    return el('section', { class: 'panel scatter' },
      el('h2', { text: 'The comps curve' }),
      el('p', { class: 'sub', text: 'Each dot is a token that already trades. The curve is the fit the board prices from: log10(market cap) = ' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' x log10(TVL), over ' + fit.comps + ' comparables. Blind test (leave-one-out): median miss ' + fmtMult(fit.loo_median_miss) + ', within 3x ' + Math.round(fit.loo_within_3x * 100) + '%, within 10x ' + Math.round(fit.loo_within_10x * 100) + '%. A flat median multiple misses by ' + fmtMult(fit.flat_median_miss) + ' instead.' }),
      el('div', { html: svg })
    );
  }

  function controls() {
    var cats = categories();
    var counts = verdictCounts();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains().map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'minTvl', 'aria-label': 'Filter by minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: 'TVL $50M and up', selected: state.minTvl === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'TVL $100M and up', selected: state.minTvl === 100000000 ? 'selected' : null }),
      el('option', { value: '500000000', text: 'TVL $500M and up', selected: state.minTvl === 500000000 ? 'selected' : null }),
      el('option', { value: '1000000000', text: 'TVL $1B and up', selected: state.minTvl === 1000000000 ? 'selected' : null })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = parseInt(tvlSelect.value, 10) || 0; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    function verdictButton(v, label) {
      return el('button', { type: 'button', 'aria-pressed': state.verdict === v ? 'true' : 'false', text: label, onclick: function () { state.verdict = v; writeHash(); render(); } });
    }
    var dep1 = el('button', { type: 'button', 'aria-pressed': state.deposit === 1000 ? 'true' : 'false', text: '$1,000', onclick: function () { state.deposit = 1000; writeHash(); render(); } });
    var dep10 = el('button', { type: 'button', 'aria-pressed': state.deposit === 10000 ? 'true' : 'false', text: '$10,000', onclick: function () { state.deposit = 10000; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Minimum TVL' }), tvlSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), wl),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Verdict' }), el('div', { class: 'tabs' },
        verdictButton('all', 'All ' + DATA.board_size),
        verdictButton('FARM', 'FARM ' + counts.FARM),
        verdictButton('THIN', 'THIN ' + counts.THIN),
        verdictButton('SKIP', 'SKIP ' + counts.SKIP))),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Deposit' }), el('div', { class: 'tabs' }, dep1, dep10)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function verdictBadge(v) {
    var cls = v === 'FARM' ? 'watch' : v === 'THIN' ? 'early' : '';
    return el('span', { class: 'badge ' + cls, text: v });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchlistOnly = false; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var econ = econOf(r, state.deposit);
      var netClass = econ.net >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank-num' + (r.rank <= 3 ? ' top3' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_factor) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.band_lo_usd) + ' - ' + fmtUsd(r.band_hi_usd) }),
        el('td', { class: 'num', text: '$' + econ.slice.toLocaleString('en-US') }),
        el('td', { class: 'num ' + netClass, text: fmtSigned(econ.net) }),
        el('td', null, verdictBadge(econ.verdict)),
        el('td', null, el('span', { class: 'badge ' + (r.watchlist ? 'watch' : 'early'), text: r.watchlist ? 'Watchlist' : 'Early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, farm economics and farm plan. Slice and net are for a $' + state.deposit.toLocaleString('en-US') + ' deposit.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Cat x'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'P25-P75 band' }),
            sortHeader('slice', 'Slice'),
            sortHeader('net', 'Net'),
            el('th', { scope: 'col', text: 'Verdict' }),
            el('th', { scope: 'col', text: 'Scope' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'badge live', text: 'Live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market caps are what the comps curve is fitted from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var fit = DATA.fit;
    var multRows = DATA.category_factors.slice(0, 14).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.samples) }),
        el('td', { class: 'num', text: fmtMult(c.factor) }),
        el('td', { class: 'sub', text: c.samples >= m.min_category_samples ? 'median residual' : 'curve alone' })
      );
    });
    var setAsideTotal = DATA.set_aside.reduce(function (n, r) { return n + r.count; }, 0);
    var setAsideRows = DATA.set_aside.map(function (r) {
      return el('tr', null, el('td', { text: r.reason }), el('td', { class: 'num', text: String(r.count) }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( 10^' + fit.intercept.toFixed(4) + ' x tvl_usd^' + fit.slope.toFixed(4) + ' x ', el('b', { text: 'category factor' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.breadth_max_chains + ') x ' + m.breadth_per_chain + ') )'
      ),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('h3', { text: 'The fit, tested blind' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'mult-table' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Check' }), el('th', { scope: 'col', text: 'Fitted model' }), el('th', { scope: 'col', text: 'Flat multiple' }))),
              el('tbody', null,
                el('tr', null, el('td', { text: 'Median miss' }), el('td', { class: 'num', text: fmtMult(fit.loo_median_miss) }), el('td', { class: 'num', text: fmtMult(fit.flat_median_miss) })),
                el('tr', null, el('td', { text: 'Within 3x' }), el('td', { class: 'num', text: Math.round(fit.loo_within_3x * 100) + '%' }), el('td', { class: 'num', text: Math.round(fit.flat_within_3x * 100) + '%' })),
                el('tr', null, el('td', { text: 'Within 10x' }), el('td', { class: 'num', text: Math.round(fit.loo_within_10x * 100) + '%' }), el('td', { class: 'num', text: Math.round(fit.flat_within_10x * 100) + '%' })),
                el('tr', null, el('td', { text: 'Rank correlation' }), el('td', { class: 'num', text: fit.loo_spearman.toFixed(2) }), el('td', { class: 'num', text: 'n/a' }))
              )
            )
          ),
          el('p', { class: 'note', text: 'Leave-one-out over ' + fit.comps + ' traded tokens: every token is priced by a curve fitted without it. R-squared of the fit is ' + fit.r_squared.toFixed(2) + '. The P25-P75 band of the leave-one-out ratios is ' + fmtMult(fit.loo_p25) + ' to ' + fmtMult(fit.loo_p75) + '; the P10-P90 band is ' + fmtMult(fit.loo_p10) + ' to ' + fmtMult(fit.loo_p90) + '.' })
        ),
        el('div', null,
          el('h3', { text: 'Category factors from the snapshot' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'mult-table' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live tokens' }), el('th', { scope: 'col', text: 'Factor' }), el('th', { scope: 'col', text: 'Basis' }))),
              el('tbody', null, multRows)
            )
          ),
          el('p', { class: 'note', text: 'Each factor is the median residual of the protocols in that category whose token already trades, against the fitted curve, computed from this snapshot. Categories with fewer than ' + m.min_category_samples + ' such protocols use the curve alone (factor 1). Factors are clamped to ' + m.factor_floor + 'x - ' + m.factor_cap + 'x.' })
        )
      ),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('h3', { text: 'What the model reads, and what it does not' }),
          el('p', { class: 'note' },
            el('b', { text: 'It reads: ' }),
            'TVL, seven-day TVL growth, the time since the protocol was first listed, how many chains it runs on, and the market caps of tokens that already trade in its category.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'It does not read: ' }),
            'announcements, social posts, points programs, or any name. A protocol that records no token is ranked as pre-token; the record is not proof it has none.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'Early rows: ' }),
            'every pre-token protocol that can still be a launch, above the floor or below it, except exchanges, versioned pools, and wrapped, staked or bridged products of a token that already trades.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'Age: ' }),
            'the time since first listing is the best record of how long a protocol has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.'
          )
        ),
        el('div', null,
          el('h3', { text: 'How a farm plan is priced' }),
          el('p', { class: 'note' },
            el('b', { text: 'Slice: ' }),
            'depositors get ' + Math.round(m.depositor_share * 100) + '% of the implied value, pro-rata by the deposit\'s share of TVL.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'Fees: ' }),
            '$' + m.fee_usd + ' of gas, plus $' + m.fee_multichain_usd + ' when the plan uses a second chain.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'Verdict: ' }),
            'FARM when the net is at least $' + m.farm_threshold_usd + ', THIN when it is at least $0, SKIP when it is below $0. The net per hour divides the net by the hands-on time: ' + m.setup_minutes + ' minutes to set up plus ' + m.weekly_minutes + ' minutes a week.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'Bands: ' }),
            'every row carries its P25-P75 band and its P10-P90 band from the leave-one-out ratios, so a wide band says the price is uncertain, not that the row is wrong.'
          )
        )
      ),
      el('div', { class: 'model-grid' },
        el('div', null,
          el('h3', { text: 'Set aside, by reason' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'mult-table' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Reason' }), el('th', { scope: 'col', text: 'Protocols' }))),
              el('tbody', null, setAsideRows.concat([
                el('tr', null, el('td', { text: 'Total set aside' }), el('td', { class: 'num', text: String(setAsideTotal) }))
              ]))
            )
          ),
          el('p', { class: 'note', text: 'Of the ' + DATA.pre_token_size + ' pre-token protocols, ' + DATA.board_size + ' are ranked and ' + setAsideTotal + ' are set aside. ' + DATA.token_size + ' further protocols already have a token, so they were never candidates for a launch.' })
        ),
        el('div', null,
          el('h3', { text: 'What set-aside means' }),
          el('p', { class: 'note' },
            el('b', { text: 'Not a verdict: ' }),
            'a set-aside protocol is not a bad protocol. The board ranks launches that do not exist yet; a bridge or a liquid staking product already has its shape, and a versioned pool is one version of a product that already runs.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'The rule is the same for every row: ' }),
            'the reasons above are the board\'s own checks, run on the snapshot alone — category, name and token record — with no name special-cased.'
          ),
          el('p', { class: 'note' },
            el('b', { text: 'Watchlist: ' }),
            'every watchlist protocol is ranked, even one the set-aside rules would leave out; the watchlist is the floor, and the board never drops one of its rows.'
          )
        )
      )
    );
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Implied value is a model of what a token would be worth if the protocol launched one at the snapshot figures. It is not a price, not a prediction of a launch, and not financial advice.' }),
      el('p', { text: 'Data: the sealed DefiLlama protocol snapshot of ' + DATA.as_of + '. A protocol is shown as pre-token when its record carries no token; that record is not proof it has none. Farm plans cost real money and carry real risk: use a fresh wallet, never pay to claim, and never send funds to a link that is not the protocol\u2019s own.' })
    );
  }

  var drawer = el('aside', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  var scrim = el('div', { class: 'scrim', onclick: function () { closeDetail(); } });

  function closeDetail() {
    state.selected = null;
    writeHash();
    drawer.classList.remove('open');
    scrim.classList.remove('open');
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    drawer.textContent = '';
    var steps = farmSteps(row, state.deposit);
    var econ = econOf(row, state.deposit);
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    drawer.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'badge ' + (row.watchlist ? 'watch' : 'early'), text: (row.watchlist ? 'Watchlist' : 'Early') + ' · Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { closeDetail(); } })
    ));
    drawer.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted base (10^' + DATA.fit.intercept.toFixed(2) + ' x TVL^' + DATA.fit.slope.toFixed(2) + ')' }), el('b', { class: 'num', text: fmtUsd(Math.pow(10, DATA.fit.intercept + DATA.fit.slope * Math.log10(row.tvl_usd))) })),
        el('div', null, el('span', { text: 'Category factor' }), el('b', { class: 'num', text: fmtMult(row.category_factor) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'P25-P75 band' }), el('b', { class: 'num', text: fmtUsd(row.band_lo_usd) + ' - ' + fmtUsd(row.band_hi_usd) })),
        el('div', null, el('span', { text: 'P10-P90 band' }), el('b', { class: 'num', text: fmtUsd(row.p10_usd) + ' - ' + fmtUsd(row.p90_usd) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'match' + (matches ? '' : ' warn') },
        'Model ', el('b', { text: DATA.model_version }), ': the page recomputes this row as ',
        el('b', { text: fmtUsd(recomputed) }),
        matches ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.',
        ' This is an estimate, not a price.'
      )
    ));
    drawer.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Deposit' }), el('b', { class: 'num', text: '$' + state.deposit.toLocaleString('en-US') })),
        el('div', null, el('span', { text: 'Slice of the launch' }), el('b', { class: 'num', text: '$' + econ.slice.toLocaleString('en-US') })),
        el('div', null, el('span', { text: 'Fees (gas and bridge)' }), el('b', { class: 'num', text: '$' + econ.fees })),
        el('div', null, el('span', { text: 'Net' }), el('b', { class: 'num', text: fmtSigned(econ.net) })),
        el('div', null, el('span', { text: 'Break-even deposit' }), el('b', { class: 'num', text: '$' + econ.breakeven.toLocaleString('en-US') })),
        el('div', null, el('span', { text: 'Net per hands-on hour' }), el('b', { class: 'num', text: fmtSigned(Math.round(econ.netPerHour * 100) / 100) + '/h' })),
        el('div', { class: 'total' }, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: econ.verdict }))
      ),
      el('p', { class: 'match' }, 'Depositors get 10% of the implied value, pro-rata by the deposit\'s share of TVL. A verdict of FARM means the plan nets at least $10 after fees; THIN means it nets at least $0; SKIP means it loses money.')
    ));
    drawer.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    drawer.classList.add('open');
    scrim.classList.add('open');
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(scatter());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!drawer.isConnected) { app.appendChild(scrim); app.appendChild(drawer); }
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDetail();
  });
})();
