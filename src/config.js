/************************************************************
 * RUNTIME CONFIG — all values read from Settings sheet at runtime.
 * Hardcoded values below are only used if Settings sheet doesn't exist yet
 * (e.g. very first run before initializeProject completes).
 ************************************************************/

const FALLBACK_TIMEZONE = "Asia/Kolkata";
const FALLBACK_CURRENCY = "INR";

const Config = {
    getTimezone(ss) {
        try {
            const s = (ss || SpreadsheetApp.getActiveSpreadsheet())
                .getSheetByName("Settings");
            if (!s) return FALLBACK_TIMEZONE;
            const data = s.getDataRange().getValues();
            for (let i = 1; i < data.length; i++) {
                if (data[i][0] === "SYSTEM" && data[i][1] === "Timezone") {
                    return data[i][2] || FALLBACK_TIMEZONE;
                }
            }
        } catch (e) { }
        return FALLBACK_TIMEZONE;
    },

    getIgnoreKeywords(ss) {
        try {
            const s = (ss || SpreadsheetApp.getActiveSpreadsheet())
                .getSheetByName("Settings");
            if (!s) return [];
            const data = s.getDataRange().getValues();
            return data
                .filter(row => row[0] === "IGNORE_KEYWORDS" && row[2])
                .map(row => row[2].toString().toLowerCase().trim());
        } catch (e) { }
        return [];
    },

    getAccountsList(ss) {
        const accounts = [];
        const accSheet = ss.getSheetByName("Accounts");
        if (accSheet && accSheet.getLastRow() > 1) {
            accSheet.getRange(2, 1, accSheet.getLastRow() - 1, 2).getValues()
                .forEach(([bank, type]) => {
                    if (!bank) return;
                    accounts.push({
                        displayName: `${bank} ${type}`,
                        parserId: bank
                    });
                });
        }
        const ccSheet = ss.getSheetByName("Accounts_CC");
        if (ccSheet && ccSheet.getLastRow() > 1) {
            ccSheet.getRange(2, 1, ccSheet.getLastRow() - 1, 3).getValues()
                .forEach(([bank, cardName, last4]) => {
                    if (!bank) return;
                    accounts.push({
                        displayName: `${cardName} (...${last4})`,
                        parserId: `${bank}_CC_${last4}`
                    });
                });
        }
        return accounts;
    }
};

/************************************************************
 * CONSTANTS — structural, never runtime-configurable
 * Transaction headers: see schema.js (TxSchema.HEADERS)
 ************************************************************/

const DEFAULT_CATEGORIES = [
    "Food", "Groceries", "Travel", "Fuel", "Transport",
    "Bills", "Electricity", "Water", "Internet", "Mobile Recharge",
    "EMI", "Rent", "Insurance", "Investment", "Savings",
    "Shopping", "Clothing", "Electronics", "Entertainment",
    "OTT Subscriptions", "Health", "Medical", "Education",
    "Dining Out", "Coffee", "Personal Care", "Gym",
    "CC Payment", "Transfer", "Income", "Misc"
];

/************************************************************
 * Default ignore keywords — seeded into Settings sheet on init.
 * After init, the sheet is the source of truth, not this array.
 ************************************************************/
const DEFAULT_IGNORE_KEYWORDS = [
    "is due on", "due date", "payment due", "minimum due",
    "registering", "register your", "recharge", "plan has expired",
    "not you? call", "never share", "t&c apply",
    "jio no.", "google gemini",
    "click here", "download", "subscribe",
    "reward points", "cashback offer", "win ", "you've won",
    "kyc", "update your", "verify your", "cred.club",
    "pre-approved", "loan offer", "credit score",
    "still spending", "link kotak", "earn pts", "earn points",
    "rewards?", "upi rupay", "apply:", "avl limit",
    "congratulations", "offer expires", "limited time",
    "expiry", "otp", "pin", "your account will"
];
