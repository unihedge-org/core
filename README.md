# Unihedge — Core Contracts

Unihedge is a **decentralized prediction market** for hedging fungible crypto assets (e.g. ETH / BTC), designed to solve the two classic issues in prediction markets: **liquidity scarcity** and **trust in central operators**.

Website: https://unihedge.org  
App (Live on Polygon): https://app.unihedge.org  

---

## Mechanism in Brief

Unihedge combines a **Dynamic Parimutuel Model (DPM)** for *unlimited buy-in liquidity* with a novel **Reverse Harberger Tax (RHT)** on positions:

- **Reverse Harberger Tax (RHT)**  
  Market frames are time-bound. Holders self-assess a price `p` on their position.  
  Anyone can buy it out immediately at `p`. The acquirer pays a **one-time tax** on their new `p`,
  where the tax is **inversely indexed to time-to-expiry** (`h`):
  - near expiry → ~100% tax (anti-squatting)
  - far from expiry → ~25% tax (cheap early entry)
  - decay via inverse-root curve

- **Liquidity Flywheel**  
  All RHT taxes enter a global reward pool.  
  At each settlement:
  - **10%** pays winners (pro-rata by *duration of ownership* inside winning band)
  - **90%** rolls forward → compounding liquidity over time

- **Market Model**  
  Users create or join **frames** (e.g. 24h / 7d) and buy **position-lots** on outcome bands.
  Frames resolve via decentralized oracles (e.g. Uniswap TWAP).  
  No admin pricing — markets emerge endogenously, frame-by-frame.

---

## Why Unihedge?

- **Unlimited Liquidity** — No waiting for counterparties (unlike CDA models e.g. Augur)
- **Hedger-Aligned** — Cheap early entry, anti-squat at expiry
- **Fully On-Chain** — No operator risk, budget-balanced, built on low-fee Polygon
- **Real Use-Cases** — Hedge volatility or express conviction in a thin-trader environment

Currently live in testing on Polygon with multi-chain, API, and governance roadmap ahead.

---

## Deployments (Polygon Mainnet)

| Contract       | Address |
|----------------|---------|
| **Market**      | https://polygonscan.com/address/0x3C486b7178Eb71d50D060Dd02602aBfAcB88EA21 |
| **MarketGetter** | https://polygonscan.com/address/0xD8581Cc08E2afC75960DE0a304c540627Cf42D15 |

## Contributing

PRs welcome — open an issue first to discuss architectural / economic changes.  
Security reports: please use private channels (contact via website footer).

## License

This repository is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.  
See the `LICENSE` file for details.

