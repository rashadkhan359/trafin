/************************************************************
 * TraFin v1
 ************************************************************
 * DATA GUARD PROMISE: This script NEVER deletes sheets, NEVER removes data rows,
 * NEVER overwrites user-entered values except in formula-driven columns
 * (Accounts col D, Accounts_CC cols F+G). All structural changes are incremental.
 * Safe to re-run initializeProject() at any time.
 * Exception: the menu action "Clean Up Transactions" (cleanup.js) MOVES junk and
 * duplicate rows to the Removed_SMS sheet — only when the user confirms.
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
        SettingsSync.refreshAll(ss);

        Main.alert(
            "TraFin v1 Initialized!\n\n" +
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

    resolveAccountDisplayName(ss, parserId, accountsList) {
        const accounts = accountsList || Config.getAccountsList(ss);
        const match = accounts.find(a => a.parserId === parserId);
        if (match) return match.displayName;

        // Card number not listed (replaced card, or SMS without the last 4 digits):
        // if that bank has exactly one card in Accounts_CC, it must be that one.
        const cc = /^(.+)_CC_/.exec(parserId || "");
        if (cc) {
            const cards = accounts.filter(a => a.parserId.indexOf(cc[1] + "_CC_") === 0);
            if (cards.length === 1) return cards[0].displayName;
        }
        return "Other";
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

            // Refunds arrive as Type "Credit" against the card and reduce what is owed.
            const refundTerms = txSheets.map(n =>
                `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Credit")`
            ).join("+");

            sheet.getRange(r, 6).setFormula(`=E${r}+(${spendTerms})-(${paymentTerms})-(${refundTerms})`);
            sheet.getRange(r, 7).setFormula(`=D${r}-F${r}`);
        }
    },

    /************************************************************
     * RECONCILE — ask for the real balance of each account / card and
     * adjust the Initial Balance (or Initial Outstanding) so the computed
     * current figure matches. Transactions are not changed.
     ************************************************************/
    reconcileBalances() {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const ui = SpreadsheetApp.getUi();

        Main.refreshAccountBalances();
        Main.refreshCCBalances();
        SpreadsheetApp.flush();

        const targets = [
            { sheetName: "Accounts",    initialCol: 3, currentCol: 4, what: "balance",
              label: row => `${row[0]} ${row[1]}`.trim() },
            { sheetName: "Accounts_CC", initialCol: 5, currentCol: 6, what: "outstanding (amount owed)",
              label: row => `${row[1]} (...${row[2]})` }
        ];

        const changes = [];

        for (const t of targets) {
            const sheet = ss.getSheetByName(t.sheetName);
            if (!sheet || sheet.getLastRow() < 2) continue;

            const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, t.currentCol).getValues();
            for (let i = 0; i < rows.length; i++) {
                if (!rows[i][0]) continue;

                const name = t.label(rows[i]);
                const initial = Number(rows[i][t.initialCol - 1]) || 0;
                const current = Number(rows[i][t.currentCol - 1]) || 0;

                const res = ui.prompt(
                    "Reconcile — " + name,
                    "Sheet shows " + t.what + ": " + current.toFixed(2) + "\n\n" +
                    "Enter the real " + t.what + " right now.\n" +
                    "Leave blank to skip this one.",
                    ui.ButtonSet.OK_CANCEL
                );
                if (res.getSelectedButton() !== ui.Button.OK) return;

                const text = res.getResponseText().replace(/[₹,\s]/g, "");
                if (!text) continue;
                const actual = Number(text);
                if (isNaN(actual)) {
                    ui.alert("'" + res.getResponseText() + "' is not a number — skipped " + name + ".");
                    continue;
                }

                const newInitial = Math.round((initial + (actual - current)) * 100) / 100;
                sheet.getRange(i + 2, t.initialCol).setValue(newInitial);
                changes.push(name + ": " + current.toFixed(2) + " → " + actual.toFixed(2));
            }
        }

        Main.alert(changes.length
            ? "Balances reconciled:\n\n" + changes.join("\n")
            : "Nothing changed.");
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
        if (!e || !e.range) return;

        const sheet = e.range.getSheet();
        const ss    = SpreadsheetApp.getActiveSpreadsheet();

        SettingsSync.onSettingsChanged(ss, sheet.getName());
    },

    onOpen() {
        try {
            const menu = SpreadsheetApp.getUi()
                .createMenu("TraFin")
                .addItem("Update Dashboard",             "updateGlobalDashboard")
                .addItem("Update Charts",                "updateCharts")
                .addItem("Format Current Sheet",         "applyFormatting")
                .addItem("Sync Dropdowns & Balances",    "syncSettingsAndDropdowns")
                .addItem("Refresh Account Balances",     "refreshAccountBalances")
                .addItem("Refresh CC Balances",          "refreshCCBalances")
                .addItem("Reconcile Balances (enter real balances)", "reconcileBalances")
                .addItem("Reset Recurring (New Month)",  "resetRecurringStatus")
                .addItem("Clean Up Transactions (junk SMS, unknown entities)", "cleanUpTransactions")
                .addItem("Re-run Initialization",        "initializeProject");
            // Present only while a one-off history import file is loaded in the project
            if (typeof importMissingTransactions === "function") {
                menu.addItem("Import Missing Transactions (one-off)", "importMissingTransactions");
            }
            menu.addToUi();
        } catch (e) {
            Logger.log("onOpen UI unavailable: " + e);
        }
    }
};
