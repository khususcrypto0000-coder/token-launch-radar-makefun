# Launch Radar — Build the best token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/khususcrypto0000-coder/token-launch-radar-makefun/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/khususcrypto0000-coder/token-launch-radar-makefun/reward.svg)](https://make.fun/bounty/token-radar-01)

An entry for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC). It reads the sealed DefiLlama snapshot, finds the protocols that record no token yet, ranks them by what a launch would be worth, and hands in a web dashboard a reader can actually use: a sortable, filterable board, a detail view for every protocol with the maths shown, a farm plan with costs and times, and a reference panel of protocols whose token already trades.

## The model (launch-radar-2)

Every row scores from the snapshot's own figures only — TVL, seven-day TVL change, and how long the protocol has run with no token. No name is special-cased.

```
implied = round(TVL ^ 0.85) × 0.35 × growth × maturity
growth   = 1 + clamp(change_7d, -50%, +150%) / 100 × 0.6
maturity = 0.65 + min(age_days, 1095) / 1095 × 0.35   (unknown age counts as 365 days)
```

The board holds 198 rows: the whole 40-protocol watchlist plus the 158 pre-token protocols below the watchlist floor that pass the same test the watchlist itself uses — no token recorded, and not a wrapped, staked or bridged product and not an exchange. The dashboard also shows the 24 largest live-token protocols by market cap for comparison — they are never mixed into the ranked board.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/` and `screenshots/` into the output directory, then `dossier.json` with the vendored make.fun library. It runs twice in grading and both runs write the same bytes: no clock, no random, no network. Open `out/dashboard/index.html` in a browser to use the board.
## What the dashboard shows

- **The board** — all 198 ranked protocols with TVL, 7-day change, age and implied value. Search by name or slug, filter by category or chain, show the watchlist only, and sort by implied value, TVL, growth or age.
- **Detail view** — click any row (or open `#detail=<slug>`) to see the protocol's full maths — base, growth and maturity factors with the numbers filled in — plus its five-step farm plan.
- **Farm plans** — every protocol gets concrete steps with what they cost and how long they take: bridging and gas per chain, position size from its TVL tier, a weekly usage rhythm for 4–6 weeks, free off-chain tasks, and a tracking and exit plan.
- **Already trading** — the 24 biggest live-token protocols by market cap, shown for reference so an implied value can be read against a real one.

## Files

- `main.ts` — the entrypoint: reads the snapshot, builds the board, writes the outputs.
- `lib/radar.ts` — the model, the farm plans, the board builder and the snapshot checks.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`. No network, no framework.
- `screenshots/` — the board, a protocol detail view and a filtered view.

## A note on the numbers

Implied value is this entry's own claim from the snapshot's figures. It is not a prediction that a token will be issued, or when. A protocol is called pre-token only because its DefiLlama record carries no token — the record is not proof it has none.
