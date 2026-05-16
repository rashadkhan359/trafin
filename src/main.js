/************************************************************
 * FINTRACK v3
 ************************************************************
 * DATA GUARD PROMISE: This script NEVER deletes sheets, NEVER removes data rows,
 * NEVER overwrites user-entered values except in formula-driven columns
 * (Accounts col D, Accounts_CC cols F+G). All structural changes are incremental.
 * Safe to re-run initializeProject() at any time.
 ************************************************************/

const Main = {
    initializeProject() {
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        DataGuard.runAll(ss);

        Sheet.setupSettingsSheet(ss);
        Sheet.setupCategoriesSheet(ss);
        Sheet.setupMappingSheet(ss);
        Sheet.setupRulesSheet(ss);
        Sheet.setupRecurringSheet(ss);
        Sheet.setupAccountsSheet(ss);
        Sheet.setupAccountsCCSheet(ss);
        Sheet.setupBudgetSheet(ss);
        Sheet.setupDashboardSheet(ss);

        Backup.migrateExistingTransactions(ss);
        Main.refreshAccountBalances();
        Main.refreshCCBalances();

        Main.alert(
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
    },

    resolveAccountDisplayName(ss, parserId) {
        const match = Config.getAccountsList(ss).find(a => a.parserId === parserId);
        return match ? match.displayName : "Other";
    },

    refreshAccountBalances() {
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
    },

    refreshCCBalances() {
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

            const displayName = `${cardName} (...${last4})`;

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
    },

    resetRecurringStatus() {
        const ss    = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName("Settings_Recurring");
        if (!sheet) return;
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return;
        for (let r = 2; r <= lastRow; r++) {
            sheet.getRange(r, 7).setValue("Unpaid").setBackground("#fff2f2");
        }
    },

    autoMonthlyReset() {
        const ss  = SpreadsheetApp.getActiveSpreadsheet();
        const tz  = Config.getTimezone(ss);
        const now = new Date();
        if (Utilities.formatDate(now, tz, "d") === "1") {
            Main.resetRecurringStatus();
            Main.refreshAccountBalances();
            Main.refreshCCBalances();
        }
    },

    alert(msg) {
        try {
            SpreadsheetApp.getUi().alert(msg);
        } catch (e) {
            Logger.log("Alert suppressed: " + msg);
        }
    },

    onEdit(e) {
        const sheet = e.range.getSheet();
        const name  = sheet.getName();
        const ss    = SpreadsheetApp.getActiveSpreadsheet();

        if (name === "Settings_Categories") {
            Sheet.reapplyAllDropdowns(ss);
        }
        if (name === "Accounts" || name === "Accounts_CC") {
            Sheet.reapplyAllDropdowns(ss);
            Main.refreshAccountBalances();
            Main.refreshCCBalances();
        }
    },

    onOpen() {
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
};
