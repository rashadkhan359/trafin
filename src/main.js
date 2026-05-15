/************************************************************
 * FINTRACK v3
 ************************************************************
 * DATA GUARD PROMISE: This script NEVER deletes sheets, NEVER removes data rows,
 * NEVER overwrites user-entered values except in formula-driven columns
 * (Accounts col D, Accounts_CC cols F+G). All structural changes are incremental.
 * Safe to re-run initializeProject() at any time.
 ************************************************************/

/************************************************************
 * INITIALIZATION
 ************************************************************/
function initializeProject() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // DataGuard always runs first
  DataGuard.runAll(ss);

  // Settings sheet must be set up before anything else reads timezone/keywords
  Sheet.setupSettingsSheet(ss);
  Sheet.setupCategoriesSheet(ss);
  Sheet.setupMappingSheet(ss);
  Sheet.setupRulesSheet(ss);
  Sheet.setupRecurringSheet(ss);
  Sheet.setupAccountsSheet(ss);
  Sheet.setupAccountsCCSheet(ss);
  Sheet.setupBudgetSheet(ss);
  Sheet.setupDashboardSheet(ss);

  migrateExistingTransactions(ss);
  refreshAccountBalances();
  refreshCCBalances();

  _alert(
    "✅ FinTrack v3 Initialized!\n\n" +
    "All sheets verified. Existing data preserved.\n\n" +
    "Next steps:\n" +
    "1. Set your timezone in Settings sheet (Section=SYSTEM, Key=Timezone)\n" +
    "2. Set Initial Balances in Accounts\n" +
    "3. Add Credit Card limits in Accounts_CC\n" +
    "4. Add recurring payments in Settings_Recurring\n" +
    "5. Add/remove ignore keywords in Settings sheet (Section=IGNORE_KEYWORDS)\n\n" +
    "Check View → Logs for migration details."
  );
}

/************************************************************
 * ACCOUNT HELPERS
 ************************************************************/

function _resolveAccountDisplayName(ss, parserId) {
    const match = getAccountsList(ss).find(a => a.parserId === parserId);
    return match ? match.displayName : "Other";
}

/************************************************************
 * BALANCE REFRESH
 ************************************************************/

function refreshAccountBalances() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Accounts");
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const txSheets = ss.getSheets()
    .map(s => s.getName())
    .filter(n => n.startsWith("Transactions_"));

  for (let r = 2; r <= lastRow; r++) {
    const bank = sheet.getRange(r, 1).getValue();
    const type = sheet.getRange(r, 2).getValue();
    if (!bank) continue;

    // Use display name to match what doPost writes into col G
    const displayName = `${bank} ${type}`;

    if (txSheets.length === 0) {
      sheet.getRange(r, 4).setFormula(`=C${r}`);
      continue;
    }

    const creditTerms = txSheets.map(n =>
      `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Credit")`
    ).join("+");
    const debitTerms = txSheets.map(n =>
      `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Debit")`
    ).join("+");

    sheet.getRange(r, 4).setFormula(`=C${r}+(${creditTerms})-(${debitTerms})`);
  }
}

function refreshCCBalances() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Accounts_CC");
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const txSheets = ss.getSheets()
    .map(s => s.getName())
    .filter(n => n.startsWith("Transactions_"));

  for (let r = 2; r <= lastRow; r++) {
    const cardName = sheet.getRange(r, 2).getValue();
    const last4    = sheet.getRange(r, 3).getValue();
    if (!cardName) continue;

    const displayName = `${cardName} (...${last4})`; // matches _resolveAccountDisplayName output

    if (txSheets.length === 0) {
      sheet.getRange(r, 6).setFormula(`=E${r}`);
      sheet.getRange(r, 7).setFormula(`=D${r}-F${r}`);
      continue;
    }

    const spendTerms = txSheets.map(n =>
      `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Debit")`
    ).join("+");
    const paymentTerms = txSheets.map(n =>
      `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"CC_Payment")`
    ).join("+");

    sheet.getRange(r, 6).setFormula(`=E${r}+(${spendTerms})-(${paymentTerms})`);
    sheet.getRange(r, 7).setFormula(`=D${r}-F${r}`);
  }
}

/************************************************************
 * onEdit TRIGGER — auto-refresh dropdowns when accounts or categories change
 ************************************************************/

function onEdit(e) {
  const sheet = e.range.getSheet();
  const name  = sheet.getName();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();

  if (name === "Settings_Categories") {
    _reapplyAllDropdowns(ss);
  }
  if (name === "Accounts" || name === "Accounts_CC") {
    _reapplyAllDropdowns(ss);
    refreshAccountBalances();
    refreshCCBalances();
  }
}

/************************************************************
 * RECURRING PAYMENT MATCHER
 ************************************************************/

function resetRecurringStatus() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Settings_Recurring");
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  for (let r = 2; r <= lastRow; r++) {
    sheet.getRange(r, 7).setValue("Unpaid").setBackground("#fff2f2");
  }
}

/************************************************************
 * UTILITIES
 ************************************************************/

function _alert(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log("Alert suppressed: " + msg);
  }
}

/************************************************************
 * MENU + TRIGGERS
 ************************************************************/

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("📊 FinTrack")
      .addItem("Update Dashboard",             "updateGlobalDashboard")
      .addItem("Format Current Sheet",         "applyFormatting")
      .addItem("Refresh Account Balances",     "refreshAccountBalances")
      .addItem("Refresh CC Balances",          "refreshCCBalances")
      .addItem("Reset Recurring (New Month)",  "resetRecurringStatus")
      .addItem("Re-run Initialization",        "initializeProject")
      .addToUi();
  } catch (e) {
    Logger.log("onOpen UI unavailable: " + e);
  }
}

/************************************************************
 * Install once via:
 * Triggers → Add Trigger → autoMonthlyReset → Time-driven → Month timer → Day 1
 ************************************************************/
function autoMonthlyReset() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const tz  = getTimezone(ss);
  const now = new Date();
  if (Utilities.formatDate(now, tz, "d") === "1") {
    resetRecurringStatus();
    refreshAccountBalances();
    refreshCCBalances();
  }
}