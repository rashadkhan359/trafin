/************************************************************
 * SETTINGS SYNC
 * Keeps dropdowns and balance formulas in sync when settings sheets change.
 *
 * Runtime logic (webhook categorization, bank resolution, ignore keywords)
 * already reads sheets live via Config / Categories — no cache to invalidate.
 ************************************************************/

const SettingsSync = {

    /** Sheets that should trigger dropdown refresh on edit */
    DROPDOWN_SHEETS: [
        "Settings_Categories",
        "Settings_Mapping",
        "Settings_Rules",
        "Settings_Recurring",
        "Budget",
        "Accounts",
        "Accounts_CC"
    ],

    /** Sheets that should trigger balance formula refresh */
    BALANCE_SHEETS: ["Accounts", "Accounts_CC"],

    /************************************************************
     * onEdit handler — call from Main.onEdit
     ************************************************************/
    onSettingsChanged(ss, sheetName) {
        if (SettingsSync.DROPDOWN_SHEETS.indexOf(sheetName) >= 0) {
            Sheet.reapplyAllDropdowns(ss);
            Logger.log("SettingsSync: dropdowns refreshed (" + sheetName + ")");
        }

        if (SettingsSync.BALANCE_SHEETS.indexOf(sheetName) >= 0) {
            Main.refreshAccountBalances();
            Main.refreshCCBalances();
            Logger.log("SettingsSync: balance formulas refreshed (" + sheetName + ")");
        }
    },

    /************************************************************
     * Full sync — menus, init, manual repair
     ************************************************************/
    refreshAll(ss) {
        Sheet.reapplyAllDropdowns(ss);
        Main.refreshAccountBalances();
        Main.refreshCCBalances();
        Logger.log("SettingsSync: full dropdown + balance refresh");
    }
};
