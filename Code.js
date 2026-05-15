function repairBrokenTransactionColumns() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheets = ss.getSheets().filter(s =>
    s.getName().startsWith("Transactions_")
  );

  sheets.forEach(sheet => {

    const lastRow = sheet.getLastRow();

    if (lastRow < 6) return;

    const data = sheet
      .getRange(6, 1, lastRow - 5, 8)
      .getValues();

    const repaired = data.map(row => {

      const labels = row[5]; // currently bank
      const bank = row[6];   // currently raw sms

      row[5] = "";       // Labels should be empty
      row[6] = labels;   // restore Bank
      row[7] = bank;     // restore Raw SMS

      return row;
    });

    sheet
      .getRange(6, 1, repaired.length, 8)
      .setValues(repaired);

    Logger.log(`Fixed ${sheet.getName()}`);
  });

  SpreadsheetApp.flush();

  Logger.log("Repair complete.");
}


// // =============================================================================
// // FINTRACK v3
// // =============================================================================
// // DATA GUARD PROMISE: This script NEVER deletes sheets, NEVER removes data rows,
// // NEVER overwrites user-entered values except in formula-driven columns
// // (Accounts col D, Accounts_CC cols F+G). All structural changes are incremental.
// // Safe to re-run initializeProject() at any time.
// // =============================================================================

// // =============================================================================
// // RUNTIME CONFIG — all values read from Settings sheet at runtime.
// // Hardcoded values below are only used if Settings sheet doesn't exist yet
// // (e.g. very first run before initializeProject completes).
// // =============================================================================

// const FALLBACK_TIMEZONE = "Asia/Kolkata";
// const FALLBACK_CURRENCY = "INR";

// // Read timezone from Settings sheet. Falls back to FALLBACK_TIMEZONE.
// function _getTimezone(ss) {
//   try {
//     const s = (ss || SpreadsheetApp.getActiveSpreadsheet())
//       .getSheetByName("Settings");
//     if (!s) return FALLBACK_TIMEZONE;
//     const data = s.getDataRange().getValues();
//     for (let i = 1; i < data.length; i++) {
//       if (data[i][0] === "SYSTEM" && data[i][1] === "Timezone") {
//         return data[i][2] || FALLBACK_TIMEZONE;
//       }
//     }
//   } catch(e) {}
//   return FALLBACK_TIMEZONE;
// }

// // Read ignore keywords from Settings sheet (section = IGNORE_KEYWORDS).
// // Returns array of lowercase strings.
// function _getIgnoreKeywords(ss) {
//   try {
//     const s = (ss || SpreadsheetApp.getActiveSpreadsheet())
//       .getSheetByName("Settings");
//     if (!s) return [];
//     const data = s.getDataRange().getValues();
//     return data
//       .filter(row => row[0] === "IGNORE_KEYWORDS" && row[2])
//       .map(row => row[2].toString().toLowerCase().trim());
//   } catch(e) {}
//   return [];
// }

// // =============================================================================
// // CONSTANTS — structural, never runtime-configurable
// // =============================================================================

// const TRANSACTION_COLS = [
//   "Timestamp", "Type", "Amount", "Entity",
//   "Category", "Labels", "Bank", "Raw SMS"
// ];

// const DEFAULT_CATEGORIES = [
//   "Food", "Groceries", "Travel", "Fuel", "Transport",
//   "Bills", "Electricity", "Water", "Internet", "Mobile Recharge",
//   "EMI", "Rent", "Insurance", "Investment", "Savings",
//   "Shopping", "Clothing", "Electronics", "Entertainment",
//   "OTT Subscriptions", "Health", "Medical", "Education",
//   "Dining Out", "Coffee", "Personal Care", "Gym",
//   "CC Payment", "Transfer", "Income", "Misc"
// ];

// // Default ignore keywords — seeded into Settings sheet on init.
// // After init, the sheet is the source of truth, not this array.
// const DEFAULT_IGNORE_KEYWORDS = [
//   "is due on", "due date", "payment due", "minimum due",
//   "registering", "register your", "recharge", "plan has expired",
//   "not you? call", "never share", "t&c apply",
//   "jio no.", "google gemini",
//   "click here", "download", "subscribe",
//   "reward points", "cashback offer", "win ", "you've won",
//   "kyc", "update your", "verify your", "cred.club",
//   "pre-approved", "loan offer", "credit score",
//   "still spending", "link kotak", "earn pts", "earn points",
//   "rewards?", "upi rupay", "apply:", "avl limit",
//   "congratulations", "offer expires", "limited time",
//   "expiry", "otp", "pin", "your account will"
// ];

// // =============================================================================
// // DATA GUARD
// // =============================================================================

// const DataGuard = {

//   verifyTransactionSheet(sheet) {
//     if (sheet.getLastRow() < 5) return;
//     const current = sheet.getRange(5, 1, 1, sheet.getLastColumn()).getValues()[0];
//     TRANSACTION_COLS.forEach((expected, i) => {
//       if (current[i] !== expected) {
//         sheet.getRange(5, i + 1).setValue(expected)
//           .setFontWeight("bold").setBackground("#eeeeee");
//         Logger.log(`DataGuard: Fixed header col ${i+1} → "${expected}" on ${sheet.getName()}`);
//       }
//     });
//   },

//   verifySettingsSheet(ss, name, expectedHeaders) {
//     const sheet = ss.getSheetByName(name);
//     if (!sheet || sheet.getLastRow() < 1) return;
//     const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
//     expectedHeaders.forEach((h, i) => {
//       if (current[i] !== h) {
//         sheet.getRange(1, i + 1).setValue(h).setFontWeight("bold");
//         Logger.log(`DataGuard: Fixed settings header "${h}" on ${name}`);
//       }
//     });
//   },

//   runAll(ss) {
//     Logger.log("DataGuard: Starting verification...");
//     ss.getSheets()
//       .filter(s => s.getName().startsWith("Transactions_"))
//       .forEach(s => this.verifyTransactionSheet(s));

//     this.verifySettingsSheet(ss, "Settings",
//       ["Section", "Key", "Value", "Notes"]);
//     this.verifySettingsSheet(ss, "Settings_Mapping",
//       ["Keyword", "Category", "Days (Mon-Sun, blank=any)", "Notes"]);
//     this.verifySettingsSheet(ss, "Settings_Rules",
//       ["Rule Name", "Start Time (HH:mm)", "End Time (HH:mm)",
//        "Max Amount (₹)", "Days (Mon-Sun, blank=any)", "Category"]);
//     this.verifySettingsSheet(ss, "Settings_Recurring",
//       ["Name", "Amount (₹)", "Due Day (1-31)", "Keyword Match",
//        "Account", "Category", "Status", "Notes"]);
//     this.verifySettingsSheet(ss, "Accounts",
//       ["Bank", "Account Type", "Initial Balance (₹)",
//        "Current Balance (₹)", "Currency", "Notes"]);
//     this.verifySettingsSheet(ss, "Accounts_CC",
//       ["Bank", "Card Name", "Last 4 Digits", "Credit Limit (₹)",
//        "Initial Outstanding (₹)", "Current Outstanding (₹)",
//        "Available Limit (₹)", "Currency", "Notes"]);
//     Logger.log("DataGuard: Verification complete.");
//   }
// };

// // =============================================================================
// // BACKUP
// // =============================================================================

// function backupAllTransactions(ss) {
//   const tz          = _getTimezone(ss);
//   const timestamp   = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm");
//   const backupName  = "Backup_" + Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmm");

//   // Only delete if a sheet with the exact same timestamp name exists
//   const existing = ss.getSheetByName(backupName);
//   if (existing) ss.deleteSheet(existing);

//   const backupSheet = ss.insertSheet(backupName);
//   backupSheet.appendRow(["Source Sheet", ...TRANSACTION_COLS, "Backup Timestamp"]);
//   backupSheet.getRange(1, 1, 1, TRANSACTION_COLS.length + 2)
//     .setFontWeight("bold").setBackground("#f4cccc");

//   let totalRows = 0;
//   ss.getSheets()
//     .filter(s => s.getName().startsWith("Transactions_"))
//     .forEach(sheet => {
//       const lastRow = sheet.getLastRow();
//       if (lastRow < 6) return;
//       const data = sheet.getRange(6, 1, lastRow - 5, sheet.getLastColumn()).getValues();
//       const sourceName = sheet.getName();
//       data.forEach(row => {
//         const padded = TRANSACTION_COLS.map((_, i) => row[i] !== undefined ? row[i] : "");
//         backupSheet.appendRow([sourceName, ...padded, timestamp]);
//         totalRows++;
//       });
//     });

//   Logger.log(`Backup complete: ${totalRows} rows → "${backupName}"`);
//   return backupName;
// }

// // =============================================================================
// // INITIALIZATION
// // =============================================================================

// function initializeProject() {
//   const ss = SpreadsheetApp.getActiveSpreadsheet();

//   // DataGuard always runs first
//   DataGuard.runAll(ss);

//   // Settings sheet must be set up before anything else reads timezone/keywords
//   _setupSettingsSheet(ss);
//   _setupCategoriesSheet(ss);
//   _setupMappingSheet(ss);
//   _setupRulesSheet(ss);
//   _setupRecurringSheet(ss);
//   _setupAccountsSheet(ss);
//   _setupAccountsCCSheet(ss);
//   _setupBudgetSheet(ss);
//   _setupDashboardSheet(ss);

//   migrateExistingTransactions(ss);
//   refreshAccountBalances();
//   refreshCCBalances();

//   _alert(
//     "✅ FinTrack v3 Initialized!\n\n" +
//     "All sheets verified. Existing data preserved.\n\n" +
//     "Next steps:\n" +
//     "1. Set your timezone in Settings sheet (Section=SYSTEM, Key=Timezone)\n" +
//     "2. Set Initial Balances in Accounts\n" +
//     "3. Add Credit Card limits in Accounts_CC\n" +
//     "4. Add recurring payments in Settings_Recurring\n" +
//     "5. Add/remove ignore keywords in Settings sheet (Section=IGNORE_KEYWORDS)\n\n" +
//     "Check View → Logs for migration details."
//   );
// }

// // =============================================================================
// // SETTINGS SHEET — single sheet for all scalar config
// // =============================================================================
// // Structure: Section | Key | Value | Notes
// // Sections: SYSTEM, IGNORE_KEYWORDS
// // To add ignore keywords: add a row with Section=IGNORE_KEYWORDS, Key=keyword_N, Value=the phrase
// // =============================================================================

// function _setupSettingsSheet(ss) {
//   let sheet = ss.getSheetByName("Settings");
//   if (!sheet) {
//     sheet = ss.insertSheet("Settings");
//     sheet.appendRow(["Section", "Key", "Value", "Notes"]);
//     sheet.getRange("A1:D1").setFontWeight("bold").setBackground("#ffe599");
//   }

//   // Read existing rows to avoid duplicates
//   const existingData = sheet.getLastRow() > 1
//     ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
//     : [];

//   const existingKeys = existingData.map(r => `${r[0]}||${r[1]}`);

//   const systemDefaults = [
//     ["SYSTEM", "Timezone",         FALLBACK_TIMEZONE,  "e.g. Asia/Kolkata, America/New_York, Europe/London"],
//     ["SYSTEM", "Currency",         FALLBACK_CURRENCY,  "Display currency label"],
//     ["SYSTEM", "Dashboard Auto-refresh", "No",         "Yes/No — not yet implemented"],
//   ];

//   // Add system settings if missing
//   systemDefaults.forEach(([section, key, value, notes]) => {
//     if (!existingKeys.includes(`${section}||${key}`)) {
//       sheet.appendRow([section, key, value, notes]);
//     }
//   });

//   // Add ignore keywords if missing
//   DEFAULT_IGNORE_KEYWORDS.forEach((kw, i) => {
//     const key = `keyword_${String(i + 1).padStart(3, "0")}`;
//     // Check by value not key — don't duplicate same phrase even if key differs
//     const alreadyExists = existingData.some(
//       r => r[0] === "IGNORE_KEYWORDS" && r[2].toString().toLowerCase().trim() === kw.toLowerCase()
//     );
//     if (!alreadyExists) {
//       sheet.appendRow(["IGNORE_KEYWORDS", key, kw, "Auto-seeded — safe to edit or delete"]);
//     }
//   });

//   // Formatting
//   sheet.setColumnWidth(1, 160);
//   sheet.setColumnWidth(2, 160);
//   sheet.setColumnWidth(3, 280);
//   sheet.setColumnWidth(4, 320);

//   // Add a note row at top if not present
//   const firstVal = sheet.getRange(2, 1).getValue();
//   if (firstVal !== "--- HOW TO USE ---") {
//     sheet.insertRowBefore(2);
//     sheet.getRange(2, 1, 1, 4).setValues([[
//       "--- HOW TO USE ---",
//       "",
//       "",
//       "SYSTEM rows = app config. IGNORE_KEYWORDS rows = SMS phrases to block. Add new rows freely."
//     ]]).setFontColor("#999999").setFontStyle("italic");
//   }
// }

// // =============================================================================
// // SHEET SETUP FUNCTIONS
// // =============================================================================

// function _setupCategoriesSheet(ss) {
//   let sheet = ss.getSheetByName("Settings_Categories");
//   if (!sheet) sheet = ss.insertSheet("Settings_Categories");

//   const existing = sheet.getLastRow() > 1
//     ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat().filter(String)
//     : [];

//   sheet.getRange("A1").setValue("Category").setFontWeight("bold").setBackground("#d9ead3");
//   sheet.getRange("B1").setValue("Notes").setFontWeight("bold").setBackground("#d9ead3");

//   let row = existing.length === 0 ? 2 : sheet.getLastRow() + 1;
//   DEFAULT_CATEGORIES.forEach(cat => {
//     if (!existing.includes(cat)) {
//       sheet.getRange(row, 1).setValue(cat);
//       row++;
//     }
//   });
//   sheet.setColumnWidth(1, 200);
// }

// function _setupMappingSheet(ss) {
//   let sheet = ss.getSheetByName("Settings_Mapping");
//   if (!sheet) {
//     sheet = ss.insertSheet("Settings_Mapping");
//     sheet.appendRow(["Keyword", "Category", "Days (Mon-Sun, blank=any)", "Notes"]);
//     sheet.getRange("A1:D1").setFontWeight("bold").setBackground("#d9ead3");
//     const starters = [
//       ["zomato",            "Food",              "", "Food delivery"],
//       ["swiggy",            "Food",              "", "Food delivery"],
//       ["blinkit",           "Groceries",         "", "Quick commerce"],
//       ["zepto",             "Groceries",         "", "Quick commerce"],
//       ["bigbasket",         "Groceries",         "", "Grocery delivery"],
//       ["uber",              "Travel",            "", "Cab"],
//       ["ola",               "Travel",            "", "Cab"],
//       ["rapido",            "Travel",            "", "Bike taxi"],
//       ["irctc",             "Travel",            "", "Train tickets"],
//       ["makemytrip",        "Travel",            "", "Travel booking"],
//       ["netflix",           "OTT Subscriptions", "", ""],
//       ["spotify",           "OTT Subscriptions", "", ""],
//       ["amazon prime",      "OTT Subscriptions", "", ""],
//       ["hotstar",           "OTT Subscriptions", "", ""],
//       ["amazon",            "Shopping",          "", ""],
//       ["flipkart",          "Shopping",          "", ""],
//       ["myntra",            "Clothing",          "", ""],
//       ["airtel",            "Mobile Recharge",   "", ""],
//       ["jio",               "Mobile Recharge",   "", ""],
//       ["blink commerce",    "Shopping",          "", "Blinkit parent entity"],
//       ["delhi metro",       "Travel",            "", ""],
//       ["dmrc",              "Travel",            "", ""],
//       ["petrol",            "Fuel",              "", ""],
//       ["hp ",               "Fuel",              "", ""],
//       ["indian oil",        "Fuel",              "", ""],
//       ["apollo",            "Medical",           "", "Pharmacy"],
//       ["medplus",           "Medical",           "", "Pharmacy"],
//       ["1mg",               "Medical",           "", ""],
//     ];
//     sheet.getRange(2, 1, starters.length, 4).setValues(starters);
//   }
//   _applyCategoryDropdown(ss, sheet, 2, 2, 500);
//   sheet.setColumnWidths(1, 4, 180);
// }

// function _setupRulesSheet(ss) {
//   let sheet = ss.getSheetByName("Settings_Rules");
//   if (!sheet) {
//     sheet = ss.insertSheet("Settings_Rules");
//     sheet.appendRow(["Rule Name", "Start Time (HH:mm)", "End Time (HH:mm)",
//       "Max Amount (₹)", "Days (Mon-Sun, blank=any)", "Category"]);
//     sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#cfe2f3");
//     sheet.appendRow(["Morning Commute", "08:00", "10:30", 150, "Mon,Tue,Wed,Thu,Fri", "Travel"]);
//     sheet.appendRow(["Evening Commute", "17:00", "20:00", 150, "Mon,Tue,Wed,Thu,Fri", "Travel"]);
//   }
//   _applyCategoryDropdown(ss, sheet, 2, 6, 500);
//   sheet.setColumnWidths(1, 6, 160);
// }

// function _setupRecurringSheet(ss) {
//   let sheet = ss.getSheetByName("Settings_Recurring");
//   if (!sheet) {
//     sheet = ss.insertSheet("Settings_Recurring");
//     sheet.appendRow(["Name", "Amount (₹)", "Due Day (1-31)", "Keyword Match",
//       "Account", "Category", "Status", "Notes"]);
//     sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#fce5cd");
//     sheet.appendRow(["Rent",          15000, 1,  "rent",       "BOI Savings",   "Rent",              "Unpaid", ""]);
//     sheet.appendRow(["Home Loan EMI", 25000, 5,  "hdfc",       "Kotak Savings", "EMI",               "Unpaid", ""]);
//     sheet.appendRow(["Netflix",       649,   15, "netflix",    "Kotak Savings", "OTT Subscriptions", "Unpaid", ""]);
//     sheet.appendRow(["Electricity",   2000,  20, "tata power", "BOI Savings",   "Electricity",       "Unpaid", ""]);
//   }
//   _applyCategoryDropdown(ss, sheet, 2, 6, 100);
//   sheet.setColumnWidths(1, 8, 160);
// }

// function _setupAccountsSheet(ss) {
//   const HEADERS = ["Bank", "Account Type", "Initial Balance (₹)",
//     "Current Balance (₹)", "Currency", "Notes"];
//   let sheet = ss.getSheetByName("Accounts");
//   if (!sheet) {
//     sheet = ss.insertSheet("Accounts");
//     sheet.appendRow(HEADERS);
//     sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#d9ead3");
//     sheet.appendRow(["Kotak", "Savings", 0, "", "INR", ""]);
//     sheet.appendRow(["BOI",   "Savings", 0, "", "INR", ""]);
//   } else {
//     // Incremental: add missing columns only
//     const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
//     HEADERS.forEach((h, i) => {
//       if (!current.includes(h)) {
//         sheet.getRange(1, i + 1).setValue(h).setFontWeight("bold").setBackground("#d9ead3");
//       }
//     });
//   }
//   sheet.setColumnWidths(1, 6, 170);
// }

// function _setupAccountsCCSheet(ss) {
//   const HEADERS = ["Bank", "Card Name", "Last 4 Digits", "Credit Limit (₹)",
//     "Initial Outstanding (₹)", "Current Outstanding (₹)", "Available Limit (₹)", "Currency", "Notes"];
//   let sheet = ss.getSheetByName("Accounts_CC");
//   if (!sheet) {
//     sheet = ss.insertSheet("Accounts_CC");
//     sheet.appendRow(HEADERS);
//     sheet.getRange("A1:I1").setFontWeight("bold").setBackground("#fce5cd");
//     sheet.appendRow(["Kotak", "Kotak Credit", "6971", 100000, 0, "", "", "INR", ""]);
//   } else {
//     const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
//     HEADERS.forEach((h, i) => {
//       if (!current.includes(h)) {
//         sheet.getRange(1, i + 1).setValue(h).setFontWeight("bold").setBackground("#fce5cd");
//       }
//     });
//   }
//   sheet.setColumnWidths(1, 9, 170);
// }

// function _setupBudgetSheet(ss) {
//   let sheet = ss.getSheetByName("Budget");
//   if (!sheet) {
//     sheet = ss.insertSheet("Budget");
//     sheet.appendRow(["Category", "Monthly Budget (₹)", "Spent This Month (₹)", "Remaining (₹)", "% Used"]);
//     sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#fff2cc");
//     const budgets = [
//       ["Food", 3000], ["Groceries", 5000], ["Travel", 2000],
//       ["Fuel", 2000], ["Bills", 3000], ["EMI", 0],
//       ["Rent", 0], ["Shopping", 3000], ["Entertainment", 1000],
//       ["OTT Subscriptions", 1000], ["Health", 2000], ["Medical", 1000],
//       ["Dining Out", 2000], ["Coffee", 500], ["Misc", 2000]
//     ];
//     budgets.forEach(([cat, amt], i) => {
//       sheet.getRange(i + 2, 1).setValue(cat);
//       sheet.getRange(i + 2, 2).setValue(amt);
//     });
//   }
//   _applyCategoryDropdown(ss, sheet, 2, 1, 50);
//   sheet.setColumnWidths(1, 5, 180);
// }

// function _setupDashboardSheet(ss) {
//   if (!ss.getSheetByName("Dashboard")) {
//     ss.insertSheet("Dashboard", 0);
//   }
// }

// // =============================================================================
// // DROPDOWN HELPERS
// // =============================================================================

// function _applyCategoryDropdown(ss, sheet, startRow, col, numRows) {
//   const catSheet = ss.getSheetByName("Settings_Categories");
//   if (!catSheet || catSheet.getLastRow() < 2) return;
//   // Open-ended range — auto-expands as user adds categories
//   const rule = SpreadsheetApp.newDataValidation()
//     .requireValueInRange(catSheet.getRange("A2:A"), true)
//     .setAllowInvalid(true) // show warning triangle but don't block old data
//     .build();
//   sheet.getRange(startRow, col, numRows, 1).setDataValidation(rule);
// }

// function _applyTransactionDropdowns(ss, sheet, startRow, numRows) {
//   if (numRows <= 0) return;
//   // Category — col 5
//   _applyCategoryDropdown(ss, sheet, startRow, 5, numRows);
//   // Bank — col 7
//   const accounts = _getAccountsList(ss);
//   if (accounts.length > 0) {
//     const rule = SpreadsheetApp.newDataValidation()
//       .requireValueInList(accounts.map(a => a.displayName), true)
//       .setAllowInvalid(true)
//       .build();
//     sheet.getRange(startRow, 7, numRows, 1).setDataValidation(rule);
//   }
// }

// function _applyAccountDropdownToAllTxSheets(ss) {
//   ss.getSheets()
//     .filter(s => s.getName().startsWith("Transactions_"))
//     .forEach(sheet => {
//       const lastRow = sheet.getLastRow();
//       if (lastRow < 6) return;
//       _applyTransactionDropdowns(ss, sheet, 6, lastRow - 5);
//     });
// }

// function _reapplyAllDropdowns(ss) {
//   const mapping   = ss.getSheetByName("Settings_Mapping");
//   const rules     = ss.getSheetByName("Settings_Rules");
//   const recurring = ss.getSheetByName("Settings_Recurring");
//   const budget    = ss.getSheetByName("Budget");

//   if (mapping)   _applyCategoryDropdown(ss, mapping,   2, 2, 500);
//   if (rules)     _applyCategoryDropdown(ss, rules,     2, 6, 500);
//   if (recurring) _applyCategoryDropdown(ss, recurring, 2, 6, 100);
//   if (budget)    _applyCategoryDropdown(ss, budget,    2, 1,  50);

//   _applyAccountDropdownToAllTxSheets(ss);
// }

// // =============================================================================
// // ACCOUNT HELPERS
// // =============================================================================

// function _getAccountsList(ss) {
//   const accounts = [];
//   const accSheet = ss.getSheetByName("Accounts");
//   if (accSheet && accSheet.getLastRow() > 1) {
//     accSheet.getRange(2, 1, accSheet.getLastRow() - 1, 2).getValues()
//       .forEach(([bank, type]) => {
//         if (!bank) return;
//         accounts.push({
//           displayName: `${bank} ${type}`,   // e.g. "BOI Savings"
//           parserId:    bank                  // e.g. "BOI"
//         });
//       });
//   }
//   const ccSheet = ss.getSheetByName("Accounts_CC");
//   if (ccSheet && ccSheet.getLastRow() > 1) {
//     ccSheet.getRange(2, 1, ccSheet.getLastRow() - 1, 3).getValues()
//       .forEach(([bank, cardName, last4]) => {
//         if (!bank) return;
//         accounts.push({
//           displayName: `${cardName} (...${last4})`,  // e.g. "Kotak Credit (...6971)"
//           parserId:    `${bank}_CC_${last4}`           // e.g. "Kotak_CC_6971"
//         });
//       });
//   }
//   return accounts;
// }

// function _resolveAccountDisplayName(ss, parserId) {
//   const match = _getAccountsList(ss).find(a => a.parserId === parserId);
//   return match ? match.displayName : "Other";
// }

// // =============================================================================
// // MIGRATION — incremental, never destructive
// // =============================================================================

// function migrateExistingTransactions(ss) {
//   const sheets = ss.getSheets().filter(s => s.getName().startsWith("Transactions_"));
//   if (sheets.length === 0) return;

//   const backupName = backupAllTransactions(ss);
//   Logger.log(`Migration: Backup created → ${backupName}`);

//   sheets.forEach(sheet => {
//     const lastCol = sheet.getLastColumn();
//     const lastRow = sheet.getLastRow();

//     // Always ensure summary rows 1-4
//     sheet.getRange("A1:B1").setValues([["Monthly Summary", "Value"]]).setFontWeight("bold");
//     sheet.getRange("A2:B4").setValues([
//       ["Total Expenses", `=SUMIF(B6:B,"Debit",C6:C)`],
//       ["Total Income",   `=SUMIF(B6:B,"Credit",C6:C)`],
//       ["Net Balance",    `=B3-B2`]
//     ]);
//     sheet.setFrozenRows(5);

//     if (lastRow < 5) {
//       sheet.getRange(5, 1, 1, TRANSACTION_COLS.length)
//         .setValues([TRANSACTION_COLS]).setFontWeight("bold").setBackground("#eeeeee");
//       return;
//     }

//     const currentHeaders = sheet
//       .getRange(5, 1, 1, Math.max(lastCol, 8)).getValues()[0];

//     // Insert Labels column at col 6 if missing
//     // Old: col6=Bank, col7=RawSMS  →  New: col6=Labels, col7=Bank, col8=RawSMS
//     const hasLabels = currentHeaders[5] === "Labels";
//     if (!hasLabels && lastRow >= 6) {
//       sheet.insertColumnBefore(6);
//       sheet.getRange(5, 6).setValue("Labels")
//         .setFontWeight("bold").setBackground("#eeeeee");
//       Logger.log(`Migration: Inserted Labels column on ${sheet.getName()}`);
//     }

//     // Verify/fix all headers
//     DataGuard.verifyTransactionSheet(sheet);

//     // Apply dropdowns to existing data rows
//     if (sheet.getLastRow() >= 6) {
//       _applyTransactionDropdowns(ss, sheet, 6, sheet.getLastRow() - 5);
//     }
//   });
// }

// // =============================================================================
// // BALANCE REFRESH
// // =============================================================================

// function refreshAccountBalances() {
//   const ss    = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = ss.getSheetByName("Accounts");
//   if (!sheet) return;

//   const lastRow = sheet.getLastRow();
//   if (lastRow < 2) return;

//   const txSheets = ss.getSheets()
//     .map(s => s.getName())
//     .filter(n => n.startsWith("Transactions_"));

//   for (let r = 2; r <= lastRow; r++) {
//     const bank = sheet.getRange(r, 1).getValue();
//     const type = sheet.getRange(r, 2).getValue();
//     if (!bank) continue;

//     // Use display name to match what doPost writes into col G
//     const displayName = `${bank} ${type}`;

//     if (txSheets.length === 0) {
//       sheet.getRange(r, 4).setFormula(`=C${r}`);
//       continue;
//     }

//     const creditTerms = txSheets.map(n =>
//       `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Credit")`
//     ).join("+");
//     const debitTerms = txSheets.map(n =>
//       `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Debit")`
//     ).join("+");

//     sheet.getRange(r, 4).setFormula(`=C${r}+(${creditTerms})-(${debitTerms})`);
//   }
// }

// function refreshCCBalances() {
//   const ss    = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = ss.getSheetByName("Accounts_CC");
//   if (!sheet) return;

//   const lastRow = sheet.getLastRow();
//   if (lastRow < 2) return;

//   const txSheets = ss.getSheets()
//     .map(s => s.getName())
//     .filter(n => n.startsWith("Transactions_"));

//   for (let r = 2; r <= lastRow; r++) {
//     const cardName = sheet.getRange(r, 2).getValue();
//     const last4    = sheet.getRange(r, 3).getValue();
//     if (!cardName) continue;

//     const displayName = `${cardName} (...${last4})`; // matches _resolveAccountDisplayName output

//     if (txSheets.length === 0) {
//       sheet.getRange(r, 6).setFormula(`=E${r}`);
//       sheet.getRange(r, 7).setFormula(`=D${r}-F${r}`);
//       continue;
//     }

//     const spendTerms = txSheets.map(n =>
//       `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"Debit")`
//     ).join("+");
//     const paymentTerms = txSheets.map(n =>
//       `SUMIFS('${n}'!C:C,'${n}'!G:G,"${displayName}",'${n}'!B:B,"CC_Payment")`
//     ).join("+");

//     sheet.getRange(r, 6).setFormula(`=E${r}+(${spendTerms})-(${paymentTerms})`);
//     sheet.getRange(r, 7).setFormula(`=D${r}-F${r}`);
//   }
// }

// // =============================================================================
// // onEdit TRIGGER — auto-refresh dropdowns when accounts or categories change
// // =============================================================================

// function onEdit(e) {
//   const sheet = e.range.getSheet();
//   const name  = sheet.getName();
//   const ss    = SpreadsheetApp.getActiveSpreadsheet();

//   if (name === "Settings_Categories") {
//     _reapplyAllDropdowns(ss);
//   }
//   if (name === "Accounts" || name === "Accounts_CC") {
//     _reapplyAllDropdowns(ss);
//     refreshAccountBalances();
//     refreshCCBalances();
//   }
// }

// // =============================================================================
// // WEBHOOK
// // =============================================================================

// function doPost(e) {
//   try {
//     const ss  = SpreadsheetApp.getActiveSpreadsheet();
//     const tz  = _getTimezone(ss);
//     const now = new Date();

//     const monthName = Utilities.formatDate(now, tz, "MMM_yyyy");
//     const sheetName = "Transactions_" + monthName;

//     let sheet = ss.getSheetByName(sheetName);
//     const isNewSheet = !sheet;
//     if (isNewSheet) sheet = createMonthlySheet(ss, sheetName);

//     const data     = JSON.parse(e.postData.contents);
//     const rawSms   = data.message || "";
//     const lowerSms = rawSms.toLowerCase();
//     const timeStr  = Utilities.formatDate(now, tz, "HH:mm");
//     const dayStr   = Utilities.formatDate(now, tz, "EEE");

//     let { amount, type, entity, bank } = parseSms(rawSms, lowerSms);

//     // Guard — reads ignore keywords from Settings sheet at runtime
//     if (!isTransactionSms(ss, rawSms, lowerSms, amount, type)) {
//       return _jsonResponse({ status: "ignored", reason: "non-transaction SMS" });
//     }

//     // Resolve bank parserId to human-readable display name
//     bank = _resolveAccountDisplayName(ss, bank);

//     const category = getSmartCategory(ss, entity, amount, timeStr, dayStr);
//     sheet.appendRow([now, type, amount, entity, category, "", bank, rawSms]);

//     _checkRecurringMatch(ss, now, amount, entity, category);

//     if (isNewSheet) {
//       refreshAccountBalances();
//       refreshCCBalances();
//     }

//     return _jsonResponse({ status: "success" });
//   } catch (f) {
//     return _jsonResponse({ status: "error", message: f.toString() });
//   }
// }

// function _jsonResponse(obj) {
//   return ContentService
//     .createTextOutput(JSON.stringify(obj))
//     .setMimeType(ContentService.MimeType.JSON);
// }

// // =============================================================================
// // SHEET CREATION
// // =============================================================================

// function createMonthlySheet(ss, name) {
//   const sheet = ss.insertSheet(name);
//   sheet.getRange("A1:B1").setValues([["Monthly Summary", "Value"]]).setFontWeight("bold");
//   sheet.getRange("A2:B4").setValues([
//     ["Total Expenses", `=SUMIF(B6:B,"Debit",C6:C)`],
//     ["Total Income",   `=SUMIF(B6:B,"Credit",C6:C)`],
//     ["Net Balance",    `=B3-B2`]
//   ]);
//   sheet.getRange(5, 1, 1, TRANSACTION_COLS.length)
//     .setValues([TRANSACTION_COLS]).setFontWeight("bold").setBackground("#eeeeee");
//   sheet.setFrozenRows(5);
//   _applyTransactionDropdowns(ss, sheet, 6, 1000);
//   return sheet;
// }

// // =============================================================================
// // SMS PARSING
// // =============================================================================

// function parseSms(rawSms, lowerSms) {
//   let amount = 0;
//   const amountMatch = rawSms.match(/(?:Rs\.?|INR|Rs:|₹)\s*([\d,]+\.?\d*)/i);
//   if (amountMatch) amount = parseFloat(amountMatch[1].replace(/,/g, ""));

//   let type   = "Unknown";
//   let entity = "Unknown";
//   let bank   = "Other";

//   // Bank detection
//   if (rawSms.includes("-BOI") || /\bBOI\b/.test(rawSms))          bank = "BOI";
//   else if (/kotak.*credit card|credit card.*kotak/i.test(rawSms)) bank = `Kotak_CC_${_extractLast4(rawSms)}`;
//   else if (/\bKotak\b/.test(rawSms))                               bank = "Kotak";

//   // Type + entity — order matters, most specific first

//   // CC spend: "INR X spent on Kotak Credit Card xNNNN at MERCHANT."
//   if (/\bspent on\b.*credit card/i.test(rawSms)) {
//     type = "Debit";
//     const m = rawSms.match(/\bat\s+(.+?)\./i);
//     entity = m ? m[1].trim() : "CC Spend";
//   }
//   // CC bill payment received: "Payment of INR X is credited to your Kotak Bank Credit Card"
//   else if (/credited to your.*credit card/i.test(lowerSms)) {
//     type   = "CC_Payment";
//     entity = "CC Bill Payment";
//   }
//   // Standard UPI debit
//   else if (lowerSms.includes("debited")) {
//     type = "Debit";
//     const m = rawSms.match(/credited to\s+(.+?)\s+via/i)
//            || rawSms.match(/to\s+(.+?)\s+UPI/i);
//     entity = m ? m[1].trim() : "Unknown";
//   }
//   // Standard credit/received — must NOT match CC payment (already caught above)
//   else if (lowerSms.includes("credited") || lowerSms.includes("received")) {
//     type = "Credit";
//     const m = rawSms.match(/from\s+(.+?)\s+on/i)
//            || rawSms.match(/from\s+(.+?)\s+credited/i);
//     entity = m ? m[1].trim() : "Income";
//   }

//   // Clean entity
//   entity = entity.split("@")[0].replace(/[0-9]{7,}/g, "").trim();

//   return { amount, type, entity, bank };
// }

// function _extractLast4(rawSms) {
//   const m = rawSms.match(/[xX]{1,4}(\d{4})/);
//   return m ? m[1] : "XXXX";
// }

// // =============================================================================
// // SMS FILTER — reads ignore keywords from Settings sheet at runtime
// // =============================================================================

// function isTransactionSms(ss, rawSms, lowerSms, amount, type) {
//   // Read keywords from sheet — user controls these entirely
//   const keywords = _getIgnoreKeywords(ss);
//   for (const kw of keywords) {
//     if (kw && lowerSms.includes(kw)) return false;
//   }

//   if (!amount || amount <= 0) return false;
//   if (type === "Unknown")     return false;
//   return true;
// }

// // =============================================================================
// // SMART CATEGORIZATION
// // =============================================================================

// function getSmartCategory(ss, entity, amount, timeStr, dayStr) {
//   if (entity === "CC Bill Payment") return "CC Payment";

//   // 1. Keyword mapping — supports comma-separated keywords per row
//   const mapData = ss.getSheetByName("Settings_Mapping").getDataRange().getValues();
//   for (let i = 1; i < mapData.length; i++) {
//     const [keywordCell, category, days] = mapData[i];
//     if (!keywordCell) continue;
//     const keywords    = keywordCell.toString().split(",").map(k => k.trim().toLowerCase());
//     const entityLower = entity.toLowerCase();
//     if (!keywords.some(kw => kw && entityLower.includes(kw))) continue;
//     if (days && !_matchesDay(days, dayStr)) continue;
//     return category;
//   }

//   // 2. Time/amount rules
//   const ruleData = ss.getSheetByName("Settings_Rules").getDataRange().getValues();
//   for (let i = 1; i < ruleData.length; i++) {
//     const [, start, end, maxAmt, days, cat] = ruleData[i];
//     if (!start) continue;
//     if (timeStr < start || timeStr > end) continue;
//     if (amount > Number(maxAmt)) continue;
//     if (days && !_matchesDay(days, dayStr)) continue;
//     return cat;
//   }

//   return "Misc";
// }

// function _matchesDay(daysCell, dayStr) {
//   if (!daysCell || daysCell.toString().trim() === "") return true;
//   return daysCell.toString().split(",")
//     .map(d => d.trim().toLowerCase())
//     .includes(dayStr.toLowerCase());
// }

// // =============================================================================
// // RECURRING PAYMENT MATCHER
// // =============================================================================

// function _checkRecurringMatch(ss, txDate, amount, entity, category) {
//   const sheet = ss.getSheetByName("Settings_Recurring");
//   if (!sheet) return;

//   const data  = sheet.getDataRange().getValues();
//   const today = txDate.getDate();

//   for (let i = 1; i < data.length; i++) {
//     const [name, expectedAmt, dueDay, keyword, , , status] = data[i];
//     if (!name || status === "Paid") continue;

//     const dayMatch    = Math.abs(today - dueDay) <= 3;
//     const amountMatch = expectedAmt > 0 &&
//       Math.abs(amount - expectedAmt) / expectedAmt <= 0.10;
//     const entityMatch = keyword &&
//       entity.toLowerCase().includes(keyword.toString().toLowerCase());

//     if (dayMatch && amountMatch && entityMatch) {
//       sheet.getRange(i + 1, 7).setValue("Paid").setBackground("#d9ead3");
//       return;
//     }
//   }
// }

// function resetRecurringStatus() {
//   const ss    = SpreadsheetApp.getActiveSpreadsheet();
//   const sheet = ss.getSheetByName("Settings_Recurring");
//   if (!sheet) return;
//   const lastRow = sheet.getLastRow();
//   if (lastRow < 2) return;
//   for (let r = 2; r <= lastRow; r++) {
//     sheet.getRange(r, 7).setValue("Unpaid").setBackground("#fff2f2");
//   }
// }

// // =============================================================================
// // DASHBOARD
// // =============================================================================

// function updateGlobalDashboard() {
//   const ss       = SpreadsheetApp.getActiveSpreadsheet();
//   const tz       = _getTimezone(ss);
//   const dash     = ss.getSheetByName("Dashboard");
//   const now      = new Date();
//   const curMonth = Utilities.formatDate(now, tz, "MMM_yyyy");
//   const curSheet = ss.getSheetByName("Transactions_" + curMonth);

//   dash.clearContents();
//   dash.clearFormats();

//   let row = 1;

//   // ── Section 1: This Month ─────────────────────────────────────────────────
//   dash.getRange(row, 1, 1, 2)
//     .setValues([["📅 THIS MONTH — " + curMonth.replace("_", " "), ""]])
//     .setFontWeight("bold").setFontSize(12).setBackground("#4a86e8").setFontColor("white");
//   row++;

//   if (curSheet) {
//     const expense = curSheet.getRange("B2").getValue();
//     const income  = curSheet.getRange("B3").getValue();
//     const net     = curSheet.getRange("B4").getValue();
//     dash.getRange(row, 1, 3, 2).setValues([
//       ["Total Spent",  expense],
//       ["Total Income", income],
//       ["Net Balance",  net]
//     ]);
//     row += 3;
//   }
//   row++;

//   // ── Section 2: Budget ──────────────────────────────────────────────────────
//   dash.getRange(row, 1, 1, 4)
//     .setValues([["💰 BUDGET STATUS", "", "", ""]])
//     .setFontWeight("bold").setFontSize(11).setBackground("#6aa84f").setFontColor("white");
//   row++;
//   dash.getRange(row, 1, 1, 4)
//     .setValues([["Category", "Budget", "Spent", "% Used"]])
//     .setFontWeight("bold").setBackground("#d9ead3");
//   row++;

//   const budgetSheet = ss.getSheetByName("Budget");
//   if (budgetSheet && curSheet) {
//     _updateBudgetSpent(ss, curSheet, budgetSheet);
//     const budgetData = budgetSheet
//       .getRange(2, 1, budgetSheet.getLastRow() - 1, 4).getValues();
//     budgetData.forEach(([cat, budget, spent, pct]) => {
//       if (!cat) return;
//       dash.getRange(row, 1, 1, 4).setValues([[cat, budget, spent, pct]]);
//       if (typeof pct === "string" && pct.includes("%")) {
//         const num = parseInt(pct);
//         if (num > 100) dash.getRange(row, 1, 1, 4).setBackground("#fff2f2");
//         else if (num > 80) dash.getRange(row, 1, 1, 4).setBackground("#fff2cc");
//       }
//       row++;
//     });
//   }
//   row++;

//   // ── Section 3: Recurring ───────────────────────────────────────────────────
//   dash.getRange(row, 1, 1, 4)
//     .setValues([["🔁 RECURRING PAYMENTS", "", "", ""]])
//     .setFontWeight("bold").setFontSize(11).setBackground("#e69138").setFontColor("white");
//   row++;
//   dash.getRange(row, 1, 1, 4)
//     .setValues([["Name", "Amount", "Due Day", "Status"]])
//     .setFontWeight("bold").setBackground("#fce5cd");
//   row++;

//   const recurSheet = ss.getSheetByName("Settings_Recurring");
//   if (recurSheet && recurSheet.getLastRow() > 1) {
//     recurSheet.getRange(2, 1, recurSheet.getLastRow() - 1, 7).getValues()
//       .forEach(([name, amt, dueDay, , , , status]) => {
//         if (!name) return;
//         const s = status || "Unpaid";
//         dash.getRange(row, 1, 1, 4).setValues([[name, amt, dueDay, s]]);
//         dash.getRange(row, 4).setBackground(s === "Paid" ? "#d9ead3" : "#fff2f2");
//         row++;
//       });
//   }
//   row++;

//   // ── Section 4: Accounts ────────────────────────────────────────────────────
//   dash.getRange(row, 1, 1, 3)
//     .setValues([["🏦 ACCOUNT BALANCES", "", ""]])
//     .setFontWeight("bold").setFontSize(11).setBackground("#674ea7").setFontColor("white");
//   row++;
//   dash.getRange(row, 1, 1, 3)
//     .setValues([["Account", "Type", "Balance"]])
//     .setFontWeight("bold").setBackground("#d9d2e9");
//   row++;

//   const accSheet = ss.getSheetByName("Accounts");
//   if (accSheet && accSheet.getLastRow() > 1) {
//     accSheet.getRange(2, 1, accSheet.getLastRow() - 1, 4).getValues()
//       .forEach(([bank, type, , balance]) => {
//         if (!bank) return;
//         dash.getRange(row, 1, 1, 3).setValues([[`${bank} ${type}`, type, balance]]);
//         row++;
//       });
//   }
//   row++;

//   dash.getRange(row, 1, 1, 3)
//     .setValues([["💳 CREDIT CARDS", "", ""]])
//     .setFontWeight("bold").setFontSize(11).setBackground("#cc0000").setFontColor("white");
//   row++;
//   dash.getRange(row, 1, 1, 3)
//     .setValues([["Card", "Outstanding", "Available Limit"]])
//     .setFontWeight("bold").setBackground("#f4cccc");
//   row++;

//   const ccSheet = ss.getSheetByName("Accounts_CC");
//   if (ccSheet && ccSheet.getLastRow() > 1) {
//     ccSheet.getRange(2, 1, ccSheet.getLastRow() - 1, 7).getValues()
//       .forEach(([, cardName, last4, , , outstanding, available]) => {
//         if (!cardName) return;
//         dash.getRange(row, 1, 1, 3)
//           .setValues([[`${cardName} (...${last4})`, outstanding, available]]);
//         row++;
//       });
//   }
//   row++;

//   // ── Section 5: Monthly History ─────────────────────────────────────────────
//   dash.getRange(row, 1, 1, 3)
//     .setValues([["📊 MONTHLY HISTORY", "", ""]])
//     .setFontWeight("bold").setFontSize(11).setBackground("#37474f").setFontColor("white");
//   row++;
//   dash.getRange(row, 1, 1, 3)
//     .setValues([["Month", "Expense", "Income"]])
//     .setFontWeight("bold").setBackground("#eeeeee");
//   row++;

//   ss.getSheets()
//     .filter(s => s.getName().startsWith("Transactions_"))
//     .sort((a, b) => a.getName() > b.getName() ? -1 : 1)
//     .forEach(s => {
//       const label = s.getName().replace("Transactions_", "");
//       dash.getRange(row, 1, 1, 3).setValues([
//         [label, s.getRange("B2").getValue(), s.getRange("B3").getValue()]
//       ]);
//       row++;
//     });

//   dash.setColumnWidth(1, 230);
//   dash.setColumnWidth(2, 130);
//   dash.setColumnWidth(3, 130);
//   dash.setColumnWidth(4, 100);

//   _alert("✅ Dashboard updated!");
// }

// function _updateBudgetSpent(ss, curSheet, budgetSheet) {
//   const lastTxRow = curSheet.getLastRow();
//   if (lastTxRow < 6) return;

//   // Cols A-E: Timestamp, Type, Amount, Entity, Category
//   const txData     = curSheet.getRange(6, 1, lastTxRow - 5, 5).getValues();
//   const lastBudRow = budgetSheet.getLastRow();

//   for (let r = 2; r <= lastBudRow; r++) {
//     const cat = budgetSheet.getRange(r, 1).getValue();
//     if (!cat) continue;

//     const spent = txData
//       .filter(row => row[1] === "Debit" && row[4] === cat)
//       .reduce((sum, row) => sum + (row[2] || 0), 0);

//     const budget = budgetSheet.getRange(r, 2).getValue() || 0;
//     const pct    = budget > 0 ? Math.round((spent / budget) * 100) + "%" : "No budget set";

//     budgetSheet.getRange(r, 3).setValue(spent);
//     budgetSheet.getRange(r, 4).setValue(pct);
//   }
// }

// // =============================================================================
// // FORMATTING
// // =============================================================================

// function applyFormatting() {
//   const sheet = SpreadsheetApp.getActiveSheet();
//   if (!sheet.getName().startsWith("Transactions_")) return;
//   const lastRow = sheet.getLastRow();
//   if (lastRow < 6) return;

//   sheet.getRange(6, 1, lastRow - 5, 8).setBackground(null);
//   const data = sheet.getRange(6, 2, lastRow - 5, 1).getValues();
//   data.forEach((row, i) => {
//     const r = i + 6;
//     if      (row[0] === "Debit")      sheet.getRange(r, 1, 1, 8).setBackground("#fff2f2");
//     else if (row[0] === "Credit")     sheet.getRange(r, 1, 1, 8).setBackground("#f2fff2");
//     else if (row[0] === "CC_Payment") sheet.getRange(r, 1, 1, 8).setBackground("#e8f0fe");
//   });
// }

// // =============================================================================
// // UTILITIES
// // =============================================================================

// function _alert(msg) {
//   try {
//     SpreadsheetApp.getUi().alert(msg);
//   } catch (e) {
//     Logger.log("Alert suppressed: " + msg);
//   }
// }

// // =============================================================================
// // MENU + TRIGGERS
// // =============================================================================

// function onOpen() {
//   try {
//     SpreadsheetApp.getUi()
//       .createMenu("📊 FinTrack")
//       .addItem("Update Dashboard",             "updateGlobalDashboard")
//       .addItem("Format Current Sheet",         "applyFormatting")
//       .addItem("Refresh Account Balances",     "refreshAccountBalances")
//       .addItem("Refresh CC Balances",          "refreshCCBalances")
//       .addItem("Reset Recurring (New Month)",  "resetRecurringStatus")
//       .addItem("Re-run Initialization",        "initializeProject")
//       .addToUi();
//   } catch (e) {
//     Logger.log("onOpen UI unavailable: " + e);
//   }
// }

// /**
//  * Install once via:
//  * Triggers → Add Trigger → autoMonthlyReset → Time-driven → Month timer → Day 1
//  */
// function autoMonthlyReset() {
//   const ss  = SpreadsheetApp.getActiveSpreadsheet();
//   const tz  = _getTimezone(ss);
//   const now = new Date();
//   if (Utilities.formatDate(now, tz, "d") === "1") {
//     resetRecurringStatus();
//     refreshAccountBalances();
//     refreshCCBalances();
//   }
// }