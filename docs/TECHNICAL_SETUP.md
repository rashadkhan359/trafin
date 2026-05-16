# Technical setup guide

For developers maintaining TraFin with **clasp**, **Git**, and the Apps Script editor.

---

## Prerequisites

- Node.js 18+ (for clasp only—not a runtime dependency of the script)
- Google account with access to the target spreadsheet
- [clasp](https://github.com/google/clasp) installed globally:

```bash
npm install -g @google/clasp
```

- Apps Script API enabled: https://script.google.com/home/usersettings → **Google Apps Script API** → On

---

## One-time clasp login

```bash
clasp login
```

Follow the browser flow. Verify:

```bash
clasp --version
```

---

## Link this repository to an Apps Script project

### Option A — Existing script project (spreadsheet-bound)

1. Open the spreadsheet → **Extensions → Apps Script**.
2. **Project Settings** → copy **Script ID**.
3. In this repo root, create `.clasp.json` (gitignored):

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

4. Pull remote files (optional, first time):

```bash
cd /path/to/trafin
clasp pull
```

Resolve conflicts carefully—prefer `src/` as source of truth.

### Option B — New script from repo

```bash
cd /path/to/trafin
clasp create --type sheets --title "TraFin" --rootDir .
```

Update `.clasp.json` with the new `scriptId`.

---

## Local project layout

| Path | Role |
|------|------|
| `appsscript.json` | Manifest (timezone, webapp, V8) |
| `src/entrypoints.js` | **Only** global functions for triggers/web app |
| `src/*.js` | Namespace modules merged into global scope |
| `Code.js` | Legacy stub—keep minimal |

**Do not** add `import`/`export`. Apps Script merges all `.js`/`.gs` files into one global scope.

---

## Push code to Apps Script

```bash
cd /path/to/trafin
clasp push
```

If prompted about file order, confirm overwrite of remote.

### Watch mode (optional)

```bash
clasp push --watch
```

---

## Deploy web app

After `clasp push`, create or update deployment in the Apps Script UI:

1. **Deploy → Manage deployments**
2. **Edit** existing web app → **Version → New version** → **Deploy**

Or CLI:

```bash
clasp deploy --description "TraFin webhook v1"
```

Copy the `/exec` URL for Android configuration.

> Pushing code does **not** automatically update an existing deployment version. Always bump deployment version after push.

---

## Set webhook secret (required)

In Apps Script editor, run once:

```javascript
function setupWebhookSecretOnce() {
  Security.setWebhookSecret("generate-a-long-random-secret");
}
```

Or set **Project Settings → Script properties**:

| Property | Value |
|----------|-------|
| `WEBHOOK_SECRET` | your secret |

Verify fail-closed:

```bash
curl -X POST "$WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

Expect: `{"status":"unauthorized","reason":"secret_not_configured"}` or `missing_secret`.

---

## Recommended development workflow

```
1. Edit files in src/
2. clasp push
3. New deployment version (if webhook/trigger behavior changed)
4. Test with curl or Android
5. Check Executions log in Apps Script
6. git commit (do not commit .clasp.json)
```

### Git workflow

`.gitignore` excludes:

- `node_modules/`
- `.clasp.json` (contains scriptId—per-developer)

Commit `src/`, `appsscript.json`, `docs/`, `README.md`.

```bash
git status
git add src/ appsscript.json docs/ README.md
git commit -m "Describe change"
git push origin main
```

---

## Architecture conventions

| Rule | Detail |
|------|--------|
| **Entrypoints** | Global `function doPost` only in `src/entrypoints.js` |
| **Namespaces** | `const Parser = { ... }`, call as `Parser.parseSms()` |
| **No bare internal calls** | Use `Sheet.applyX`, not `applyX` inside `Sheet` |
| **Schema** | All transaction rows via `TxSchema.toRow()` |
| **Config** | Runtime values via `Config.getTimezone(ss)` etc. |
| **Secrets** | `Security` + Script Properties only |

See [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Debugging Apps Script

| Tool | Use |
|------|-----|
| **Executions** | Apps Script → left sidebar → clock icon |
| **Logger.log** | View → Logs (editor) or execution details |
| **Debugger** | Breakpoints in editor (limited) |
| **curl** | Reproduce webhook without phone |
| **Unknown_SMS sheet** | Low-confidence / failed parse samples |

### Test webhook locally

```bash
export WEBAPP_URL="https://script.google.com/macros/s/.../exec"
export SECRET="your-secret"

curl -s -X POST "$WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"secret\": \"$SECRET\",
    \"message\": \"INR 500.00 debited from A/c XX1234 to ZOMATO via UPI Ref 123\",
    \"sender\": \"HDFCBK\",
    \"smsId\": \"dev-$(date +%s)\"
  }" | jq .
```

### Run functions from editor

| Function | Purpose |
|----------|---------|
| `initializeProject` | Sheet setup + migration |
| `syncSettingsAndDropdowns` | Refresh validation rules |
| `updateGlobalDashboard` | Rebuild dashboard |

---

## Installable triggers (optional)

Simple triggers `onOpen` / `onEdit` in `entrypoints.js` run automatically when bound to the spreadsheet.

For **monthly recurring reset**, add installable trigger:

1. Apps Script → **Triggers** (clock)
2. **Add trigger**
3. Function: `autoMonthlyReset`
4. Event: Time-driven → Month timer → Day 1

---

## Spreadsheet binding

This project expects a **container-bound** script (opened from Extensions → Apps Script on the sheet). `SpreadsheetApp.getActiveSpreadsheet()` is used throughout.

Standalone scripts would require refactoring to `openById()`.

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY.md](SECURITY.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
