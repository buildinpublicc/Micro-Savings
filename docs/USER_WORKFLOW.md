# Micro-Savings — end-to-end user workflow

How the product behaves from first click through yield, with blockchain kept invisible in the UI.

## Stack (reference)

| Concern | Typical integration |
|--------|----------------------|
| Login / embedded wallet | Privy, **or** Cartridge (matches your Sepolia RPC host) |
| Chain | Starknet Sepolia — see `src/config/starknet.js` |
| Swaps + paymaster (sponsored fees) | AVNU |
| Yield / lending | Vesu |
| App orchestration | Your backend + scheduler |

## 1. Onboard

- User opens the app and continues with Google (or email).
- **Behind the scenes:** embedded wallet is created or connected; no seed phrase in the happy path.
- **Outcome:** user is authenticated and has a Starknet identity without “wallet setup” copy.

## 2. Add money

- User deposits (crypto first; fiat on-ramp can come later).
- Funds sit in the user’s Starknet account.
- **UI:** balance and a clear “ready to save” state.

## 3. Create savings plan

User sets amount, frequency, duration, and toggles (auto-save, yield, convert to stablecoin).

**Example payload stored by the backend:**

```json
{
  "amount": 2000,
  "frequency": "weekly",
  "duration": "3 months",
  "autoConvert": true,
  "earnYield": true
}
```

Shape is mirrored in code as `SavingsPlanPayload` in `src/domain/savings-plan.js`.

## 4. Auto-save (scheduler)

- On each schedule tick (cron / queue worker), the backend triggers the save flow for eligible users.
- Amount and rules come from stored plans.

## 5. Convert to stablecoin (optional)

If `autoConvert` is true:

- Read spendable balance.
- Swap to USDC/USDT (or your chosen stable) via **AVNU**.
- **Why:** dampen volatility before locking into yield.

## 6. Send to yield

If `earnYield` is true:

- Deposit into a **Vesu** lending position (or your wrapped strategy).
- **Outcome:** balance accrues interest; dashboard shows earned amount over time.

## 7. Gas (hidden UX)

- Use **AVNU paymaster** (or equivalent) so users don’t see “gas” or failed fee prompts in normal flows.
- **UI copy:** stay in “Save / Grow / Withdraw” language — no “sign transaction” unless you deliberately add a confirmation step.

## 8. Dashboard

- Total saved, interest earned, goal progress (e.g. saved vs target, % complete).
- Refresh after each successful pipeline step or via polling/WebSocket from your backend.

## 9. Lock savings (optional)

- User picks 30 / 60 / 90 days (or similar).
- **System:** enforce no early withdrawal for the locked slice; rest of balance unchanged.

## 10. Suggestions (differentiator)

- Backend analyzes cadence and targets.
- **UI:** short, friendly lines (e.g. “You can save $5,000 more this week”) — no on-chain jargon.

## 11. Withdraw

1. Pull from Vesu (or unwind position) for the amount requested.
2. Optional: swap back via AVNU if the user should receive a specific token.
3. Settle to the user’s wallet (or off-ramp later).

## 12. Loop

Scheduler continues: **save → (swap) → yield → update dashboard → withdraw when allowed.**

## System flow (text)

```text
User → Login (Privy / Cartridge)
     → Deposit
     → Create plan
       ↓
Backend scheduler
       ↓
Auto-save trigger
       ↓
Swap (AVNU) [if autoConvert]
       ↓
Lend (Vesu) [if earnYield]
       ↓
Accrue yield
       ↓
Update dashboard
       ↓
Withdraw (if unlocked)
```

## Product framing

Not “a crypto app” — an **automated savings product** where chain, gas, and addresses stay under the hood.

## Next implementation steps (in this repo)

- **Backend:** Scaffold under `backend/` — Express + SQLite (`better-sqlite3`) + `node-cron`. See `backend/README.md`.
- **Client:** **Starkzap** is installed (`starkzap`, `starknet`, `@cartridge/controller`). Shared SDK: `src/sdk/starkzap-client.js` (`getStarkZap()`). Cartridge session: `src/wallet/starkzap-connection.js`. Onboarding calls `connectCartridge()` after the confirm modal. **Sepolia save → AVNU swap → Vesu deposit:** `src/flows/sepolia-save-swap-deposit.js` (re-exported from `src/flows/onchain-savings.js`); session-bound helper: `runConnectedSaveSwapDeposit(amount)` in `src/flows/sepolia-pipeline.js`. RPC/explorer defaults: `src/config/starknet.js`.
- Say **“build backend”** or **“show code”** to go deeper on either path.
