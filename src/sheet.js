/************************************************************
 * SHEET CREATION
 ************************************************************/

const Sheet = {
    /************************************************************
     * CREATE MONTHLY SHEET
     ************************************************************/
    createMonthlySheet(ss, name) {
        const sheet = ss.insertSheet(name);
        sheet.getRange("A1:B1").setValues([["Monthly Summary", "Value"]]).setFontWeight("bold");
        sheet.getRange("A2:B4").setValues([
            ["Total Expenses", `=SUMIF(B6:B,"Debit",C6:C)`],
            ["Total Income", `=SUMIF(B6:B,"Credit",C6:C)`],
            ["Net Balance", `=B3-B2`]
        ]);

        sheet.getRange(5, 1, 1, TxSchema.HEADERS.length)
            .setValues([TxSchema.HEADERS]).setFontWeight("bold").setBackground("#eeeeee");
        sheet.setFrozenRows(5);
        Sheet.applyTransactionDropdowns(ss, sheet, 6, 1000);
        return sheet;
    },

    /************************************************************
    * DROPDOWN HELPERS
    ************************************************************/

    applyCategoryDropdown(ss, sheet, startRow, col, numRows) {
        const catSheet = ss.getSheetByName("Settings_Categories");
        if (!catSheet || catSheet.getLastRow() < 2) return;
        // Open-ended range — auto-expands as user adds categories
        const rule = SpreadsheetApp.newDataValidation()
            .requireValueInRange(catSheet.getRange("A2:A"), true)
            .setAllowInvalid(true) // show warning triangle but don't block old data
            .build();
        sheet.getRange(startRow, col, numRows, 1).setDataValidation(rule);
    },

    applyAccountDropdown(ss, sheet, startRow, col, numRows) {
        const accounts = Config.getAccountsList(ss);
        if (accounts.length === 0) return;
        const rule = SpreadsheetApp.newDataValidation()
            .requireValueInList(accounts.map(a => a.displayName), true)
            .setAllowInvalid(true)
            .build();
        sheet.getRange(startRow, col, numRows, 1).setDataValidation(rule);
    },

    applyTransactionDropdowns(ss, sheet, startRow, numRows) {
        if (numRows <= 0) return;
        // Category — col 5 (Settings_Categories)
        Sheet.applyCategoryDropdown(ss, sheet, startRow, 5, numRows);
        // Bank — col 7 (Accounts + Accounts_CC display names)
        Sheet.applyAccountDropdown(ss, sheet, startRow, 7, numRows);
    },

    /** Rows to cover for settings sheets (used rows + buffer for new entries) */
    settingsDropdownRowCount(sheet) {
        const used = Math.max(sheet.getLastRow() - 1, 1);
        return Math.max(used + 50, 100);
    },

    /************************************************************
     * ENSURE DROPDOWNS on transaction data rows
     * appendRow() does not inherit validation — apply per new row,
     * or full range when sheet never had rules (legacy sheets).
     ************************************************************/
    ensureTransactionDropdowns(ss, sheet) {
        const lastRow = sheet.getLastRow();
        if (lastRow < 6) return;

        const headerRowHasCategoryRule = !!sheet.getRange(6, 5).getDataValidation();
        if (!headerRowHasCategoryRule) {
            Sheet.applyTransactionDropdowns(ss, sheet, 6, lastRow - 5);
            return;
        }

        const lastRowHasRules = !!sheet.getRange(lastRow, 5).getDataValidation();
        if (!lastRowHasRules) {
            Sheet.applyTransactionDropdowns(ss, sheet, lastRow, 1);
        }
    },

    applyAccountDropdownToAllTxSheets(ss) {
        ss.getSheets()
            .filter(s => s.getName().startsWith("Transactions_"))
            .forEach(sheet => {
                const lastRow = sheet.getLastRow();
                if (lastRow < 6) return;
                Sheet.applyTransactionDropdowns(ss, sheet, 6, lastRow - 5);
            });
    },

    reapplyAllDropdowns(ss) {
        const mapping = ss.getSheetByName("Settings_Mapping");
        const rules = ss.getSheetByName("Settings_Rules");
        const recurring = ss.getSheetByName("Settings_Recurring");
        const budget = ss.getSheetByName("Budget");

        if (mapping && mapping.getLastRow() > 1) {
            Sheet.applyCategoryDropdown(
                ss, mapping, 2, 2, Sheet.settingsDropdownRowCount(mapping)
            );
        }
        if (rules && rules.getLastRow() > 1) {
            Sheet.applyCategoryDropdown(
                ss, rules, 2, 6, Sheet.settingsDropdownRowCount(rules)
            );
        }
        if (recurring && recurring.getLastRow() > 1) {
            const rows = Sheet.settingsDropdownRowCount(recurring);
            Sheet.applyCategoryDropdown(ss, recurring, 2, 6, rows);
            Sheet.applyAccountDropdown(ss, recurring, 2, 5, rows);
        }
        if (budget && budget.getLastRow() > 1) {
            Sheet.applyCategoryDropdown(
                ss, budget, 2, 1, Sheet.settingsDropdownRowCount(budget)
            );
        }

        Sheet.applyAccountDropdownToAllTxSheets(ss);
    },

    /************************************************************
    * FORMATTING
    ************************************************************/
    applyFormatting() {
        const sheet = SpreadsheetApp.getActiveSheet();
        if (!sheet.getName().startsWith("Transactions_")) return;
        const lastRow = sheet.getLastRow();
        if (lastRow < 6) return;

        sheet.getRange(6, 1, lastRow - 5, 8).setBackground(null);
        const data = sheet.getRange(6, 2, lastRow - 5, 1).getValues();
        data.forEach((row, i) => {
            const r = i + 6;
            if (row[0] === "Debit") sheet.getRange(r, 1, 1, 8).setBackground("#fff2f2");
            else if (row[0] === "Credit") sheet.getRange(r, 1, 1, 8).setBackground("#f2fff2");
            else if (row[0] === "CC_Payment") sheet.getRange(r, 1, 1, 8).setBackground("#e8f0fe");
        });
    },

    /************************************************************
    * SETTINGS SHEET — single sheet for all scalar config
    ************************************************************/

    setupSettingsSheet(ss) {
        let sheet = ss.getSheetByName("Settings");
        if (!sheet) {
            sheet = ss.insertSheet("Settings");
            sheet.appendRow(["Section", "Key", "Value", "Notes"]);
            sheet.getRange("A1:D1").setFontWeight("bold").setBackground("#ffe599");
        }

        // Read existing rows to avoid duplicates
        const existingData = sheet.getLastRow() > 1
            ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
            : [];

        const existingKeys = existingData.map(r => `${r[0]}||${r[1]}`);

        const systemDefaults = [
            ["SYSTEM", "Timezone", FALLBACK_TIMEZONE, "e.g. Asia/Kolkata, America/New_York, Europe/London"],
            ["SYSTEM", "Currency", FALLBACK_CURRENCY, "Display currency label"],
            ["SYSTEM", "Dashboard Auto-refresh", "No", "Yes/No — not yet implemented"],
        ];

        // Add system settings if missing
        systemDefaults.forEach(([section, key, value, notes]) => {
            if (!existingKeys.includes(`${section}||${key}`)) {
                sheet.appendRow([section, key, value, notes]);
            }
        });

        // Add ignore keywords if missing
        DEFAULT_IGNORE_KEYWORDS.forEach((kw, i) => {
            const key = `keyword_${String(i + 1).padStart(3, "0")}`;
            // Check by value not key — don't duplicate same phrase even if key differs
            const alreadyExists = existingData.some(
                r => r[0] === "IGNORE_KEYWORDS" && r[2].toString().toLowerCase().trim() === kw.toLowerCase()
            );
            if (!alreadyExists) {
                sheet.appendRow(["IGNORE_KEYWORDS", key, kw, "Auto-seeded — safe to edit or delete"]);
            }
        });

        // Formatting
        sheet.setColumnWidth(1, 160);
        sheet.setColumnWidth(2, 160);
        sheet.setColumnWidth(3, 280);
        sheet.setColumnWidth(4, 320);

        // Add a note row at top if not present
        const firstVal = sheet.getRange(2, 1).getValue();
        if (firstVal !== "--- HOW TO USE ---") {
            sheet.insertRowBefore(2);
            sheet.getRange(2, 1, 1, 4).setValues([[
                "--- HOW TO USE ---",
                "",
                "",
                "SYSTEM rows = app config. IGNORE_KEYWORDS rows = SMS phrases to block. Add new rows freely."
            ]]).setFontColor("#999999").setFontStyle("italic");
        }
    },

    /************************************************************
    * SHEET SETUP FUNCTIONS
    ************************************************************/

    setupCategoriesSheet(ss) {
        let sheet = ss.getSheetByName("Settings_Categories");
        if (!sheet) sheet = ss.insertSheet("Settings_Categories");

        const existing = sheet.getLastRow() > 1
            ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().filter(String)
            : [];

        sheet.getRange("A1").setValue("Category").setFontWeight("bold").setBackground("#d9ead3");
        sheet.getRange("B1").setValue("Notes").setFontWeight("bold").setBackground("#d9ead3");

        let row = existing.length === 0 ? 2 : sheet.getLastRow() + 1;
        DEFAULT_CATEGORIES.forEach(cat => {
            if (!existing.includes(cat)) {
                sheet.getRange(row, 1).setValue(cat);
                row++;
            }
        });
        sheet.setColumnWidth(1, 200);
    },

    setupMappingSheet(ss) {
        let sheet = ss.getSheetByName("Settings_Mapping");
        if (!sheet) {
            sheet = ss.insertSheet("Settings_Mapping");
            sheet.appendRow(["Keyword", "Category", "Days (Mon-Sun, blank=any)", "Notes"]);
            sheet.getRange("A1:D1").setFontWeight("bold").setBackground("#d9ead3");
            const starters = [
                ["zomato", "Food", "", "Food delivery"],
                ["swiggy", "Food", "", "Food delivery"],
                ["blinkit", "Groceries", "", "Quick commerce"],
                ["zepto", "Groceries", "", "Quick commerce"],
                ["bigbasket", "Groceries", "", "Grocery delivery"],
                ["uber", "Travel", "", "Cab"],
                ["ola", "Travel", "", "Cab"],
                ["rapido", "Travel", "", "Bike taxi"],
                ["irctc", "Travel", "", "Train tickets"],
                ["makemytrip", "Travel", "", "Travel booking"],
                ["netflix", "OTT Subscriptions", "", ""],
                ["spotify", "OTT Subscriptions", "", ""],
                ["amazon prime", "OTT Subscriptions", "", ""],
                ["hotstar", "OTT Subscriptions", "", ""],
                ["amazon", "Shopping", "", ""],
                ["flipkart", "Shopping", "", ""],
                ["myntra", "Clothing", "", ""],
                ["airtel", "Mobile Recharge", "", ""],
                ["jio", "Mobile Recharge", "", ""],
                ["blink commerce", "Shopping", "", "Blinkit parent entity"],
                ["delhi metro", "Travel", "", ""],
                ["dmrc", "Travel", "", ""],
                ["petrol", "Fuel", "", ""],
                ["hp ", "Fuel", "", ""],
                ["indian oil", "Fuel", "", ""],
                ["apollo", "Medical", "", "Pharmacy"],
                ["medplus", "Medical", "", "Pharmacy"],
                ["1mg", "Medical", "", ""],
            ];
            sheet.getRange(2, 1, starters.length, 4).setValues(starters);
        }
        Sheet.applyCategoryDropdown(ss, sheet, 2, 2, 500);
        sheet.setColumnWidths(1, 4, 180);
    },

    setupRulesSheet(ss) {
        let sheet = ss.getSheetByName("Settings_Rules");
        if (!sheet) {
            sheet = ss.insertSheet("Settings_Rules");
            sheet.appendRow(["Rule Name", "Start Time (HH:mm)", "End Time (HH:mm)",
                "Max Amount (₹)", "Days (Mon-Sun, blank=any)", "Category"]);
            sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#cfe2f3");
            sheet.appendRow(["Morning Commute", "08:00", "10:30", 150, "Mon,Tue,Wed,Thu,Fri", "Travel"]);
            sheet.appendRow(["Evening Commute", "17:00", "20:00", 150, "Mon,Tue,Wed,Thu,Fri", "Travel"]);
        }
        Sheet.applyCategoryDropdown(ss, sheet, 2, 6, 500);
        sheet.setColumnWidths(1, 6, 160);
    },

    setupRecurringSheet(ss) {
        let sheet = ss.getSheetByName("Settings_Recurring");
        if (!sheet) {
            sheet = ss.insertSheet("Settings_Recurring");
            sheet.appendRow(["Name", "Amount (₹)", "Due Day (1-31)", "Keyword Match",
                "Account", "Category", "Status", "Notes"]);
            sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#fce5cd");
            sheet.appendRow(["Rent", 15000, 1, "rent", "BOI Savings", "Rent", "Unpaid", ""]);
            sheet.appendRow(["Home Loan EMI", 25000, 5, "hdfc", "Kotak Savings", "EMI", "Unpaid", ""]);
            sheet.appendRow(["Netflix", 649, 15, "netflix", "Kotak Savings", "OTT Subscriptions", "Unpaid", ""]);
            sheet.appendRow(["Electricity", 2000, 20, "tata power", "BOI Savings", "Electricity", "Unpaid", ""]);
        }
        const rows = Sheet.settingsDropdownRowCount(sheet);
        Sheet.applyCategoryDropdown(ss, sheet, 2, 6, rows);
        Sheet.applyAccountDropdown(ss, sheet, 2, 5, rows);
        sheet.setColumnWidths(1, 8, 160);
    },

    setupAccountsSheet(ss) {
        const HEADERS = ["Bank", "Account Type", "Initial Balance (₹)",
            "Current Balance (₹)", "Currency", "Notes"];
        let sheet = ss.getSheetByName("Accounts");
        if (!sheet) {
            sheet = ss.insertSheet("Accounts");
            sheet.appendRow(HEADERS);
            sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#d9ead3");
            sheet.appendRow(["Kotak", "Savings", 0, "", "INR", ""]);
            sheet.appendRow(["BOI", "Savings", 0, "", "INR", ""]);
        } else {
            // Incremental: add missing columns only
            const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            HEADERS.forEach((h, i) => {
                if (!current.includes(h)) {
                    sheet.getRange(1, i + 1).setValue(h).setFontWeight("bold").setBackground("#d9ead3");
                }
            });
        }
        sheet.setColumnWidths(1, 6, 170);
    },

    setupAccountsCCSheet(ss) {
        const HEADERS = ["Bank", "Card Name", "Last 4 Digits", "Credit Limit (₹)",
            "Initial Outstanding (₹)", "Current Outstanding (₹)", "Available Limit (₹)", "Currency", "Notes"];
        let sheet = ss.getSheetByName("Accounts_CC");
        if (!sheet) {
            sheet = ss.insertSheet("Accounts_CC");
            sheet.appendRow(HEADERS);
            sheet.getRange("A1:I1").setFontWeight("bold").setBackground("#fce5cd");
            sheet.appendRow(["Kotak", "Kotak Credit", "6971", 100000, 0, "", "", "INR", ""]);
        } else {
            const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            HEADERS.forEach((h, i) => {
                if (!current.includes(h)) {
                    sheet.getRange(1, i + 1).setValue(h).setFontWeight("bold").setBackground("#fce5cd");
                }
            });
        }
        sheet.setColumnWidths(1, 9, 170);
    },

    setupBudgetSheet(ss) {
        let sheet = ss.getSheetByName("Budget");
        if (!sheet) {
            sheet = ss.insertSheet("Budget");
            sheet.appendRow(["Category", "Monthly Budget (₹)", "Spent This Month (₹)", "Remaining (₹)", "% Used"]);
            sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#fff2cc");
            const budgets = [
                ["Food", 3000], ["Groceries", 5000], ["Travel", 2000],
                ["Fuel", 2000], ["Bills", 3000], ["EMI", 0],
                ["Rent", 0], ["Shopping", 3000], ["Entertainment", 1000],
                ["OTT Subscriptions", 1000], ["Health", 2000], ["Medical", 1000],
                ["Dining Out", 2000], ["Coffee", 500], ["Misc", 2000]
            ];
            budgets.forEach(([cat, amt], i) => {
                sheet.getRange(i + 2, 1).setValue(cat);
                sheet.getRange(i + 2, 2).setValue(amt);
            });
        }
        Sheet.applyCategoryDropdown(ss, sheet, 2, 1, 50);
        sheet.setColumnWidths(1, 5, 180);
    },

    setupDashboardSheet(ss) {
        if (!ss.getSheetByName("Dashboard")) {
            ss.insertSheet("Dashboard", 0);
        }
    },
}