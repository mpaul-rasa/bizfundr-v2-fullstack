# Buzfundr V2 — Complete Setup Guide

## What This Is

A full-stack crowdfunding platform with on-chain fund locking.
**4 layers**: Smart Contract → Node.js API → Laravel API → React Frontend

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  React Frontend  │────▶│   Laravel API    │────▶│   Node.js API    │────▶│  Smart Contract  │
│  (Vite+Tailwind) │     │ (Business Logic) │     │   (ethers.js)    │     │  (Solidity/EVM)  │
│   Port 5173      │     │   Port 8000      │     │   Port 3001      │     │  Hardhat :8545   │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
       ↑                        ↑                        ↑                        ↑
   Investor UI            Validation &             Blockchain              On-chain fund
   Compliance forms       Database (8yr)           interaction             locking & rules
   MetaMask connect       Audit logging            Contract calls          $2500 cap, 48hr
```

## Prerequisites

- Node.js 18+
- PHP 8.2+ with Composer
- MySQL/SQLite

## Project Structure

```
buzfundr/
├── blockchain/          ← Smart Contract + Node.js API
│   ├── contracts/       ← Solidity contracts
│   ├── scripts/         ← Deploy scripts
│   ├── src/             ← Node.js Express API
│   ├── hardhat.config.js
│   └── package.json
├── laravel-api/         ← Laravel API (business logic + database)
│   ├── app/
│   ├── database/
│   └── routes/
├── frontend/            ← React (Vite + Tailwind)
│   ├── src/
│   └── package.json
└── SETUP_GUIDE.md       ← This file
```

## Setup (4 Terminals)

### Terminal 1 — Hardhat Blockchain Node

```bash
cd buzfundr/blockchain
npm install
npx hardhat node
```

Leave running. Shows 20 test accounts with private keys.

### Terminal 2 — Deploy Contracts + Start Node.js API

```bash
cd buzfundr/blockchain
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```

Output: `MockUSDC deployed at: 0x5FbDB2...`

**Copy that address** into `blockchain/.env`:

```
USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Start the Node.js API:

```bash
npm start
```

Shows: `Buzfundr Blockchain API on port 3001`

### Terminal 3 — Laravel API

```bash
cd buzfundr/laravel-api

# If fresh Laravel project needed:
composer create-project laravel/laravel . --prefer-dist
# Then copy the provided files into the project

# Configure .env
# Set DB_CONNECTION, BLOCKCHAIN_API_URL, BLOCKCHAIN_API_KEY
php artisan migrate:fresh --seed
php artisan migrate
php artisan serve --port=8000
```

**Laravel .env additions:**

```
BLOCKCHAIN_API_URL=http://localhost:3001
BLOCKCHAIN_API_KEY=buzfundr-node-api-key-2025
```

**Register the service in config/services.php:**

```php
'blockchain' => [
    'url' => env('BLOCKCHAIN_API_URL', 'http://localhost:3001'),
    'api_key' => env('BLOCKCHAIN_API_KEY'),
],
```

### Terminal 4 — React Frontend

```bash
cd buzfundr/frontend
npm install
npm run dev
```

Opens at http://localhost:5173

## Quick Integration Guide for Laravel

If you already have a Laravel project, copy these files:

| Source File                                         | Destination                          |
| --------------------------------------------------- | ------------------------------------ |
| `app/Services/BlockchainService.php`                | Your Laravel `app/Services/`         |
| `app/Exceptions/BlockchainException.php`            | Your Laravel `app/Exceptions/`       |
| `app/Http/Controllers/OfferingController.php`       | Your Laravel `app/Http/Controllers/` |
| `database/migrations/...create_buzfundr_tables.php` | Your Laravel `database/migrations/`  |
| `routes/api.php`                                    | Merge into your `routes/api.php`     |
| `config/services.php`                               | Merge blockchain config into yours   |

Then run:

```bash
php artisan migrate
```

## Test Wallets (Hardhat)

| Role             | Address                                      | Private Key    |
| ---------------- | -------------------------------------------- | -------------- |
| Admin (Platform) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974b...` |
| Investor 1       | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995...` |
| Issuer (Founder) | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111...` |
| Investor 2       | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `0x7c85211...` |

## Testing Scenarios

### Scenario A — Happy Path (Invest → Release)

1. Go to Dashboard → Create Offering (goal=1000, issuer wallet=0x3C44C...)
2. Go to Admin → Recharge investor wallet with 5000 USDC
3. Click "Invest Now" on the offering
4. Complete 4-step compliance (F1 doc → F2 risks → subscription → invest 1500 USDC)
5. Go to Admin → Advance Time 130 seconds
6. Go to Offering Detail → issuer calls release (or use Admin panel in testing)

### Scenario B — Fail Path

1. Create offering with goal=5000
2. Invest only 500 USDC
3. Admin → Advance Time 130s
4. Admin → Fail Offering → all investors refunded

### Scenario C — Refund (48hr window)

1. Create offering + invest
2. Immediately click refund (within 48hr window)
3. USDC returned to investor

### Scenario D — Emergency Refund

1. Create offering + invest
2. Advance time past 48hr window
3. Admin → Emergency Refund (requires reason)

## API Endpoints Summary

### Laravel API (Port 8000)

| Method | Endpoint                        | Purpose                        |
| ------ | ------------------------------- | ------------------------------ |
| GET    | /api/offerings                  | List all offerings             |
| POST   | /api/offerings                  | Create offering + deploy vault |
| GET    | /api/offerings/{id}             | Offering details + investments |
| POST   | /api/offerings/invest           | Invest (with compliance)       |
| POST   | /api/offerings/refund           | Investor refund                |
| POST   | /api/offerings/release          | Issuer release funds           |
| POST   | /api/offerings/fail             | Admin fail offering            |
| POST   | /api/offerings/emergency-refund | Admin emergency refund         |
| POST   | /api/offerings/amend            | Admin trigger amendment window |
| GET    | /api/offerings/{id}/vault       | Vault on-chain status          |
| GET    | /api/offerings/{id}/history     | On-chain event history         |

### Node.js API (Port 3001) — Internal, called by Laravel

| Method | Endpoint             | Purpose                   |
| ------ | -------------------- | ------------------------- |
| POST   | /deploy-vault        | Deploy new vault contract |
| POST   | /invest              | Lock USDC in vault        |
| POST   | /refund              | Investor self-refund      |
| POST   | /release             | Issuer release funds      |
| POST   | /fail-offering       | Admin fail + bulk refund  |
| POST   | /emergency-refund    | Admin emergency refund    |
| POST   | /amend-offering      | Reset refund windows      |
| GET    | /vault/:addr         | Vault status              |
| GET    | /vault/:addr/history | Event history             |
| POST   | /time/advance        | Skip time (testing)       |
| POST   | /recharge            | Send test USDC            |

## Who Can Do What (Access Control)

| Action                | Who                     | Smart Contract Function                  |
| --------------------- | ----------------------- | ---------------------------------------- |
| Invest (deposit USDC) | **Investor** directly   | `deposit()` — msg.sender is investor     |
| Refund (48hr window)  | **Investor** directly   | `refund()` — msg.sender is investor      |
| Release funds         | **Issuer/Founder** only | `releaseFunds()` — onlyIssuer modifier   |
| Fail offering         | **Admin** only          | `failOffering()` — onlyOwner modifier    |
| Emergency refund      | **Admin** only          | `emergencyRefund()` — onlyOwner modifier |
| Amend offering        | **Admin** only          | `triggerAmendmentWindow()` — onlyOwner   |

## Compliance (NI 45-110)

Before investing, the system validates:

1. ✅ Form 45-110F1 (Offering Document) — investor confirmed reading
2. ✅ Form 45-110F2 (Risk Acknowledgement) — investor checked all risks
3. ✅ Subscription Agreement — investor signed
4. ✅ $2,500 per-investor cap — enforced on-chain
5. ✅ 48-hour refund window — enforced on-chain
6. ✅ 90-day offering deadline — enforced on-chain
7. ✅ $1,500,000 issuer 12-month limit — enforced in Laravel
8. ✅ One offering per issuer — enforced in Laravel
9. ✅ 8-year audit log — stored in database

## Going Live

See the full deployment guide in the analysis document.
Summary: Local → Polygon Amoy Testnet ($0) → Polygon Mainnet (~$30 + hosting)
