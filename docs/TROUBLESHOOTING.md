# Troubleshooting

Symptoms → causes → fixes for TraFin on Google Apps Script.

---

## Webhook returns `unauthorized`

### `secret_not_configured`

**Cause:** `WEBHOOK_SECRET` not set in Script Properties.

**Fix:**

```javascript
Security.setWebhookSecret("your-long-random-secret");
```

Or Project Settings → Script properties → add `WEBHOOK_SECRET`.

---

### `missing_secret`

**Cause:** MacroDroid HTTP Request POST without `secret` field in JSON body.

**Fix:** Add to Content Body in MacroDroid:

```json
"secret": "YOUR_SECRET"
```

---

### `invalid_secret`

**Cause:** Mismatch between Script Property and MacroDroid JSON body.

**Fix:** Re-copy secret into MacroDroid; no trailing spaces; redeploy not required for secret-only changes.

---

## Webhook returns `duplicate`

**Cause:** The same SMS (same `smsId` + sender + text) was sent again within 6 hours, or the identical text arrived twice within 15 minutes (banks sometimes deliver one SMS from two sender ids).

**Fix:** Normal — nothing to do. Different SMS can no longer block each other, even if the forwarder sends a fixed `smsId`.

### Most transactions missing (old versions)

Before the duplicate check included the SMS text, a non-unique `smsId` (e.g. a typed `[trigger_guid]`) let only about one SMS through every 6 hours. Symptoms: a fraction of your SMS in the sheet, and `[sms_sender]` in the Sender column of `Unknown_SMS`. Deploy the current code and fix the macro body — see [NON_TECHNICAL_SETUP.md](NON_TECHNICAL_SETUP.md#f-json-body-and-secret).

---

## Webhook returns `ignored`

| `reason` | Meaning |
|----------|---------|
| `unable to parse` | Empty message or parser returned null |
| `low confidence` | Score &lt; 0.5 — logged to `Unknown_SMS` |
| `missing critical fields` | No amount or type Unknown |
| `Ignored keyword` | Marketing/OTP phrase matched |

**Fix:** See [PARSER_SUPPORT.md](PARSER_SUPPORT.md); add mapping rules; adjust ignore keywords in `Settings` (parser integration pending for sheet keywords).

---

## No row appears in sheet

| Check | Action |
|-------|--------|
| Wrong month tab | Open `Transactions_MMM_yyyy` for current month |
| Execution failed | Apps Script → Executions → failed `doPost` |
| Authorization | Re-run and accept permissions |
| Script not deployed | New deployment version after `clasp push` |

---

## Category / Bank columns not dropdowns

**Cause:** `appendRow` does not copy validation; legacy sheets may lack rules.

**Fix:**

1. Spreadsheet → **TraFin → Sync Dropdowns & Balances**
2. Or edit any cell on **Accounts** / **Settings_Categories** (triggers `onEdit`)
3. New rows get dropdowns via `Transactions.append` → `ensureTransactionDropdowns`

---

## Bank in Labels column / Raw SMS in Bank column

**Cause:** Old 7-column writes against 8-column headers (pre-`Labels` migration).

**Fix:** Run one-time repair in Apps Script editor (if function still available) or contact maintainer. New `src/` writes use `TxSchema.toRow` with 8 columns correctly.

---

## clasp issues

### `Insufficient Permission` / API disabled

Enable **Google Apps Script API**: https://script.google.com/home/usersettings

### `Script function not found`

Push code: `clasp push`. Confirm `entrypoints.js` exists remotely.

### `No .clasp.json`

Create from [TECHNICAL_SETUP.md](TECHNICAL_SETUP.md). Do not commit (gitignored).

### Push conflicts

```bash
clasp pull
# merge carefully—keep src/ as truth
clasp push
```

---

## Deployment not updating

**Symptom:** Code changed but webhook behaves old way.

**Cause:** `clasp push` updates project source; **web app deployment** pins a version.

**Fix:**

1. Apps Script → **Deploy → Manage deployments**
2. Edit → **Version → New version** → Deploy
3. URL stays same; behavior updates

---

## `onOpen` menu missing

**Cause:** Simple trigger not registered or sheet opened before first auth.

**Fix:** Refresh sheet; run `onOpen` once from editor; check **TraFin** menu.

---

## Balance formulas wrong

**Fix:**

1. **TraFin → Refresh Account Balances** / **Refresh CC Balances**
2. Confirm **Bank** column matches `Accounts` display names exactly (e.g. `Kotak Savings`)
3. Edit **Accounts** row to trigger `SettingsSync`
4. If the numbers still differ from your bank app, run **TraFin → Reconcile Balances** and enter the real figures. Banks do not send an alert for every transaction, so some drift is expected; the **Balance Check** column shows when it started.

---

## Bank cell shows "invalid" / dropdown lists an old card

**Cause:** The dropdown list was built before you renamed an account or changed a card's last 4 digits.

**Fix:** **TraFin → Sync Dropdowns & Balances**, then **TraFin → Clean Up Transactions** to relabel old rows.

---

## Promotions or reminders saved as transactions

**Fix:** Deploy the current code, then **TraFin → Clean Up Transactions**. Junk rows are moved to `Removed_SMS`. If a new kind of promo still gets through, add its distinctive phrase to `hardIgnore` in `src/sms-parser.js` and a case to `scripts/test-parser-samples.js`.

---

## Entity shows "Unknown"

Run **TraFin → Clean Up Transactions** — it re-reads the Raw SMS with the current rules. Rows stay Unknown only when the SMS itself has no name. UPI ids that are just a phone number are kept in full (e.g. `9876543210@axl`) so you can map them in `Settings_Mapping`.

---

## A payment has no row at all

1. Check the phone's Messages app: did a bank SMS arrive? If not, the bank did not send one.
2. Check `Notification_Log`: did an app notification arrive, and what was the result?
3. If neither exists, add the row by hand and/or run **Reconcile Balances**.

---

## Notification macro does nothing

| Check | Fix |
|-------|-----|
| `Notification_Log` tab never appears | MacroDroid lacks **Notification access**, or the macro is disabled |
| Rows say `ignored: not a payment` for a real payment | The wording is not recognised yet — copy the Title/Text from `Notification_Log` into an issue or extend `Parser.parseNotification` |
| `unauthorized` in MacroDroid's log | Body must be `{"secret":"..."}` with the correct secret |

---

## Duplicate transactions (different smsId)

**Cause:** Forwarder retries with new ids.

**Mitigation:** Identical SMS text within 15 minutes is skipped automatically. Older duplicates: **TraFin → Clean Up Transactions**.

---

## Parser misses transaction

1. Check `Unknown_SMS` sheet
2. Read [PARSER_SUPPORT.md](PARSER_SUPPORT.md)
3. Submit sample SMS for parser improvement

---

## MacroDroid {#macrodroid}

Official Android setup: [NON_TECHNICAL_SETUP.md#setting-up-macrodroid](NON_TECHNICAL_SETUP.md#setting-up-macrodroid).

### Macro does not trigger

| Check | Fix |
|-------|-----|
| Macro disabled | Toggle macro **on** in MacroDroid list |
| SMS permission denied | Android Settings → Apps → MacroDroid → Permissions → **SMS** allowed |
| Wrong phone | MacroDroid must be on the phone that **receives** the SIM’s bank SMS |
| Filter too strict | Widen trigger (remove sender filter; use `debited` OR `credited` OR `INR` in content) |
| Test with real SMS | Marketing SMS may not match—use a real debit/credit SMS once |

### Battery optimization kills MacroDroid

**Symptom:** Worked once, then nothing.

**Fix:**

1. **Settings → Apps → MacroDroid → Battery** → **Unrestricted** / Don’t optimize  
2. Disable “pause unused apps” style features on Xiaomi/Samsung/OnePlus  
3. Keep MacroDroid off “sleeping apps” lists  

### SMS permission denied

**Symptom:** MacroDroid cannot read SMS.

**Fix:** Android **Settings → Apps → MacroDroid → Permissions** → allow **SMS**. On Android 13+, you may need **Receive SMS** and **Read SMS**.

### Webhook unauthorized (MacroDroid)

See [Webhook returns `unauthorized`](#webhook-returns-unauthorized) above. Most common: secret not set in Apps Script, or typo in MacroDroid JSON `secret` field.

### Invalid JSON / parse errors

**Symptom:** `invalid JSON body` or MacroDroid shows HTTP error.

**Fix:**

1. Content type must be **application/json**
2. Use straight double quotes `"` in JSON (not “smart quotes”)
3. Do not add a trailing comma after the last field  
4. Use magic text `{sms_message}`—do not paste a real SMS inside quotes manually for production  
5. Test with minimal body first:

```json
{
  "secret": "YOUR_SECRET",
  "message": "{sms_message}"
}
```

### HTTP Request action missing

**Cause:** Older MacroDroid build or free-tier limits.

**Fix:** Update from [Google Play](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid). Check whether **HTTP Request** requires MacroDroid Pro on your device.

### MacroDroid shows success but no sheet row

1. Check Apps Script **Executions** for `doPost` errors  
2. Response may be `ignored` or `unauthorized`—read JSON in execution log  
3. Confirm **new deployment version** after script updates  
4. Open correct month tab `Transactions_MMM_yyyy`  

### Duplicate `smsId` during testing

MacroDroid's **Test** button sends the variables unfilled, so repeated tests carry identical text and are treated as duplicates. Test with a real SMS, or with curl using different message text. See [Webhook returns `duplicate`](#webhook-returns-duplicate).

---

## Android / MacroDroid quick checklist

| Symptom | Fix |
|---------|-----|
| No forwards | SMS permission; battery unrestricted; macro enabled |
| Wrong phone | MacroDroid on SIM that receives bank SMS |
| JSON errors | Content-Type `application/json`; valid JSON braces |
| HTTPS only | Use full `https://` deployment URL |
| Literal `{sms_message}` in sheet | You forgot magic text—SMS body was not substituted |

---

## curl testing

### Success path

```bash
WEBAPP_URL="https://script.google.com/macros/s/XXX/exec"
SECRET="your-secret"

curl -s -X POST "$WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"secret\": \"$SECRET\",
    \"message\": \"INR 100.00 debited from A/c XX1234 to MERCHANT via UPI\",
    \"sender\": \"HDFCBK\",
    \"smsId\": \"curl-test-$(date +%s)\"
  }"
```

### Expect unauthorized (no secret)

```bash
curl -s -X POST "$WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

### Credit card spend sample

```bash
curl -s -X POST "$WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"secret\": \"$SECRET\",
    \"message\": \"INR 500 spent on Kotak Credit Card x6971 at AMAZON.\",
    \"sender\": \"KOTAKB\",
    \"smsId\": \"cc-test-1\"
  }"
```

---

## Viewing logs

1. Apps Script → **Executions** (clock icon)
2. Click failed `doPost` → stack trace
3. Editor → **View → Logs** when running functions manually

---

## Still stuck?

Gather:

- JSON response body (redact secret)
- One sample SMS (redact account numbers)
- Execution log timestamp
- Deployment version date

Open an issue or contact your developer with the above.
