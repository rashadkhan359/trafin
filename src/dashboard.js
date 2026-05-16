/************************************************************
 * DASHBOARD
 ************************************************************/


const Dashboard = {
    /************************************************************
     * UPDATE GLOBAL DASHBOARD
     ************************************************************/
    updateGlobalDashboard() {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const tz = Config.getTimezone(ss);
        const dash = ss.getSheetByName("Dashboard");
        const now = new Date();
        const curMonth = Utilities.formatDate(now, tz, "MMM_yyyy");
        const curSheet = ss.getSheetByName("Transactions_" + curMonth);

        dash.clearContents();
        dash.clearFormats();

        let row = 1;

        // ── Section 1: This Month ─────────────────────────────────────────────────
        dash.getRange(row, 1, 1, 2)
            .setValues([["📅 THIS MONTH — " + curMonth.replace("_", " "), ""]])
            .setFontWeight("bold").setFontSize(12).setBackground("#4a86e8").setFontColor("white");
        row++;

        if (curSheet) {
            const expense = curSheet.getRange("B2").getValue();
            const income = curSheet.getRange("B3").getValue();
            const net = curSheet.getRange("B4").getValue();
            dash.getRange(row, 1, 3, 2).setValues([
                ["Total Spent", expense],
                ["Total Income", income],
                ["Net Balance", net]
            ]);
            row += 3;
        }
        row++;

        // ── Section 2: Budget ──────────────────────────────────────────────────────
        dash.getRange(row, 1, 1, 4)
            .setValues([["💰 BUDGET STATUS", "", "", ""]])
            .setFontWeight("bold").setFontSize(11).setBackground("#6aa84f").setFontColor("white");
        row++;
        dash.getRange(row, 1, 1, 4)
            .setValues([["Category", "Budget", "Spent", "% Used"]])
            .setFontWeight("bold").setBackground("#d9ead3");
        row++;

        const budgetSheet = ss.getSheetByName("Budget");
        if (budgetSheet && curSheet) {
            Dashboard.updateBudgetSpent(ss, curSheet, budgetSheet);
            const budgetData = budgetSheet
                .getRange(2, 1, budgetSheet.getLastRow() - 1, 4).getValues();
            budgetData.forEach(([cat, budget, spent, pct]) => {
                if (!cat) return;
                dash.getRange(row, 1, 1, 4).setValues([[cat, budget, spent, pct]]);
                if (typeof pct === "string" && pct.includes("%")) {
                    const num = parseInt(pct);
                    if (num > 100) dash.getRange(row, 1, 1, 4).setBackground("#fff2f2");
                    else if (num > 80) dash.getRange(row, 1, 1, 4).setBackground("#fff2cc");
                }
                row++;
            });
        }
        row++;

        // ── Section 3: Recurring ───────────────────────────────────────────────────
        dash.getRange(row, 1, 1, 4)
            .setValues([["🔁 RECURRING PAYMENTS", "", "", ""]])
            .setFontWeight("bold").setFontSize(11).setBackground("#e69138").setFontColor("white");
        row++;
        dash.getRange(row, 1, 1, 4)
            .setValues([["Name", "Amount", "Due Day", "Status"]])
            .setFontWeight("bold").setBackground("#fce5cd");
        row++;

        const recurSheet = ss.getSheetByName("Settings_Recurring");
        if (recurSheet && recurSheet.getLastRow() > 1) {
            recurSheet.getRange(2, 1, recurSheet.getLastRow() - 1, 7).getValues()
                .forEach(([name, amt, dueDay, , , , status]) => {
                    if (!name) return;
                    const s = status || "Unpaid";
                    dash.getRange(row, 1, 1, 4).setValues([[name, amt, dueDay, s]]);
                    dash.getRange(row, 4).setBackground(s === "Paid" ? "#d9ead3" : "#fff2f2");
                    row++;
                });
        }
        row++;

        // ── Section 4: Accounts ────────────────────────────────────────────────────
        dash.getRange(row, 1, 1, 3)
            .setValues([["🏦 ACCOUNT BALANCES", "", ""]])
            .setFontWeight("bold").setFontSize(11).setBackground("#674ea7").setFontColor("white");
        row++;
        dash.getRange(row, 1, 1, 3)
            .setValues([["Account", "Type", "Balance"]])
            .setFontWeight("bold").setBackground("#d9d2e9");
        row++;

        const accSheet = ss.getSheetByName("Accounts");
        if (accSheet && accSheet.getLastRow() > 1) {
            accSheet.getRange(2, 1, accSheet.getLastRow() - 1, 4).getValues()
                .forEach(([bank, type, , balance]) => {
                    if (!bank) return;
                    dash.getRange(row, 1, 1, 3).setValues([[`${bank} ${type}`, type, balance]]);
                    row++;
                });
        }
        row++;

        dash.getRange(row, 1, 1, 3)
            .setValues([["💳 CREDIT CARDS", "", ""]])
            .setFontWeight("bold").setFontSize(11).setBackground("#cc0000").setFontColor("white");
        row++;
        dash.getRange(row, 1, 1, 3)
            .setValues([["Card", "Outstanding", "Available Limit"]])
            .setFontWeight("bold").setBackground("#f4cccc");
        row++;

        const ccSheet = ss.getSheetByName("Accounts_CC");
        if (ccSheet && ccSheet.getLastRow() > 1) {
            ccSheet.getRange(2, 1, ccSheet.getLastRow() - 1, 7).getValues()
                .forEach(([, cardName, last4, , , outstanding, available]) => {
                    if (!cardName) return;
                    dash.getRange(row, 1, 1, 3)
                        .setValues([[`${cardName} (...${last4})`, outstanding, available]]);
                    row++;
                });
        }
        row++;

        // ── Section 5: Monthly History ─────────────────────────────────────────────
        dash.getRange(row, 1, 1, 3)
            .setValues([["📊 MONTHLY HISTORY", "", ""]])
            .setFontWeight("bold").setFontSize(11).setBackground("#37474f").setFontColor("white");
        row++;
        dash.getRange(row, 1, 1, 3)
            .setValues([["Month", "Expense", "Income"]])
            .setFontWeight("bold").setBackground("#eeeeee");
        row++;

        ss.getSheets()
            .filter(s => s.getName().startsWith("Transactions_"))
            .sort((a, b) => a.getName() > b.getName() ? -1 : 1)
            .forEach(s => {
                const label = s.getName().replace("Transactions_", "");
                dash.getRange(row, 1, 1, 3).setValues([
                    [label, s.getRange("B2").getValue(), s.getRange("B3").getValue()]
                ]);
                row++;
            });

        dash.setColumnWidth(1, 230);
        dash.setColumnWidth(2, 130);
        dash.setColumnWidth(3, 130);
        dash.setColumnWidth(4, 100);

        Main.alert("✅ Dashboard updated!");
    },

    updateBudgetSpent(ss, curSheet, budgetSheet) {
        const lastTxRow = curSheet.getLastRow();
        if (lastTxRow < 6) return;

        // Cols A-E: Timestamp, Type, Amount, Entity, Category
        const txData = curSheet.getRange(6, 1, lastTxRow - 5, 5).getValues();
        const lastBudRow = budgetSheet.getLastRow();

        for (let r = 2; r <= lastBudRow; r++) {
            const cat = budgetSheet.getRange(r, 1).getValue();
            if (!cat) continue;

            const spent = txData
                .filter(row => row[1] === "Debit" && row[4] === cat)
                .reduce((sum, row) => sum + (row[2] || 0), 0);

            const budget = budgetSheet.getRange(r, 2).getValue() || 0;
            const pct = budget > 0 ? Math.round((spent / budget) * 100) + "%" : "No budget set";

            budgetSheet.getRange(r, 3).setValue(spent);
            budgetSheet.getRange(r, 4).setValue(pct);
        }
    }
}
