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
            // Cash out = bank debits + card bill payments (card purchases are not cash yet)
            const lastTx = curSheet.getLastRow();
            const stats = ChartsTab.summarize(lastTx >= 6
                ? curSheet.getRange(6, 1, lastTx - 5, TxSchema.HEADERS.length).getValues()
                : []);
            dash.getRange(row, 1, 5, 2).setValues([
                ["Total Spent (purchases, incl. card)", expense],
                ["Total Income", income],
                ["Net Balance", net],
                ["Cash Out (left your bank accounts)", Math.round(stats.cashOut * 100) / 100],
                ["Net Cash (income − cash out)", Math.round((income - stats.cashOut) * 100) / 100]
            ]);
            row += 5;

            // Differences found by Reconcile Balances this month (already inside the totals above)
            if (stats.untrackedOut || stats.untrackedIn) {
                dash.getRange(row, 1, 2, 2).setValues([
                    ["Untracked money out (found at reconcile)", Math.round(stats.untrackedOut * 100) / 100],
                    ["Untracked money in (found at reconcile)", Math.round(stats.untrackedIn * 100) / 100]
                ]).setBackground("#fff2cc");
                row += 2;
            }
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

        Main.refreshRecurringStatus(ss);
        SpreadsheetApp.flush();

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

        dash.getRange(row, 1, 1, 5)
            .setValues([["💳 CREDIT CARDS", "", "", "", ""]])
            .setFontWeight("bold").setFontSize(11).setBackground("#cc0000").setFontColor("white");
        row++;
        dash.getRange(row, 1, 1, 5)
            .setValues([["Card", "Outstanding", "Available Limit", "Next Bill", "Pay By"]])
            .setFontWeight("bold").setBackground("#f4cccc");
        row++;

        // Adds the Statement Day / Due Day columns on older sheets (no data is changed)
        Sheet.setupAccountsCCSheet(ss);

        const ccSheet = ss.getSheetByName("Accounts_CC");
        if (ccSheet && ccSheet.getLastRow() > 1) {
            const today = Utilities.formatDate(now, tz, "yyyy-M-d").split("-").map(Number);
            ccSheet.getRange(2, 1, ccSheet.getLastRow() - 1, 11).getValues()
                .forEach(([, cardName, last4, , , outstanding, available, , , stmtDay, dueDay]) => {
                    if (!cardName) return;
                    const bill = Dashboard.nextDayOfMonth(today, stmtDay);
                    const due = Dashboard.nextDayOfMonth(today, dueDay);
                    // plain text, otherwise Sheets turns "5 Dec" into a date number
                    dash.getRange(row, 4, 1, 2).setNumberFormat("@");
                    dash.getRange(row, 1, 1, 5).setValues([[
                        `${cardName} (...${last4})`, outstanding, available,
                        bill ? bill.label : "set Statement Day",
                        due ? `${due.label} (${due.daysLeft} days left)` : "set Due Day"
                    ]]);
                    if (due && Number(outstanding) > 0 && due.daysLeft <= 5) {
                        dash.getRange(row, 5).setBackground("#fff2f2").setFontWeight("bold");
                    }
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
        dash.setColumnWidth(4, 130);
        dash.setColumnWidth(5, 200);

        try {
            ChartsTab.update(true);
        } catch (err) {
            Logger.log("Charts update failed: " + err);
        }

        Main.alert("✅ Dashboard updated!");
    },

    /************************************************************
     * Next date that falls on `day` of a month, counted from today.
     * today = [year, month(1-12), day]. Days past month end clamp to
     * the last day (e.g. 31 in a 30-day month). Returns null if unset.
     ************************************************************/
    nextDayOfMonth(today, day) {
        const d = Number(day);
        if (!d || d < 1 || d > 31) return null;

        const [y, m, t] = today;
        const pick = (year, monthIndex) => {
            const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
            return new Date(Date.UTC(year, monthIndex, Math.min(d, last)));
        };
        const start = new Date(Date.UTC(y, m - 1, t));
        let target = pick(y, m - 1);
        if (target < start) target = pick(y, m);

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return {
            label: target.getUTCDate() + " " + months[target.getUTCMonth()],
            daysLeft: Math.round((target - start) / 86400000)
        };
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
