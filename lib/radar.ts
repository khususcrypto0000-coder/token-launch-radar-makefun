// Launch Radar — the valuation model for token-radar-01.
//
// The board ranks protocols that record no token yet by what a launch would be
// worth if their record stayed as it is. The value follows only from the
// snapshot's own figures: the protocol's TVL, its seven-day TVL change, and how
// long DefiLlama has tracked it with no token. No name is ever special-cased:
// the same three factors score every row, and the dashboard prints the maths
// for each protocol so a reader can check it.
//
//   base      = round(tvl ^ 0.85) * 0.35          (TVL, damped so the giants
//                                                  do not swallow the board)
//   growth    = 1 + clamp(change_7d, -50, 150) / 100 * 0.6
//   maturity  = 0.65 + min(age_days, 1095) / 1095 * 0.35   (unknown age: 365)
//   implied   = max(1, round(base * growth * maturity))
//
// The board carries the whole watchlist (40 rows) plus every pre-token
// protocol below the watchlist floor that passes the same test the
// watchlist itself uses: it records no token, and it is not a wrapped,
// staked or bridged product and not an exchange — the house's rule, minus
// the TVL floor. That is 158 early rows, 198 rows in all. Protocols whose
// token already trades are kept apart in a reference panel, never mixed
// into the ranked board.

export interface Proto {
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

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface ModelSpec {
  version: string;
  exponent: number;
  scale: number;
  growthWeight: number;
  growthLow: number;
  growthHigh: number;
  maturityFloor: number;
  maturitySpan: number;
  maturityDays: number;
  unknownAgeDays: number;
}

export const MODEL: ModelSpec = {
  version: 'launch-radar-2',
  exponent: 0.85,
  scale: 0.35,
  growthWeight: 0.6,
  growthLow: -50,
  growthHigh: 150,
  maturityFloor: 0.65,
  maturitySpan: 0.35,
  maturityDays: 1095,
  unknownAgeDays: 365,
};

/** Cap on early rows below the watchlist floor, by TVL. */
export const EARLY_ROWS = 200;
/** Live-token protocols shown for reference, by market cap. */
export const LIVE_ROWS = 24;

export interface Scored {
  proto: Proto;
  ageDays: number | null;
  growthPct: number;
  growthFactor: number;
  maturityFactor: number;
  baseValue: number;
  implied: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  on_watchlist: boolean;
  breakdown: { base: number; growth: number; maturity: number };
}

export interface LiveRef {
  slug: string;
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  category: string | null;
  chains: string[];
}

export interface RadarSet {
  rows: BoardRow[];
  live: LiveRef[];
  earlyCount: number;
  watchlistCount: number;
}

const DAY_MS = 86_400_000;

function clamp(n: number, low: number, high: number): number {
  return n < low ? low : n > high ? high : n;
}

/** Whole days between the snapshot date and the day tracking began. */
export function ageInDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const days = Math.floor((end - start) / DAY_MS);
  return days < 0 ? 0 : days;
}

/** A protocol records no token when the snapshot carries no market cap, no CoinGecko id and no symbol. */
export function isPreToken(p: Proto): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a
 * wrapped, staked or bridged product of a token that already trades, not
 * an exchange, and not a versioned pool. This is the watchlist's own test
 * from the rules, minus the TVL floor — the floor is where the house's
 * reading started, not where this radar stops.
 */
export function isRankable(p: Proto): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/** Score one protocol with the model above; every input comes from the snapshot. */
export function scoreProto(p: Proto, asOf: string, spec: ModelSpec = MODEL): Scored {
  const age = ageInDays(asOf, p.listed_at);
  const growthPct = p.change_7d === null ? 0 : p.change_7d;
  const growthFactor = 1 + (clamp(growthPct, spec.growthLow, spec.growthHigh) / 100) * spec.growthWeight;
  const ageForMaturity = age === null ? spec.unknownAgeDays : age;
  const maturityFactor =
    spec.maturityFloor + (Math.min(ageForMaturity, spec.maturityDays) / spec.maturityDays) * spec.maturitySpan;
  const baseValue = Math.round(Math.pow(p.tvl_usd, spec.exponent) * spec.scale);
  const implied = Math.max(1, Math.round(baseValue * growthFactor * maturityFactor));
  return { proto: p, ageDays: age, growthPct, growthFactor, maturityFactor, baseValue, implied };
}

// ---- Farming plans ---------------------------------------------------------
//
// Every plan is concrete: what to do, what it costs, how long it takes.
// Capital follows the protocol's TVL tier; gas follows its cheapest chain;
// the action verb follows its category. Nothing here names a token, an
// airdrop or a date the snapshot does not support.

interface ChainCosts {
  gas: string;
  bridgeMinutes: string;
}

const CHAIN_COSTS: Record<string, ChainCosts> = {
  Ethereum: { gas: '$3–$8', bridgeMinutes: '15–30' },
  Base: { gas: '$0.05–$0.30', bridgeMinutes: '5–10' },
  Arbitrum: { gas: '$0.05–$0.30', bridgeMinutes: '5–10' },
  Optimism: { gas: '$0.05–$0.30', bridgeMinutes: '5–10' },
  Solana: { gas: '$0.01–$0.05', bridgeMinutes: '2–5' },
  Binance: { gas: '$0.10–$0.50', bridgeMinutes: '5–10' },
  'BNB Chain': { gas: '$0.10–$0.50', bridgeMinutes: '5–10' },
  Polygon: { gas: '$0.05–$0.20', bridgeMinutes: '5–10' },
  Avalanche: { gas: '$0.10–$0.50', bridgeMinutes: '5–10' },
};

const DEFAULT_COSTS: ChainCosts = { gas: '$0.10–$1.00', bridgeMinutes: '5–15' };

function chainCosts(chain: string): ChainCosts {
  return CHAIN_COSTS[chain] ?? DEFAULT_COSTS;
}

function capitalFor(tvl: number): number {
  if (tvl >= 500_000_000) return 2000;
  if (tvl >= 100_000_000) return 1000;
  if (tvl >= 50_000_000) return 500;
  return 250;
}

function verbFor(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex')) return 'swap through';
  if (c.includes('lend')) return 'supply to and borrow from';
  if (c.includes('yield')) return 'deposit into the vaults of';
  if (c.includes('rwa')) return 'take a position in';
  if (c.includes('risk')) return 'allocate capital through';
  if (c.includes('prediction')) return 'trade on';
  if (c.includes('cdp')) return 'mint with';
  if (c.includes('restak')) return 'restake with';
  if (c.includes('deriv')) return 'open a small position on';
  if (c.includes('bridge')) return 'bridge through';
  if (c.includes('stable')) return 'mint and hold with';
  return 'use';
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

/** Five concrete steps for one protocol, each 20–600 characters. */
export function farmPlan(p: Proto): string[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const costs = chainCosts(chain);
  const capital = capitalFor(p.tvl_usd);
  const weekly = Math.max(20, Math.round(capital * 0.05));
  const verb = verbFor(p.category);
  const cat = p.category ?? 'DeFi';
  return [
    `Move ${money(capital)} of USDC to ${chain} with the chain's official bridge or a reputable aggregator, then keep ${money(50)} aside for gas. Bridging takes ${costs.bridgeMinutes} minutes and costs about ${costs.gas} per transaction on ${chain}.`,
    `Open ${p.name} on ${chain} with a fresh wallet, finish any profile or points signup, and ${verb} ${p.name} with your first ${money(capital)} in one ${cat.toLowerCase()} position. One deposit takes 10–20 minutes and about ${costs.gas} in gas.`,
    `Use the protocol every week for 4–6 weeks: 2–3 actions of at least ${money(weekly)} each week, such as a deposit, a swap or a borrow-and-repay cycle. Budget roughly ${costs.gas} of gas per action on ${chain}.`,
    `Complete the free off-chain tasks: follow the project's account, join its community channel, and finish any quests or testnet tasks it lists. These cost nothing but 30–60 minutes of your time in the first week.`,
    `Every Sunday, check the points or activity page, save a screenshot of your balances, and write down each transaction hash. If a token is announced, unstake in two or three tranches over 2 weeks and leave 10% staked for 30 days in case of a second snapshot.`,
  ];
}

// ---- Board -----------------------------------------------------------------

export function buildBoard(snap: Snap, spec: ModelSpec = MODEL): RadarSet {
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const watchlistProtos = snap.watchlist
    .map((slug) => bySlug.get(slug))
    .filter((p): p is Proto => p !== undefined && isPreToken(p));
  const watchlistSlugs = new Set(watchlistProtos.map((p) => p.slug));

  const belowFloor = snap.protocols
    .filter((p) => isRankable(p) && !watchlistSlugs.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, EARLY_ROWS);

  const scored = [...watchlistProtos, ...belowFloor]
    .map((p) => scoreProto(p, snap.as_of, spec))
    .sort((a, b) => b.implied - a.implied || b.proto.tvl_usd - a.proto.tvl_usd || (a.proto.slug < b.proto.slug ? -1 : 1));

  const rows: BoardRow[] = scored.map((s, i) => ({
    slug: s.proto.slug,
    name: s.proto.name,
    rank: i + 1,
    implied_value_usd: s.implied,
    farm_steps: farmPlan(s.proto),
    category: s.proto.category,
    chains: s.proto.chains,
    tvl_usd: s.proto.tvl_usd,
    change_7d: s.proto.change_7d,
    age_days: s.ageDays,
    on_watchlist: watchlistSlugs.has(s.proto.slug),
    breakdown: { base: s.baseValue, growth: s.growthFactor, maturity: s.maturityFactor },
  }));

  const live: LiveRef[] = snap.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      mcap_usd: p.mcap_usd ?? 0,
      tvl_usd: p.tvl_usd,
      category: p.category,
      chains: p.chains,
    }));

  return { rows, live, earlyCount: belowFloor.length, watchlistCount: watchlistProtos.length };
}

// ---- Snapshot parsing and gate checks --------------------------------------

export class SnapshotError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseSnapshot(text: string): Snap {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot is not valid JSON');
  }
  if (!isRecord(doc)) throw new SnapshotError('snapshot is not an object');
  if (!Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new SnapshotError('snapshot needs protocols and watchlist arrays');
  }
  const protocols = doc.protocols as Proto[];
  for (const p of protocols) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new SnapshotError('a protocol entry is missing slug, name or tvl_usd');
    }
  }
  return {
    as_of: String(doc.as_of ?? ''),
    source: String(doc.source ?? ''),
    floor_usd: Number(doc.floor_usd ?? 0),
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/** Returns a reason the gate would refuse this board, or null when it passes. */
export function boardProblem(rows: BoardRow[], snap: Snap): string | null {
  if (rows.length < 100) return `board holds ${rows.length} rows, the gate needs at least 100`;
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (seen.has(r.slug)) return `slug ${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${r.slug} has rank ${r.rank} at position ${i + 1}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${r.rank}`;
    }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1) {
      return `row ${r.slug} has a bad implied value`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `row ${r.slug} has ${r.farm_steps.length} farm steps`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  if (rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) {
    return 'every implied value is the same: not a ranking';
  }
  return null;
}

/** The dashboard's data file: one global the page reads, no network. */
export function dataScript(set: RadarSet, snap: Snap): string {
  const payload = {
    asOf: snap.as_of,
    floorUsd: snap.floor_usd,
    modelVersion: MODEL.version,
    model: {
      exponent: MODEL.exponent,
      scale: MODEL.scale,
      growthWeight: MODEL.growthWeight,
      growthLow: MODEL.growthLow,
      growthHigh: MODEL.growthHigh,
      maturityFloor: MODEL.maturityFloor,
      maturitySpan: MODEL.maturitySpan,
      maturityDays: MODEL.maturityDays,
      unknownAgeDays: MODEL.unknownAgeDays,
    },
    rows: set.rows,
    live: set.live,
  };
  return `window.TOKEN_RADAR = ${JSON.stringify(payload)};\n`;
}
