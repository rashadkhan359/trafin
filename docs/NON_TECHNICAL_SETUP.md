# Non-technical setup guide

This guide is for **everyday users** who want TraFin running without learning programming. You will use:

- A **Google Sheet** (your finance workbook)
- **Google Apps Script** (automation behind the sheet—like macros in the cloud)
- **[MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)** on the phone that receives bank SMS

You do **not** need GitHub unless a developer helps you. You do **not** need to install Node.js or write code.

---

## What you are building

```
Bank SMS on phone  →  MacroDroid  →  TraFin webhook  →  Google Sheet row
```

**Webhook** here simply means a special web address (URL) your sheet accepts so MacroDroid can send each SMS to it—like posting a letter through a fixed mailbox slot.

Each transaction becomes one row in a monthly tab (e.g. `Transactions_May_2026`).

---

## Before you start

You need:

- A **Google account**
- An **Android phone** that receives bank SMS on the device (not only on a linked tablet)
- Permission to install MacroDroid and allow **SMS** access (see [Setting up MacroDroid](#setting-up-macrodroid) — after steps 1–6)
- About **15–20 minutes** after your sheet and webhook URL are ready (first-time Google authorization may add a few minutes)

---

## Step 1 — Create or open your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com).
2. Create a **new spreadsheet** or open one your developer shared.
3. Name it something clear, e.g. `My TraFin`.
4. Bookmark the sheet URL.

> **Screenshot placeholder:** New empty Google Sheet  
> `docs/images/setup-01-new-sheet.png`

---

## Step 2 — Open Apps Script (the code editor)

1. In the spreadsheet menu: **Extensions → Apps Script**.
2. A new browser tab opens (script.google.com).
3. You may see files like `entrypoints.gs`, `webhook.gs`, etc.—that is normal if code was already deployed.

If the project is **empty**, a developer must push code first ([TECHNICAL_SETUP.md](TECHNICAL_SETUP.md)) or share a copy of a working script project.

> **Screenshot placeholder:** Extensions → Apps Script menu  
> `docs/images/setup-02-extensions-menu.png`

---

## Step 3 — Run first-time initialization

1. In Apps Script, open the file list and find **`entrypoints`** (or `entrypoints.js`).
2. At the top, confirm functions exist like `initializeProject`.
3. In the toolbar, choose function **`initializeProject`** from the dropdown.
4. Click **Run** ▶.
5. Google will ask to **authorize** the script:
   - Click **Review permissions**
   - Choose your account
   - Click **Advanced** → **Go to … (unsafe)** if shown (your own script)
   - Allow access to spreadsheets
6. Switch back to the **spreadsheet** tab.
7. You should see a popup: **TraFin v3 Initialized!**

This creates sheets such as:

- `Settings`, `Settings_Categories`, `Accounts`, `Accounts_CC`
- `Settings_Mapping`, `Settings_Recurring`, `Budget`, `Dashboard`

> **Screenshot placeholder:** Run initializeProject + authorization  
> `docs/images/setup-03-run-init.png`

### If no popup appears

- Refresh the spreadsheet.
- Open menu **TraFin → Re-run Initialization** (appears after first successful `onOpen`).

---

## Step 4 — Configure your accounts

### Bank accounts (`Accounts` sheet)

| Bank | Account Type | Initial Balance |
|------|--------------|-----------------|
| Kotak | Savings | your starting balance |
| BOI | Savings | … |

- **Bank** + **Account Type** form the name used in transactions (e.g. `Kotak Savings`).

### Credit cards (`Accounts_CC` sheet)

| Bank | Card Name | Last 4 Digits | Credit Limit |
|------|-----------|---------------|--------------|
| Kotak | Kotak Credit | 6971 | 100000 |

After editing, dropdowns and balance formulas refresh automatically.

> **Screenshot placeholder:** Accounts sheet filled in  
> `docs/images/setup-04-accounts.png`

---

## Step 5 — Deploy the web app (webhook URL)

MacroDroid needs your **webhook URL** to send each SMS to TraFin.

1. In Apps Script: **Deploy → New deployment**.
2. Click the gear ⚙ next to **Select type** → choose **Web app**.
3. Settings:
   - **Description:** `TraFin webhook`
   - **Execute as:** **Me** (your account)
   - **Who has access:** **Anyone** (required for anonymous POST from phone; secured by secret in step 6)
4. Click **Deploy**.
5. **Authorize** again if prompted.
6. Copy the **Web app URL** (ends with `/exec`).

> **Important:** After code changes, use **Deploy → Manage deployments → Edit → Version → New version** so the live URL uses updated code. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

> **Screenshot placeholder:** Web app deployment dialog  
> `docs/images/setup-05-deploy-webapp.png`

---

## Step 6 — Set the webhook secret

Without a secret, TraFin **rejects** all webhook calls (by design).

1. In Apps Script, open **`security`** (or `security.js`).
2. Open **Run** and select nothing—you will run from the console.
3. Go to menu **View → Execution log** (for messages).
4. In the editor, temporarily add a **one-time runner** or use the console:

   - Select function: create a small runner in `entrypoints` is not needed—run from Apps Script:

   **Method A — Run in editor**

   1. At the bottom, open the **Execution log** tab.
   2. In any `.gs` file, paste once at the bottom (remove after):

   ```javascript
   function setupMySecret() {
     Security.setWebhookSecret("paste-a-long-random-password-here");
   }
   ```

   3. Run `setupMySecret` once.
   4. Delete that function after success.

   **Method B — Script properties UI**

   1. Apps Script → **Project Settings** (gear icon).
   2. **Script properties** → Add property:
      - Property: `WEBHOOK_SECRET`
      - Value: your long random secret
   3. Save.

5. **Write the secret down** in a password manager—you will need it in MacroDroid.

Use a long random string (20+ characters). Example format only:

```
fK9mQ2pL8vN4xR7wT1yZ6aB3cD0eH5j
```

> Do **not** share this secret in chat, email, or screenshots.

---

## Setting up MacroDroid

TraFin does **not** read SMS on its own. We officially recommend **[MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)**—an Android automation app that sends each bank SMS to your TraFin webhook URL.

### Why MacroDroid?

| Benefit | What it means for you |
|---------|------------------------|
| **Reliable** | Widely used for SMS → web automations |
| **Flexible** | Filter by sender or keywords (HDFC, UPI, “debited”, etc.) |
| **Maintained** | Active app on [Google Play](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid) |
| **No custom app** | You do not need to build or sideload a special TraFin Android app |

MacroDroid offers free macros with limits; the **HTTP Request** action may require **MacroDroid Pro** or an in-app upgrade depending on your version. Check the Play Store listing before you start.

---

### What is a “webhook” in plain English?

Your **web app URL** from step 5 is the address MacroDroid calls after each bank SMS. MacroDroid sends a short JSON message (text package) that includes your **secret** and the **SMS text**. TraFin checks the secret, then adds one row to your sheet.

---

### A) Install MacroDroid

1. On your **Android phone** (the one that receives bank SMS), open Google Play.
2. Install **[MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)**.
3. Open the app and complete the intro if shown.

> **Screenshot placeholder:** MacroDroid on Play Store / first open  
> `docs/images/macrodroid-install.png`

---

### B) Permissions (only what you need)

MacroDroid will ask for permissions when you add an **SMS Received** trigger. Allow:

| Permission | Why |
|------------|-----|
| **SMS** (receive/read) | So MacroDroid can see incoming bank SMS |
| **Internet** | So MacroDroid can call your webhook URL |

You do **not** need to give TraFin or MacroDroid your bank login password.

**Battery / background (important):** If macros stop after a while, Android may be putting MacroDroid to sleep.

1. Android **Settings → Apps → MacroDroid**
2. **Battery** → set to **Unrestricted** / **Don’t optimize** (wording varies by phone brand)
3. Allow **background activity** if your phone (Samsung, Xiaomi, etc.) offers that option

> **Screenshot placeholder:** Battery optimization off for MacroDroid  
> `docs/images/macrodroid-battery.png`

---

### C) Create a new Macro

1. In MacroDroid, tap **Add Macro** (or the **+** button).
2. Give it a name, e.g. `TraFin Bank SMS`.
3. Leave the macro **enabled** (toggle on).

---

### D) Add trigger — SMS Received

1. Tap **Triggers** → **Add Trigger**.
2. Choose **SMS Received** (under Phone/SMS category).
3. Optional but recommended for Indian banks:
   - **Sender contains** — add bank sender ids if you know them (e.g. `HDFCBK`, `ICICIB`, `KOTAKB`), **or**
   - Leave sender blank and use **Content** contains any of: `debited`, `credited`, `INR`, `Rs.`, `UPI`  
   (This reduces forwarding OTP and marketing SMS.)
4. Save the trigger.

MacroDroid will offer variables for this trigger, including:

- `{sms_message}` — full SMS text  
- `{sms_number}` — sender number  
- `{sms_name}` — contact name (if saved)

> **Screenshot placeholder:** SMS Received trigger  
> `docs/images/macrodroid-trigger-sms.png`

---

### E) Add action — HTTP Request

1. Tap **Actions** → **Add Action**.
2. Search for **HTTP Request** and select it.  
   If you do not see it, update MacroDroid from Play Store or check whether your plan includes HTTP Request.
3. Configure:

| Setting | Value |
|---------|--------|
| **URL** | Your web app URL from step 5 (`https://script.google.com/macros/s/.../exec`) |
| **Request method** | **POST** |
| **Content type** (body) | **application/json** |

4. In **Content Body** (or “Body”), paste the JSON below (see next section).
5. Save the action.

> **Screenshot placeholder:** HTTP Request action fields  
> `docs/images/macrodroid-http-request.png`

---

### F) JSON body and secret

**Minimum example** (secret + SMS text):

```json
{
  "secret": "YOUR_WEBHOOK_SECRET_FROM_STEP_6",
  "message": "{sms_message}"
}
```

**Recommended example** (better bank detection and fewer duplicates):

```json
{
  "secret": "YOUR_WEBHOOK_SECRET_FROM_STEP_6",
  "message": "{sms_message}",
  "sender": "{sms_number}",
  "smsId": "{sms_number}-{sms_date}"
}
```

Replace `YOUR_WEBHOOK_SECRET_FROM_STEP_6` with the real secret from step 6.  
Do **not** leave the word `YOUR_WEBHOOK_SECRET` in place.

---

### G) Insert the SMS text dynamically (important)

Do **not** type the SMS by hand. Use MacroDroid **magic text** so `{sms_message}` is filled in when the SMS arrives.

1. In the **HTTP Request** action, tap the **Content Body** field.
2. Tap the **magic text** button (often `{...}` or a wand icon on the keyboard bar).
3. Choose the **SMS Received** trigger variables.
4. Tap **sms_message** (may show as `{sms_message}`).
5. MacroDroid inserts it into your JSON where the cursor was.  
   Your line should look like: `"message": "{sms_message}"`  
   (MacroDroid also accepts `[sms_message]` in many versions; `{sms_message}` is preferred.)

Repeat for `{sms_number}` and `{sms_date}` if you use the recommended JSON.

> **Screenshot placeholder:** Magic text picker for sms_message  
> `docs/images/macrodroid-magic-text.png`

---

### H) Save and test the Macro

1. Tap **Save** / confirm the macro (checkmark).
2. Ensure the macro is **enabled**.
3. Use MacroDroid’s **Test** option on the macro if available, **or** wait for a real bank SMS.
4. In Google Apps Script: **Executions** (clock icon) — you should see a recent `doPost` run after a forward.

> **Screenshot placeholder:** Successful test / new sheet row  
> `docs/images/macrodroid-test-success.png`

---

### Privacy note (MacroDroid → Google only)

- SMS text is sent from **your phone** directly to **your** Google Apps Script URL.
- TraFin does **not** use a separate company server between MacroDroid and your sheet.
- You control the **secret**; do not post your webhook URL or secret on social media.  
  More: [SECURITY.md](SECURITY.md).

MacroDroid-specific problems: [TROUBLESHOOTING.md#macrodroid](TROUBLESHOOTING.md#macrodroid).

---

## Step 7 — Test your first transaction

### Option A — Real bank SMS

Trigger a small UPI/bank SMS and wait a few seconds. Check the current month sheet (e.g. `Transactions_May_2026`).

### Option B — Manual test (with help or curl)

A technical friend can run:

```bash
curl -X POST "YOUR_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "YOUR_SECRET",
    "message": "Rs.10.00 debited from A/c XX1234 to SWIGGY on 01-05-26 UPI",
    "sender": "HDFCBK",
    "smsId": "test-001"
  }'
```

Expected response:

```json
{"status":"success","parsed":{...}}
```

### Success checklist

- [ ] New row in `Transactions_*` sheet
- [ ] Category and Bank columns show **dropdowns**
- [ ] **Accounts** sheet “Current Balance” updates (may take a refresh)

### If something fails

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Step 8 — Use the TraFin menu

In the spreadsheet, refresh the page. Menu **TraFin**:

| Menu item | What it does |
|-----------|----------------|
| Update Dashboard | Rebuilds `Dashboard` sheet |
| Format Current Sheet | Colors debit/credit rows |
| Sync Dropdowns & Balances | Refreshes lists after bulk edits |
| Refresh Account Balances | Updates SUMIFS formulas |
| Re-run Initialization | Safe repair of sheet structure |

---

## Security & privacy

| Topic | Explanation |
|-------|-------------|
| **Where is my data?** | In your Google Sheet, in your account. |
| **Who can read it?** | Anyone you share the spreadsheet with. |
| **Who can add transactions?** | Anyone with the webhook URL **and** your secret. |
| **Is the URL public?** | The deployment is “Anyone” so MacroDroid can POST without Google login. The **secret** blocks strangers. |
| **Does MacroDroid see my sheet?** | No—only sends SMS to your URL. Data lands in **your** Google account. |
| **Third-party servers?** | SMS goes to Google Apps Script / your Sheet—not a separate TraFin hosting company. |
| **Raw SMS stored?** | Yes, in the “Raw SMS” column for debugging and re-parsing. |
| **Bank passwords?** | Never put passwords in TraFin. Only SMS text is used. |
| **Share webhook URL?** | Do not share publicly; treat it like a password together with your secret. |

More detail: [SECURITY.md](SECURITY.md).

---

## Common mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| Forgot to set `WEBHOOK_SECRET` | `unauthorized` / `secret_not_configured` | Step 6 |
| Wrong secret in MacroDroid JSON | `invalid_secret` | Copy again carefully |
| Old deployment after code update | Odd bugs, old behavior | New deployment version |
| SMS on SIM, MacroDroid on another device | No forwards | Install MacroDroid on the SMS phone |
| MacroDroid battery optimized | Macro stops silently | Unrestricted battery for MacroDroid |
| `{sms_message}` typed literally | Empty/wrong message | Use magic text picker |
| Editing sheet but not Accounts | Bank dropdown outdated | Edit Accounts or **Sync Dropdowns** |
| Expecting instant dashboard | Dashboard is manual/triggered | **TraFin → Update Dashboard** |

---

## Getting help from a developer

Share:

1. Whether setup failed at sheet, deploy, or Android step
2. The **JSON response** from a test (not your secret)
3. One **sample bank SMS** (redact account numbers if posting publicly)
4. Execution log excerpt from Apps Script (View → Executions)

Technical setup: [TECHNICAL_SETUP.md](TECHNICAL_SETUP.md).
