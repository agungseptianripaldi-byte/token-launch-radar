# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/agungseptianripaldi-byte/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/agungseptianripaldi-byte/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: ranks 183 pre-token DeFi protocols by implied launch value, computed from a sealed DefiLlama snapshot (40-protocol watchlist + 143 early names), and serves the board as a static dashboard with a detail view, filters, and a farm plan for every row. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

The model is category-calibrated: each category's FDV/TVL multiple is the median of the protocols in that category whose token already trades, computed from the snapshot itself at run time. Implied value is the entry's own claim, never one make.fun makes; a protocol is said to record no token, never that it has none.

## Run it

```sh
# with the sealed snapshot from the bounty kit:
node main.ts --input <kit>/input/snapshot.json --output out
# then open out/dashboard/index.html
```

Requires Node.js 22.18 or later. No dependencies, no network at run time. The run is deterministic: the same snapshot always writes the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
