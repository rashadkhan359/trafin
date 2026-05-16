# Security

TraFin exposes a **public web app URL** so **[MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)** on your Android phone can POST bank SMS without Google Sign-In. Security relies on a **shared secret** and Google account boundaries—not on hiding the URL.

---

## Webhook secret system

### Storage

| Item | Location |
|------|----------|
| Secret value | Script Property `WEBHOOK_SECRET` |
| Set via | `Security.setWebhookSecret("...")` or Project Settings UI |
| Never | Hardcoded in source, committed to Git, or logged |

### Validation (`Security.validateWebhookSecret`)

1. If `WEBHOOK_SECRET` is **empty** → reject (`secret_not_configured`) — **fail closed**
2. Extract provided secret from:
   - POST JSON field `secret` (**recommended**)
   - Query parameter `?secret=` (optional fallback)
3. Compare with `Security.secureEquals` (best-effort constant-time)

### Client request format

```json
{
  "secret": "your-secret",
  "message": "full SMS text",
  "sender": "HDFCBK",
  "smsId": "unique-per-message"
}
```

### Responses

| `reason` | Meaning |
|----------|---------|
| `secret_not_configured` | Set `WEBHOOK_SECRET` in Script Properties |
| `missing_secret` | Request had no secret |
| `invalid_secret` | Wrong secret |
| `ok` | Proceed |

HTTP status is typically **200** even for errors (Apps Script limitation). Check JSON `status`: `unauthorized`.

---

## Threat model

### In scope

| Threat | Mitigation |
|--------|------------|
| Random internet POST to webhook | Secret required |
| Secret guessing | Use 20+ char random secret |
| Duplicate SMS replay (short window) | `smsId` + 6h cache |
| Secret in logs | `Security.redactRequestBody` before Unknown_SMS logging |

### Out of scope / residual risk

| Risk | Notes |
|------|-------|
| Secret leaked via URL query string | May appear in proxy logs; prefer POST body |
| Anyone with script edit access | Can read Script Properties |
| Anyone with spreadsheet access | Sees all financial data |
| Compromised Android phone / MacroDroid | Can send valid signed requests if secret is saved on device |
| Insider with deployment URL + secret | Full write access to transactions |
| DDoS / quota exhaustion | No built-in rate limit; see recommendations |
| SMS spoofing | Forwarder trusts device SMS; not bank cryptographic proof |

---

## Apps Script security limitations

| Limitation | Practical impact |
|------------|------------------|
| Public web app deployment | URL is discoverable in theory |
| No native rate limiting | Abuse can burn quotas |
| Cannot reliably read HTTP headers | Do not depend on header auth |
| Execute as deploying user | Script runs with **your** Sheet permissions |
| Google’s infrastructure | Data transits Google; subject to Google ToS |

TraFin is appropriate for **personal use** by a trusted operator—not for multi-tenant SaaS without major redesign.

---

## Privacy notes

| Data | Stored where |
|------|--------------|
| Full SMS text | `Raw SMS` column in **your** Google Sheet |
| Parsed fields | Transaction columns |
| Failed parses | `Unknown_SMS` sheet (if triggered) |
| Secret | Script Properties (not in sheet) |

### MacroDroid and your data

| Question | Answer |
|----------|--------|
| Where does my SMS go? | From your phone → **Google Apps Script** (your script) → **your** spreadsheet |
| Is there a TraFin company server? | **No** — this project is sheet + script in **your** Google account |
| What does MacroDroid store? | MacroDroid keeps macros on your phone; it does not host your transaction history |
| Who can read the sheet? | Anyone you share the Google Sheet with |
| Who can add rows? | Anyone with webhook URL **and** secret |

### Do not share publicly

- Treat the **webhook URL + secret** together like a password.  
- Do not post them in forums, screenshots, or group chats.  
- Prefer putting `secret` in the **JSON body**, not in the URL query string (fewer leak paths in logs).

**Recommendations:**

- Do not share the spreadsheet publicly.
- Use a dedicated Google account if isolating finance data.
- Install MacroDroid only from [official Google Play](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid).
- Grant MacroDroid **only** the permissions it needs (SMS + network for HTTP Request).
- Redact account numbers when sharing parser samples for support.
- Periodically review **Extensions → Apps Script → Executions** for unexpected runs.

---

## Recommendations for privacy-conscious users

1. **Dedicated Google account** for finance sheet only.
2. **Strong webhook secret** in a password manager.
3. **POST body secret**, not query string.
4. **Review spreadsheet sharing** (one person only).
5. **Disable** forwarding for non-bank SMS apps.
6. **Audit** `Unknown_SMS` and transaction tabs occasionally.
7. **Do not** publish webhook URL or secret in screenshots/repos.

### Self-hosting alternative (future)

A privacy-maximal architecture would parse SMS on-device or on a self-hosted server you control, then write to Sheets via API with OAuth—TraFin today does **not** implement this; it optimizes for simplicity on Apps Script.

---

## Rotating the secret

1. `Security.setWebhookSecret("new-secret")`
2. Update Android app JSON immediately
3. Old secret stops working instantly

Optional: `Security.clearWebhookSecret()` during maintenance (blocks all traffic until reset).

---

## Related

- [NON_TECHNICAL_SETUP.md](NON_TECHNICAL_SETUP.md) — step 6
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — unauthorized errors
