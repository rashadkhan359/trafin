# Parser support

TraFin parses **Indian banking SMS** in `Parser` (`src/sms-parser.js`). Parsing is **best-effort**, not guaranteed for every bank template.

---

## Pipeline overview

1. **Normalize** — Rs/₹/INR, whitespace
2. **Ignore** — OTP, offers, statements (hardcoded list)
3. **Legacy ordered patterns** — CC spend, CC payment, debited, credited
4. **Generic heuristics** — type scoring, entity regexes, bank detection
5. **Confidence** — webhook rejects if &lt; `0.5`

---

## Supported transaction types

| Type | Example signals |
|------|-----------------|
| `Debit` | debited, spent, paid, UPI payment, CC spend |
| `Credit` | credited, received, deposited |
| `CC_Payment` | credited to your … credit card |
| `Unknown` | Rejected at webhook |

---

## Bank detection

### Sender IDs (partial list)

| Sender pattern | Bank id |
|----------------|---------|
| HDFCBK | HDFC |
| ICICIB | ICICI |
| SBIBNK | SBI |
| KOTAKB | Kotak |
| AXISBK | Axis |
| BOI | BOI |
| IDFCFB | IDFC |
| YESBNK | Yes Bank |
| PNBSMS | PNB |
| CANBNK | Canara |
| UNIONB | Union Bank |
| PAYTMB | Paytm |

### SMS body (legacy / fallback)

| Pattern | Bank id |
|---------|---------|
| `-BOI` or word BOI | BOI |
| Kotak + credit card | `Kotak_CC_{last4}` |
| Kotak | Kotak |
| hdfc, icici, sbi, axis in text | respective names |

`Main.resolveAccountDisplayName` maps parser id → dropdown name from **Accounts** / **Accounts_CC**.

---

## UPI support

Entity extraction patterns include:

- `credited to … via`
- `paid to … on`
- `to … UPI`
- `UPI/merchant/…`
- `VPA …`
- `Info: UPI …`

Amount patterns look for `INR` after normalization, plus legacy `Rs.` / `₹` on raw SMS.

---

## Credit card support

| Scenario | Detection |
|----------|-----------|
| Card spend | `spent on` + `credit card` → Debit, merchant from `at … .` |
| Bill payment | `credited to your` + `credit card` → `CC_Payment` |
| Last 4 | `x1234` / `X1234` → `Kotak_CC_1234` style id |

Ensure **Accounts_CC** has matching card (`Card Name (...last4)`).

---

## Amount extraction

Patterns (normalized text):

- `INR 1,234.56`
- `debited/credited … INR …`
- `for INR …`
- Legacy raw: `Rs.`, `Rs:`, `₹`

---

## Ignored SMS (not stored)

Hardcoded phrases include: OTP, reward points, loan offers, minimum due, KYC, cashback offers, available credit limit, etc.

**Settings sheet** `IGNORE_KEYWORDS` exists in `Config.getIgnoreKeywords` but is **not yet wired** into `Parser.shouldIgnoreSms`—planned improvement.

---

## Unsupported or weak formats

| Format | Status |
|--------|--------|
| IMPS/NEFT/RTGS-only wording without debited/credited | Weak |
| Non-INR amounts | Unsupported |
| HDFC/ICICI CC last-4 mapping (non-Kotak CC id) | May show as generic bank name |
| Wallet-only SMS without bank name | May be `Unknown` bank |
| Multi-leg / combined SMS | Unreliable |
| `"cashback"` marketing as Credit | Possible misclassification |
| Amount without Rs/INR token | May fail amount extraction |

---

## Confidence scoring

| Signal | Weight |
|--------|--------|
| Type known | +0.2 |
| Amount found | +0.4 |
| Entity known | +0.2 |
| Bank known | +0.1 |
| Account fragment | +0.1 |
| CC_Payment | +0.1 bonus |

Webhook threshold: **0.5**.

---

## Categorization (separate from parser)

Webhook uses `Categories.getSmartCategory`:

1. `Settings_Mapping` keywords
2. `Settings_Rules` time/amount/day rules
3. Fallback `Misc`

`Parser.autoCategorize` is secondary fallback via `parsed.category`.

Special case: entity `CC Bill Payment` → category `CC Payment`.

---

## How to submit SMS samples

For parser improvements, provide:

1. **Raw SMS** (redact account numbers if public)
2. **Sender id**
3. **Expected:** type, amount, entity, bank
4. **What TraFin returned** (or `Unknown_SMS` row)

```text
Example template:
---
Sender: HDFCBK
SMS: INR 500.00 debited from A/c **1234 to SWIGGY on 01-05-26 UPI/123
Expected: Debit, 500, SWIGGY, HDFC Savings
Actual: ...
---
```

Do **not** include OTPs, full account numbers, or secrets.

---

## Testing a sample (developers)

```bash
curl -s -X POST "$WEBAPP_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"secret\": \"$SECRET\",
    \"message\": \"PASTE_SMS_HERE\",
    \"sender\": \"SENDER\",
    \"smsId\": \"sample-001\"
  }" | jq .
```

Check `parsed` object in response.

---

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md) — parser module
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution rules
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — ignored / low confidence
