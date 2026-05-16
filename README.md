# Trafin

Personal finance automation for **Indian banking SMS**, built on **Google Sheets** and **Google Apps Script**.

When your phone receives an Indian bank transaction SMS, **[MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)** on Android forwards it to your spreadsheet. TraFin parses the message, categorizes it, and appends a row to the correct monthly sheet—without manual copy-paste.

> **Recommended Android app:** [MacroDroid on Google Play](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid) — see [Setting up MacroDroid](docs/NON_TECHNICAL_SETUP.md#setting-up-macrodroid).

> **Privacy:** Your data stays in **your** Google account (Spreadsheet + Apps Script). You control who has access. Read [docs/SECURITY.md](docs/SECURITY.md) before going live.

---

## Features

- **SMS → Sheet pipeline** — Webhook receives SMS from Android, parses, stores
- **Indian bank parser** — UPI, debit/credit, credit card spend, CC bill payments, major banks
- **Smart categories** — Keyword mapping and time/amount rules from settings sheets
- **Monthly transaction tabs** — `Transactions_MMM_yyyy` with summary rows
- **Accounts & credit cards** — Balance formulas driven by transaction data
- **Recurring payments** — Match transactions to due items
- **Dashboard** — Budget, recurring status, account snapshots
- **Safe migrations** — Backups before schema changes; no bulk data deletion
- **Webhook secret** — Shared secret required (fail-closed if not configured)

---

## Screenshots

| Dashboard | Transaction sheet |
|-----------|-------------------|
| ![Dashboard placeholder](docs/images/placeholder-dashboard.png) | ![Transactions placeholder](docs/images/placeholder-transactions.png) |

| Settings & categories | MacroDroid HTTP Request setup |
|-----------------------|-------------------------------|
| ![Settings placeholder](docs/images/placeholder-settings.png) | ![MacroDroid placeholder](docs/images/macrodroid-http-request.png) |

_Add screenshots to `docs/images/` and replace paths when available._

---

## Architecture (summary)

```
MacroDroid (Android)  →  POST (JSON + secret)  →  doPost (entrypoints.js)
                                              →  Webhook.handle
                                              →  Parser.parseSms
                                              →  Categories.getSmartCategory
                                              →  Transactions.save → Google Sheet
```

All implementation code lives in `src/` as **namespace objects** (`Parser`, `Transactions`, `Sheet`, …). Global trigger names exist only in `src/entrypoints.js`.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Quick start

| Audience | Start here |
|----------|------------|
| **Non-technical users** (sheet, deploy, **MacroDroid**) | [docs/NON_TECHNICAL_SETUP.md](docs/NON_TECHNICAL_SETUP.md) |
| **Developers** (clasp, Git, deploy) | [docs/TECHNICAL_SETUP.md](docs/TECHNICAL_SETUP.md) |

After setup:

1. Open the spreadsheet → **TraFin** menu → **Re-run Initialization**
2. Set accounts in **Accounts** / **Accounts_CC**
3. Install [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid) and point it at your webhook URL + secret
4. Receive a test bank SMS (or run a MacroDroid test)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Google Apps Script (V8) |
| Storage | Google Sheets |
| Local dev | [clasp](https://github.com/google/clasp) |
| SMS ingress | MacroDroid HTTP POST → Apps Script web app |
| Auth | Script Property `WEBHOOK_SECRET` |

This is **not** Node.js. There are no `npm` runtime dependencies in production.

---

## Project layout

```
trafin/
├── appsscript.json      # Apps Script manifest (timezone, webapp access)
├── Code.js              # Legacy stub (active code in src/)
├── src/
│   ├── entrypoints.js   # doPost, onOpen, onEdit, menu targets
│   ├── webhook.js       # HTTP orchestration
│   ├── sms-parser.js    # Parser namespace
│   ├── transactions.js  # Save / duplicate check
│   ├── schema.js        # TxSchema column contract
│   ├── categories.js    # Smart categorization
│   ├── sheet.js         # Sheet setup & dropdowns
│   ├── settings-sync.js # Refresh dropdowns on settings edit
│   ├── config.js        # Config + defaults
│   ├── security.js      # Webhook secret validation
│   ├── main.js          # Init, balances, menu
│   ├── backup.js        # Backup & migration
│   ├── data-guard.js    # Header repair
│   ├── dashboard.js     # Dashboard builder
│   └── logging.js       # Unknown SMS log
└── docs/                # Documentation
```

---

## Documentation index

| Document | Purpose |
|----------|---------|
| [NON_TECHNICAL_SETUP.md](docs/NON_TECHNICAL_SETUP.md) | Step-by-step for spreadsheet + Android users |
| [TECHNICAL_SETUP.md](docs/TECHNICAL_SETUP.md) | clasp, Git, deploy, debug |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, flows, constraints |
| [SECURITY.md](docs/SECURITY.md) | Secrets, threat model, privacy |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures & fixes |
| [PARSER_SUPPORT.md](docs/PARSER_SUPPORT.md) | Supported SMS formats |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Code style & contribution rules |

---

## Disclaimer

- TraFin is a **personal automation tool**, not financial advice or a regulated banking product.
- SMS parsing is **best-effort**. Always verify important transactions against your bank app.
- You are responsible for securing your webhook URL and secret.
- Google Apps Script and Sheets have [usage quotas](https://developers.google.com/apps-script/guides/services/quotas).

---

## License

Specify your license here (e.g. MIT) if publishing publicly.
