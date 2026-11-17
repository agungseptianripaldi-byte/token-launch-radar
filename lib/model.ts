// Token Radar's model, version radar-3: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every protocol the snapshot's own record still leaves as a possible launch:
// pre-token, not an exchange, not a versioned pool, not a wrapped, staked or bridged product of
// a token that already trades, and not named for an exchange or for wrapping or staking. The
// watchlist is the floor, never the ceiling: the board holds all 40 of its slugs, plus every
// other protocol that passes the same rule, above the floor or below it. Live-token protocols
// are kept apart and shown with the market's own values, never mixed into the ranked board.
//
// Implied value is FITTED, not asserted. The model regresses the traded tokens on the snapshot
// itself: log10(market cap) on log10(TVL) over every protocol whose token already trades, by
// ordinary least squares, then prices each pre-token protocol off that curve:
//
//   base       = 10^intercept x tvl_usd^slope          (the fitted comps curve)
//   catFactor  = median residual of the protocol's category on the same fit (1 when the
//                category has fewer than three traded tokens; clamped to [0.15, 4])
//   momentum   = 1 + clamp(change_7d, -50, 100) / 100 x 0.5
//   seasoning  = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + min(chains - 1, 5) x 0.02
//   implied    = max(1, round(base x catFactor x momentum x seasoning x breadth))
//
// The fit is then TESTED on the same snapshot, blind, by leave-one-out: every traded token is
// priced by a fit that never saw it, and the board reports the median miss, the share within
// 3x and within 10x, and the same numbers for a flat median multiple, so a reader can see what
// the curve buys. The P25-P75 band of the leave-one-out ratios is the board's uncertainty band
// for every row. No protocol name is ever special-cased: the same function scores every row.
//
// Every row also carries its farm economics for a $1,000 deposit: the slice is the depositors'
// 10% of the implied value, pro-rata by the deposit's share of TVL; the fees are the gas and
// bridge cost of running the plan; the net is the slice minus the fees; the break-even deposit
// is the deposit at which the slice equals the fees; the verdict is FARM when the net is at
// least $10, THIN when it is at least $0, and SKIP when it is below $0.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  factor_floor: number;
  factor_cap: number;
  min_category_samples: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  deposit_usd: number;
  depositor_share: number;
  fee_usd: number;
  fee_multichain_usd: number;
  setup_minutes: number;
  weekly_minutes: number;
  farm_threshold_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  factor_floor: 0.15,
  factor_cap: 4,
  min_category_samples: 3,
  breadth_per_chain: 0.02,
  breadth_max_chains: 5,
  deposit_usd: 1000,
  depositor_share: 0.1,
  fee_usd: 8,
  fee_multichain_usd: 4,
  setup_minutes: 45,
  weekly_minutes: 10,
  farm_threshold_usd: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product of a token that
 *  already trades: they are not a token that does not exist yet, so the radar leaves them out
 *  (the watchlist itself never names them either). */
export const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol may not begin with: it is the exchange's own product, not a launch. */
export const EXCHANGE_PREFIXES: readonly string[] = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  p10_usd: number;
  p90_usd: number;
  slice_usd: number;
  fees_usd: number;
  net_usd: number;
  breakeven_usd: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  watchlist: boolean;
  model: {
    category_factor: number;
    category_samples: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  p10_usd: number;
  p90_usd: number;
  slice_usd: number;
  fees_usd: number;
  net_usd: number;
  breakeven_usd: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  watchlist: boolean;
  category_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One traded token as a point on the comps scatter: TVL against market cap. */
export interface CompPoint {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** One category's factor, as the dashboard's model table shows it. */
export interface CategoryFactor {
  category: string;
  samples: number;
  factor: number;
}

/** The fitted curve and its blind test, as the dashboard shows them. */
export interface FitReport {
  intercept: number;
  slope: number;
  r_squared: number;
  comps: number;
  loo_median_miss: number;
  loo_within_3x: number;
  loo_within_10x: number;
  loo_spearman: number;
  loo_p10: number;
  loo_p25: number;
  loo_p75: number;
  loo_p90: number;
  flat_median_miss: number;
  flat_within_3x: number;
  flat_within_10x: number;
}

/** Everything the dashboard needs: the board, the live set, the fit, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  fit: FitReport;
  category_factors: CategoryFactor[];
  comps: CompPoint[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted array, or null when it is empty. */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The value at quantile `q` (0..1) of a sorted array, by linear interpolation on position. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 1;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The traded tokens: protocols whose token already trades, with a market cap and a TVL. */
export function tradedComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/** Ordinary least squares of log10(market cap) on log10(TVL): the comps curve. */
export function fitCurve(
  comps: SnapshotProtocol[],
): { intercept: number; slope: number; rSquared: number } {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sst += (ys[i]! - my) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (intercept + slope * xs[i]!);
    ssr += r * r;
  }
  return { intercept, slope, rSquared: sst === 0 ? 0 : 1 - ssr / sst };
}

/** The median residual ratio per category on a fitted curve: how far that kind of protocol
 *  trades from the curve. Categories with too few traded tokens take 1: the curve alone. */
export function categoryFactors(
  comps: SnapshotProtocol[],
  fit: { intercept: number; slope: number },
  model: ModelConstants = MODEL,
): { byCategory: Map<string, { factor: number; samples: number }>; table: CategoryFactor[] } {
  const byCat = new Map<string, number[]>();
  for (const p of comps) {
    const ratio = p.mcap_usd! / Math.pow(10, fit.intercept + fit.slope * Math.log10(p.tvl_usd));
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const list = byCat.get(p.category ?? 'Other') ?? [];
    list.push(ratio);
    byCat.set(p.category ?? 'Other', list);
  }
  const clamp = (n: number): number =>
    Math.min(model.factor_cap, Math.max(model.factor_floor, n));
  const out = new Map<string, { factor: number; samples: number }>();
  const table: CategoryFactor[] = [];
  for (const [category, ratios] of [...byCat.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    ratios.sort((a, b) => a - b);
    const med = median(ratios);
    if (med === null) continue;
    const samples = ratios.length;
    const factor = samples >= model.min_category_samples ? clamp(med) : 1;
    out.set(category, { factor, samples });
    table.push({ category, samples, factor });
  }
  table.sort((a, b) => b.factor - a.factor || (a.category < b.category ? -1 : 1));
  return { byCategory: out, table };
}

/** The factor one category gets: its own median residual, or 1 when it has too few. */
export function factorFor(
  category: string | null,
  factors: Map<string, { factor: number; samples: number }>,
): { factor: number; samples: number } {
  const found = factors.get(category ?? 'Other');
  return found ?? { factor: 1, samples: 0 };
}

/** The four multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: { intercept: number; slope: number },
  factors: Map<string, { factor: number; samples: number }>,
  model: ModelConstants,
): {
  implied: number;
  categoryFactor: number;
  categorySamples: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { factor: categoryFactor, samples: categorySamples } = factorFor(protocol.category, factors);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.max(0, Math.min(protocol.chains.length - 1, model.breadth_max_chains));
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const base = Math.pow(10, fit.intercept + fit.slope * Math.log10(protocol.tvl_usd));
  const implied = Math.max(1, Math.round(base * categoryFactor * growthMult * maturityMult * breadthMult));
  return { implied, categoryFactor, categorySamples, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** One protocol's full-model prediction, for the blind test: the same arithmetic as
 *  `impliedValue`, but against a fit made without it. */
function predictWith(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: { intercept: number; slope: number },
  factors: Map<string, { factor: number; samples: number }>,
  model: ModelConstants,
): number {
  return impliedValue(protocol, asOf, fit, factors, model).implied;
}

/** Spearman's rank correlation between two equal-length arrays of numbers. */
function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const rank = (xs: number[]): number[] => {
    const order = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v || p.i - q.i);
    const out = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1]!.v === order[i]!.v) j++;
      const mean = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k]!.i] = mean;
      i = j + 1;
    }
    return out;
  };
  const ra = rank(a);
  const rb = rank(b);
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) * (ra[i]! - ma);
    db += (rb[i]! - mb) * (rb[i]! - mb);
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * The blind test: leave-one-out over the traded tokens. Every token is priced by a curve and
 * category factors fitted without it, and the miss is the larger of actual-over-predicted and
 * predicted-over-actual. The flat baseline prices every token at the median market-cap-to-TVL
 * ratio of the others. All of it is computed from this snapshot, at run time.
 */
export function blindTest(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): FitReport {
  const comps = tradedComps(snapshot);
  const full = fitCurve(comps);
  const ratios: number[] = [];
  const misses: number[] = [];
  const predicted: number[] = [];
  const actual: number[] = [];
  const flatMisses: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const p = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    const fit = fitCurve(rest);
    const { byCategory } = categoryFactors(rest, fit, model);
    const pred = predictWith(p, snapshot.as_of, fit, byCategory, model);
    const ratio = p.mcap_usd! / pred;
    ratios.push(ratio);
    misses.push(Math.max(ratio, 1 / ratio));
    predicted.push(pred);
    actual.push(p.mcap_usd!);
    const flatRatios = rest
      .map((q) => q.mcap_usd! / q.tvl_usd)
      .sort((a, b) => a - b);
    const flatMed = median(flatRatios) ?? 0.2;
    const flatPred = Math.max(1, Math.round(p.tvl_usd * flatMed));
    flatMisses.push(Math.max(p.mcap_usd! / flatPred, flatPred / p.mcap_usd!));
  }
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const sortedMisses = [...misses].sort((a, b) => a - b);
  const sortedFlat = [...flatMisses].sort((a, b) => a - b);
  const within = (arr: number[], k: number): number =>
    arr.filter((m) => m <= k).length / arr.length;
  return {
    intercept: full.intercept,
    slope: full.slope,
    r_squared: full.rSquared,
    comps: comps.length,
    loo_median_miss: median(sortedMisses) ?? 1,
    loo_within_3x: within(misses, 3),
    loo_within_10x: within(misses, 10),
    loo_spearman: spearman(predicted, actual),
    loo_p10: quantile(sortedRatios, 0.1),
    loo_p25: quantile(sortedRatios, 0.25),
    loo_p75: quantile(sortedRatios, 0.75),
    loo_p90: quantile(sortedRatios, 0.9),
    flat_median_miss: median(sortedFlat) ?? 1,
    flat_within_3x: within(flatMisses, 3),
    flat_within_10x: within(flatMisses, 10),
  };
}

/** The farm economics of one row for the model's deposit: slice, fees, net, break-even, verdict. */
export function farmEconomics(
  implied: number,
  tvlUsd: number,
  chains: string[],
  holdDays: number,
  model: ModelConstants = MODEL,
): {
  slice: number;
  fees: number;
  net: number;
  breakeven: number;
  netPerHour: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  hours: number;
} {
  const slice = Math.round(implied * model.depositor_share * (model.deposit_usd / tvlUsd));
  const fees = model.fee_usd + (chains.length > 1 ? model.fee_multichain_usd : 0);
  const net = slice - fees;
  const breakeven = Math.round((fees * tvlUsd) / (model.depositor_share * implied));
  const weeks = Math.max(1, Math.ceil(holdDays / 7));
  const hours = (model.setup_minutes + model.weekly_minutes * weeks) / 60;
  const netPerHour = net / hours;
  const verdict = net >= model.farm_threshold_usd ? 'FARM' : net >= 0 ? 'THIN' : 'SKIP';
  return { slice, fees, net, breakeven, netPerHour, verdict, hours };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word `wrapped`, `staked` or `staking` in a name: a product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned
 *  pool, not named for an exchange, and not a wrapped, staked or bridged product of a token
 *  that already trades. The snapshot carries no parent protocol, so the name and category
 *  rules are the whole of the check the entry can run. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    p.category !== 'CEX' &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix)) &&
    !WRAPPED_WORD.test(p.name) &&
    (p.category === null || !EXCLUDED_CATEGORIES.has(p.category))
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = tradedComps(snapshot);
  const fit = fitCurve(comps);
  const { byCategory } = categoryFactors(comps, fit, model);
  const test = blindTest(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const watchlistSet = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every pre-token protocol that can still be a launch, above the floor or
  // below it. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, byCategory, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const hold = holdDaysFor(s.age);
    const econ = farmEconomics(s.implied, s.p.tvl_usd, s.p.chains, hold, model);
    const bandLo = Math.max(1, Math.round(s.implied * test.loo_p25));
    const bandHi = Math.max(bandLo + 1, Math.round(s.implied * test.loo_p75));
    const p10 = Math.max(1, Math.round(s.implied * test.loo_p10));
    const p90 = Math.max(bandHi + 1, Math.round(s.implied * test.loo_p90));
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      band_lo_usd: bandLo,
      band_hi_usd: bandHi,
      p10_usd: p10,
      p90_usd: p90,
      slice_usd: econ.slice,
      fees_usd: econ.fees,
      net_usd: econ.net,
      breakeven_usd: econ.breakeven,
      net_per_hour_usd: Math.round(econ.netPerHour * 100) / 100,
      verdict: econ.verdict,
      watchlist: watchlistSet.has(s.p.slug),
      model: {
        category_factor: s.categoryFactor,
        category_samples: s.categorySamples,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age, s.implied, econ).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s main yield vault on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Route a $${capital} payment through ${name} on ${chain} and keep using it for transfers.`;
  if (c.includes('governance')) return `Deposit $${capital} of USDC into ${name} on ${chain} and vote in its next proposal.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain and use its apps for a week.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the position stays active. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('leveraged farm')) return 'a swap in the main pool';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'a borrow or a repayment';
  if (c.includes('perpetual') || c.includes('derivative')) return 'a small trade or a funding check';
  if (c.includes('prediction')) return 'one market position';
  if (c.includes('governance')) return 'a vote or a forum comment';
  if (c.includes('bridge') || c.includes('chain')) return 'one transfer through the app';
  return 'a deposit, a swap or a vote';
}

/**
 * A protocol's farm plan: the base steps, a second-chain step when it runs on more than one
 * chain, and an economics step that prices the plan itself. The plan is derived from the
 * protocol's own record (category, chains, TVL, age, implied value), never from a hand-written
 * list of names.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  econ: { slice: number; fees: number; net: number; verdict: 'FARM' | 'THIN' | 'SKIP' },
): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
  ];
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    steps.push({
      text: `Use the position on a second chain too: bridge $${capital} of the deposit to ${second} and repeat the main action there, so the wallet is active on both chains.`,
      cost: 'about $4 of bridge fees',
      time: '15 minutes',
    });
  }
  steps.push(
    {
      text: `Make one qualifying action each week, such as ${weekly}, so the wallet stays active.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Price the plan before you start: a $1,000 deposit earns a slice of about $${econ.slice} if the launch prices at the board's $${implied.toLocaleString('en-US')} implied value, against about $${econ.fees} of fees, for a net of about $${econ.net} (verdict ${econ.verdict}).`,
      cost: 'nothing to check',
      time: '5 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    band_lo_usd: row.band_lo_usd,
    band_hi_usd: row.band_hi_usd,
    p10_usd: row.p10_usd,
    p90_usd: row.p90_usd,
    slice_usd: row.slice_usd,
    fees_usd: row.fees_usd,
    net_usd: row.net_usd,
    breakeven_usd: row.breakeven_usd,
    net_per_hour_usd: row.net_per_hour_usd,
    verdict: row.verdict,
    watchlist: row.watchlist,
    category_factor: row.model.category_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = tradedComps(snapshot);
  const fit = fitCurve(comps);
  const { table } = categoryFactors(comps, fit, model);
  const test = blindTest(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const totalImplied = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: totalImplied,
    fit: {
      // Full precision: the page recomputes every row from these two numbers, and a rounded
      // intercept would price the board differently from the page that checks it.
      intercept: test.intercept,
      slope: test.slope,
      r_squared: Math.round(test.r_squared * 1000) / 1000,
      comps: test.comps,
      loo_median_miss: Math.round(test.loo_median_miss * 100) / 100,
      loo_within_3x: Math.round(test.loo_within_3x * 1000) / 1000,
      loo_within_10x: Math.round(test.loo_within_10x * 1000) / 1000,
      loo_spearman: Math.round(test.loo_spearman * 1000) / 1000,
      loo_p10: Math.round(test.loo_p10 * 100) / 100,
      loo_p25: Math.round(test.loo_p25 * 100) / 100,
      loo_p75: Math.round(test.loo_p75 * 100) / 100,
      loo_p90: Math.round(test.loo_p90 * 100) / 100,
      flat_median_miss: Math.round(test.flat_median_miss * 100) / 100,
      flat_within_3x: Math.round(test.flat_within_3x * 1000) / 1000,
      flat_within_10x: Math.round(test.flat_within_10x * 1000) / 1000,
    },
    category_factors: table,
    comps: comps
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
      }))
      .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
