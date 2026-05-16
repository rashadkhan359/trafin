# Contributing

Thank you for improving TraFin. This project runs on **Google Apps Script**, not Node.js—contributions must respect runtime limits and data safety rules.

---

## Before you start

1. Read [ARCHITECTURE.md](ARCHITECTURE.md)
2. Read [TECHNICAL_SETUP.md](TECHNICAL_SETUP.md) for clasp workflow
3. Never commit `.clasp.json` or secrets
4. Test against a **copy** of a spreadsheet, not live production data

---

## Coding conventions

### Namespaces

| Do | Don't |
|----|-------|
| `const Parser = { parseSms() { … } }` | Loose `function parseSms` in random files |
| `Parser.normalizeSms()` inside Parser | `normalizeSms()` bare call inside Parser |
| `TxSchema.toRow()` for transaction rows | Manual 8-element arrays scattered |
| Globals only in `entrypoints.js` | `function doPost` in `webhook.js` |

### File responsibilities

| Module | Owns |
|--------|------|
| `entrypoints.js` | Trigger/menu/web app names only |
| `webhook.js` | HTTP orchestration |
| `transactions.js` | Persist rows, duplicates, monthly sheet |
| `sms-parser.js` | SMS only—no `SpreadsheetApp` |
| `schema.js` | Column contract |
| `sheet.js` | Structure, dropdowns, formatting |
| `settings-sync.js` | React to settings edits |
| `security.js` | Webhook auth |
| `backup.js` | Backup + migration |

### Style

- Match existing file style (semicolons, spacing)
- Small focused changes—no drive-by refactors
- Defensive null checks on sheet operations
- `Logger.log` for operational messages—not `Logger.error` (does not exist)

---

## Data safety rules (mandatory)

**Never:**

- Delete transaction data rows in bulk
- Delete user sheets in normal code paths
- Change `TxSchema.HEADERS` order without migration
- Use positional column index migrations without header map
- Hardcode secrets
- `clearContent` on transaction ranges without backup

**Always:**

- Use `TxSchema` for row shape
- Backup before migration (`Backup.backupAllTransactions`)
- Header-aware reads in migrations (`TxSchema.objectFromRow`)
- Incremental sheet setup (check before insert)

---

## Apps Script caveats

| Topic | Guidance |
|-------|----------|
| No imports | All files share global scope |
| Execution time | Avoid O(n) full-sheet loops on every SMS |
| `appendRow` | OK per transaction; batch for migrations when possible |
| Web app | Cannot rely on HTTP headers for auth |
| Deployments | Remind users to create **new version** after push |
| `getActiveSpreadsheet` | Container-bound script assumed |

---

## Parser contribution rules

1. **Normalization first** — fix Rs/INR before regex
2. **Ordered heuristics** — specific patterns before generic `debited`/`credited`
3. **No giant regex** — prefer layered checks
4. **Preserve schema** — output `type`, `amount`, `entity`, `bank`, `confidence`
5. **Add sample** — document in [PARSER_SUPPORT.md](PARSER_SUPPORT.md)
6. **CC / UPI** — test Kotak CC and UPI debit samples
7. **Do not** break `CC_Payment` SUMIFS in `Main.refreshCCBalances`

### Parser tests (recommended)

No automated suite in-repo yet. For PRs, include:

- Raw SMS input
- Expected JSON fields
- curl command used

Future: golden-file tests run outside Apps Script.

---

## Settings & dropdowns

When changing account or category sources:

- Update `Config.getAccountsList` or category sheets
- Ensure `SettingsSync` sheet list includes affected tabs
- Call `Sheet.reapplyAllDropdowns` path after structural changes

---

## Security changes

- Secrets only via `Security` + Script Properties
- Fail closed when secret missing
- Redact `secret` in logs (`Security.redactRequestBody`)
- Document threat model updates in [SECURITY.md](SECURITY.md)

---

## Pull request checklist

- [ ] `clasp push` succeeds locally
- [ ] Tested `doPost` with curl (authorized + unauthorized)
- [ ] No new global functions outside `entrypoints.js` (unless justified)
- [ ] Namespace-qualified internal calls
- [ ] Transaction rows use `TxSchema.toRow`
- [ ] No secrets in diff
- [ ] Updated docs if behavior changed
- [ ] Migration safe or explicitly N/A

---

## Commit messages

Use clear, imperative sentences:

```
Fix Kotak CC bank id when sender is KOTAKB
Add SettingsSync trigger for Budget sheet edits
Document webhook secret setup for Android users
```

---

## Questions

Open an issue with:

- Problem statement
- Sample SMS (redacted) for parser work
- Whether you can test on a copy sheet
