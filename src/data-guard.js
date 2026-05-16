// =============================================================================
// DATA GUARD
// =============================================================================

const DataGuard = {

    /************************************************************
     * VERIFY TRANSACTION SHEET
     ************************************************************/
    verifyTransactionSheet(sheet) {
        if (sheet.getLastRow() < 5) return;
        const current = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
        TxSchema.HEADERS.forEach((expected, i) => {
            if (current[i] !== expected) {
                sheet.getRange(5, i + 1).setValue(expected)
                    .setFontWeight("bold").setBackground("#eeeeee");
                Logger.log(`DataGuard: Fixed header col ${i + 1} → "${expected}" on ${sheet.getName()}`);
            }
        });
    },

    /************************************************************
     * VERIFY SETTINGS SHEET
     ************************************************************/
    verifySettingsSheet(ss, name, expectedHeaders) {
        const sheet = ss.getSheetByName(name);
        if (!sheet || sheet.getLastRow() < 1) return;
        const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        expectedHeaders.forEach((h, i) => {
            if (current[i] !== h) {
                sheet.getRange(1, i + 1).setValue(h).setFontWeight("bold");
                Logger.log(`DataGuard: Fixed settings header "${h}" on ${name}`);
            }
        });
    },

    /************************************************************
     * RUN ALL VERIFICATIONS
     ************************************************************/
    runAll(ss) {
        Logger.log("DataGuard: Starting verification...");
        ss.getSheets()
            .filter(s => s.getName().startsWith("Transactions_"))
            .forEach(s => DataGuard.verifyTransactionSheet(s));

        DataGuard.verifySettingsSheet(ss, "Settings",
            ["Section", "Key", "Value", "Notes"]);
        DataGuard.verifySettingsSheet(ss, "Settings_Mapping",
            ["Keyword", "Category", "Days (Mon-Sun, blank=any)", "Notes"]);
        DataGuard.verifySettingsSheet(ss, "Settings_Rules",
            ["Rule Name", "Start Time (HH:mm)", "End Time (HH:mm)",
                "Max Amount (₹)", "Days (Mon-Sun, blank=any)", "Category"]);
        DataGuard.verifySettingsSheet(ss, "Settings_Recurring",
            ["Name", "Amount (₹)", "Due Day (1-31)", "Keyword Match",
                "Account", "Category", "Status", "Notes"]);
        DataGuard.verifySettingsSheet(ss, "Accounts",
            ["Bank", "Account Type", "Initial Balance (₹)",
                "Current Balance (₹)", "Currency", "Notes"]);
        DataGuard.verifySettingsSheet(ss, "Accounts_CC",
            ["Bank", "Card Name", "Last 4 Digits", "Credit Limit (₹)",
                "Initial Outstanding (₹)", "Current Outstanding (₹)",
                "Available Limit (₹)", "Currency", "Notes"]);
        Logger.log("DataGuard: Verification complete.");
    }
};