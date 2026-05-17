/************************************************************
 * DASHBOARD & ANALYTICS
 * Analytics sheet = aggregated data (batch-built, chart source)
 * Dashboard sheet = KPIs, summaries, native charts
 ************************************************************/

const Dashboard = {

    SHEET_DASHBOARD: "Dashboard",
    SHEET_ANALYTICS: "Analytics",
    TX_PREFIX: "Transactions_",
    DATA_START_ROW: 6,

    STYLE: {
        headerBg: "#37474f",
        headerFg: "#ffffff",
        kpiLabelBg: "#eceff1",
        kpiValueBg: "#ffffff",
        sectionBlue: "#4a86e8",
        sectionGreen: "#6aa84f",
        sectionOrange: "#e69138",
        sectionPurple: "#674ea7",
        sectionRed: "#cc0000",
        sectionTeal: "#00897b",
        sectionGray: "#37474f",
        subHeaderBg: "#eeeeee",
        warnBg: "#fff2cc",
        dangerBg: "#fff2f2",
        okBg: "#d9ead3"
    },

    ENTITY_TOP_N: 12,
    LABEL_TOP_N: 20,
    MONTHS_FOR_TREND: 24,

    /************************************************************
     * ENTRY — rebuild Analytics + Dashboard
     ************************************************************/
    updateGlobalDashboard() {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const dash = Dashboard._ensureSheet(ss, Dashboard.SHEET_DASHBOARD, 0);
        if (!dash) {
            Main.alert("Dashboard sheet could not be created.");
            return;
        }

        Dashboard.ensureAnalyticsSheet(ss);

        const ctx = Dashboard.getAllTransactions(ss);
        const meta = Dashboard.buildAnalyticsTables(ss, ctx);

        const curSheet = ss.getSheetByName(Dashboard.TX_PREFIX + ctx.curMonthKey);
        const budgetSheet = ss.getSheetByName("Budget");
        if (budgetSheet && curSheet) {
            Dashboard.updateBudgetSpent(ss, curSheet, budgetSheet);
        }

        Dashboard.removeAllCharts(dash);
        dash.clearContents();
        dash.clearFormats();

        const layout = Dashboard.refreshKPIs(dash, ctx);
        Dashboard.renderDashboardSections(ss, dash, ctx, layout.nextRow);
        Dashboard.buildCharts(ss, dash, meta, ctx);

        Dashboard.applyDashboardChrome(dash, layout.kpiEndRow);

        Main.alert("Dashboard updated!\n\nTransactions: " + ctx.all.length +
            "\nAnalytics sheet refreshed for charts.");
    },

    /************************************************************
     * READ all transaction rows (one getValues per monthly sheet)
     ************************************************************/
    getAllTransactions(ss) {
        const tz = Config.getTimezone(ss);
        const now = new Date();
        const curMonthKey = Utilities.formatDate(now, tz, "MMM_yyyy");
        const curMonthLabel = curMonthKey.replace("_", " ");

        const sheets = ss.getSheets()
            .filter(s => s.getName().indexOf(Dashboard.TX_PREFIX) === 0)
            .sort((a, b) => {
                const ka = a.getName().replace(Dashboard.TX_PREFIX, "");
                const kb = b.getName().replace(Dashboard.TX_PREFIX, "");
                return Dashboard._compareMonthKeys(ka, kb);
            });

        const all = [];
        const monthly = {};
        const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        sheets.forEach(sheet => {
            const monthKey = sheet.getName().replace(Dashboard.TX_PREFIX, "");
            const lastRow = sheet.getLastRow();
            if (lastRow < Dashboard.DATA_START_ROW) {
                monthly[monthKey] = { expense: 0, income: 0, net: 0 };
                return;
            }

            const numRows = lastRow - Dashboard.DATA_START_ROW + 1;
            const rows = sheet.getRange(
                Dashboard.DATA_START_ROW, 1, numRows, TxSchema.HEADERS.length
            ).getValues();

            let expense = 0;
            let income = 0;

            rows.forEach(row => {
                const type = (row[1] || "").toString();
                const amount = Dashboard._num(row[2]);
                if (!type || amount === 0) return;

                const tx = {
                    timestamp: row[0],
                    type: type,
                    amount: amount,
                    entity: (row[3] || "").toString().trim() || "(unknown)",
                    category: (row[4] || "").toString().trim() || "Misc",
                    labels: (row[5] || "").toString(),
                    bank: (row[6] || "").toString().trim() || "Unknown",
                    monthKey: monthKey
                };

                if (type === "Debit") expense += amount;
                else if (type === "Credit") income += amount;

                all.push(tx);
            });

            monthly[monthKey] = {
                expense: expense,
                income: income,
                net: income - expense
            };
        });

        const curMonthTx = all.filter(t => t.monthKey === curMonthKey);
        const curDebits = curMonthTx.filter(t => t.type === "Debit");
        const curCredits = curMonthTx.filter(t => t.type === "Credit");

        const curExpense = monthly[curMonthKey] ? monthly[curMonthKey].expense : 0;
        const curIncome = monthly[curMonthKey] ? monthly[curMonthKey].income : 0;
        const curNet = curIncome - curExpense;

        const topCategory = Dashboard._topByKey(curDebits, t => t.category);
        const topEntity = Dashboard._topByKey(curDebits, t => t.entity);

        const recurring = Dashboard._loadRecurring(ss, tz, now);

        return {
            tz: tz,
            now: now,
            curMonthKey: curMonthKey,
            curMonthLabel: curMonthLabel,
            all: all,
            monthly: monthly,
            curMonthTx: curMonthTx,
            curDebits: curDebits,
            curCredits: curCredits,
            curExpense: curExpense,
            curIncome: curIncome,
            curNet: curNet,
            topCategory: topCategory,
            topEntity: topEntity,
            recurring: recurring
        };
    },

    /************************************************************
     * ANALYTICS sheet — batch-written aggregation tables
     ************************************************************/
    buildAnalyticsTables(ss, ctx) {
        const sheet = Dashboard.ensureAnalyticsSheet(ss);
        sheet.clearContents();
        sheet.clearFormats();

        const meta = {};
        let row = 1;

        sheet.getRange(row, 1, 1, 4)
            .merge()
            .setValue("TraFin Analytics — auto-generated")
            .setFontWeight("bold")
            .setFontSize(12)
            .setBackground(Dashboard.STYLE.headerBg)
            .setFontColor(Dashboard.STYLE.headerFg);
        row++;

        sheet.getRange(row, 1, 2, 2).setValues([
            ["Last updated", Utilities.formatDate(ctx.now, ctx.tz, "yyyy-MM-dd HH:mm")],
            ["Transaction rows", ctx.all.length]
        ]).setFontStyle("italic");
        row += 2;

        // ── Monthly summary ──────────────────────────────────────
        row = Dashboard._analyticsSectionHeader(sheet, row, "MONTHLY SUMMARY");
        const monthRows = Dashboard._buildMonthlyRows(ctx);
        meta.monthly = Dashboard._writeTable(
            sheet, row, ["Month", "Expense", "Income", "Net"], monthRows
        );
        row = meta.monthly.endRow + 2;

        // ── Current month: category ──────────────────────────────
        row = Dashboard._analyticsSectionHeader(
            sheet, row, "CATEGORY SPEND — " + ctx.curMonthLabel
        );
        const catRows = Dashboard._aggregateRows(
            ctx.curDebits, t => t.category, Dashboard.LABEL_TOP_N
        );
        meta.categoryCur = Dashboard._writeTable(
            sheet, row, ["Category", "Amount"], catRows
        );
        row = meta.categoryCur.endRow + 2;

        // ── Top entities (current month) ───────────────────────────
        row = Dashboard._analyticsSectionHeader(
            sheet, row, "TOP MERCHANTS — " + ctx.curMonthLabel
        );
        const entRows = Dashboard._aggregateRows(
            ctx.curDebits, t => t.entity, Dashboard.ENTITY_TOP_N
        );
        meta.entityTop = Dashboard._writeTable(
            sheet, row, ["Entity", "Amount"], entRows
        );
        row = meta.entityTop.endRow + 2;

        // ── Bank spend (current month) ─────────────────────────────
        row = Dashboard._analyticsSectionHeader(
            sheet, row, "ACCOUNT SPEND — " + ctx.curMonthLabel
        );
        const bankRows = Dashboard._aggregateRows(
            ctx.curDebits, t => t.bank, Dashboard.ENTITY_TOP_N
        );
        meta.bankSpend = Dashboard._writeTable(
            sheet, row, ["Account", "Amount"], bankRows
        );
        row = meta.bankSpend.endRow + 2;

        // ── Labels (current month) ─────────────────────────────────
        row = Dashboard._analyticsSectionHeader(
            sheet, row, "LABEL TAGS — " + ctx.curMonthLabel
        );
        const labelRows = Dashboard._aggregateLabelRows(ctx.curDebits);
        meta.labels = Dashboard._writeTable(
            sheet, row, ["Label", "Amount", "Txn Count"], labelRows
        );
        row = meta.labels.endRow + 2;

        // ── Weekday (current month) ───────────────────────────────
        row = Dashboard._analyticsSectionHeader(
            sheet, row, "WEEKDAY SPEND — " + ctx.curMonthLabel
        );
        const weekdayRows = Dashboard._buildWeekdayRows(ctx);
        meta.weekday = Dashboard._writeTable(
            sheet, row, ["Weekday", "Amount"], weekdayRows
        );

        sheet.setColumnWidths(1, 4, 140);
        sheet.getRange(1, 1, sheet.getLastRow(), 4)
            .setVerticalAlignment("middle");

        const numRows = Math.max(
            meta.monthly.dataEnd - meta.monthly.dataStart + 1, 0
        );
        if (numRows > 0) {
            sheet.getRange(meta.monthly.dataStart, 2, numRows, 3)
                .setNumberFormat("#,##0.00");
        }

        return meta;
    },

    ensureAnalyticsSheet(ss) {
        return Dashboard._ensureSheet(ss, Dashboard.SHEET_ANALYTICS, 1);
    },

    /************************************************************
     * KPI block on Dashboard
     ************************************************************/
    refreshKPIs(dash, ctx) {
        let row = 1;

        dash.getRange(row, 1, 1, 4)
            .merge()
            .setValue("TraFin Dashboard — " + ctx.curMonthLabel)
            .setFontWeight("bold")
            .setFontSize(13)
            .setBackground(Dashboard.STYLE.sectionBlue)
            .setFontColor("#ffffff");
        row++;

        dash.getRange(row, 1, 1, 4)
            .merge()
            .setValue("Updated: " + Utilities.formatDate(ctx.now, ctx.tz, "dd MMM yyyy HH:mm"))
            .setFontSize(9)
            .setFontColor("#666666");
        row++;

        const recurTotal = ctx.recurring.totalMonthly || 0;
        const kpiData = [
            ["Total monthly spend", ctx.curExpense],
            ["Total monthly income", ctx.curIncome],
            ["Net cashflow", ctx.curNet],
            ["Top spending category", ctx.topCategory.name
                ? ctx.topCategory.name + " (" + Dashboard._fmtAmt(ctx.topCategory.amount) + ")"
                : "—"],
            ["Top merchant / entity", ctx.topEntity.name
                ? ctx.topEntity.name + " (" + Dashboard._fmtAmt(ctx.topEntity.amount) + ")"
                : "—"],
            ["Recurring commitments (est./mo)", recurTotal],
            ["Recurring items", ctx.recurring.count],
            ["Next recurring due", ctx.recurring.nextDueLabel || "—"]
        ];

        dash.getRange(row, 1, kpiData.length, 2).setValues(kpiData);
        dash.getRange(row, 1, kpiData.length, 1)
            .setFontWeight("bold")
            .setBackground(Dashboard.STYLE.kpiLabelBg);
        dash.getRange(row, 2, kpiData.length, 1)
            .setBackground(Dashboard.STYLE.kpiValueBg);
        dash.getRange(row, 2, 3, 1).setNumberFormat("#,##0.00");
        dash.getRange(row + 5, 2, 1, 1).setNumberFormat("#,##0.00");

        const netRow = row + 2;
        if (ctx.curNet < 0) {
            dash.getRange(netRow, 2).setBackground(Dashboard.STYLE.dangerBg);
        } else if (ctx.curNet > 0) {
            dash.getRange(netRow, 2).setBackground(Dashboard.STYLE.okBg);
        }

        const kpiEndRow = row + kpiData.length - 1;
        row = kpiEndRow + 2;

        return { kpiEndRow: kpiEndRow, nextRow: row };
    },

    /************************************************************
     * Dashboard tables — budget, recurring, accounts, labels, history
     ************************************************************/
    renderDashboardSections(ss, dash, ctx, startRow) {
        let row = startRow;

        row = Dashboard._renderBudgetSection(ss, dash, row, ctx);
        row = Dashboard._renderRecurringSection(dash, row, ctx);
        row = Dashboard._renderAccountsSection(ss, dash, row);
        row = Dashboard._renderLabelsSection(dash, row, ctx);
        row = Dashboard._renderMonthlyHistorySection(dash, row, ctx);

        dash.getRange(1, 1, row, 6).setWrap(true);
    },

    /************************************************************
     * Native charts (source = Analytics ranges)
     ************************************************************/
    buildCharts(ss, dash, meta, ctx) {
        const analytics = ss.getSheetByName(Dashboard.SHEET_ANALYTICS);
        if (!analytics || !meta) return;

        const chartCol = 6;
        let chartRow = 2;

        if (meta.monthly && meta.monthly.dataEnd >= meta.monthly.dataStart) {
            Dashboard.createOrUpdateChart(dash, analytics, {
                title: "Monthly spending trend",
                type: Charts.ChartType.LINE,
                range: analytics.getRange(
                    meta.monthly.dataStart, 1,
                    meta.monthly.dataEnd - meta.monthly.dataStart + 1, 2
                ),
                anchorRow: chartRow,
                anchorCol: chartCol,
                width: 480,
                height: 260,
                seriesOption: { 0: { color: "#e53935", lineWidth: 2 } }
            });
            chartRow += 14;

            const monthRows = meta.monthly.dataEnd - meta.monthly.dataStart + 1;
            Dashboard.createOrUpdateChart(dash, analytics, {
                title: "Income vs expense",
                type: Charts.ChartType.LINE,
                range: analytics.getRange(meta.monthly.dataStart, 1, monthRows, 3),
                anchorRow: chartRow,
                anchorCol: chartCol,
                width: 480,
                height: 260
            });
            chartRow += 14;
        }

        if (meta.categoryCur && meta.categoryCur.dataEnd >= meta.categoryCur.dataStart) {
            Dashboard.createOrUpdateChart(dash, analytics, {
                title: "Category distribution (" + ctx.curMonthLabel + ")",
                type: Charts.ChartType.PIE,
                range: analytics.getRange(
                    meta.categoryCur.dataStart, 1,
                    meta.categoryCur.dataEnd - meta.categoryCur.dataStart + 1, 2
                ),
                anchorRow: chartRow,
                anchorCol: chartCol,
                width: 400,
                height: 280,
                pieHole: 0.4
            });
            chartRow += 15;
        }

        if (meta.entityTop && meta.entityTop.dataEnd >= meta.entityTop.dataStart) {
            Dashboard.createOrUpdateChart(dash, analytics, {
                title: "Top merchants (" + ctx.curMonthLabel + ")",
                type: Charts.ChartType.BAR,
                range: analytics.getRange(
                    meta.entityTop.dataStart, 1,
                    meta.entityTop.dataEnd - meta.entityTop.dataStart + 1, 2
                ),
                anchorRow: chartRow,
                anchorCol: chartCol,
                width: 480,
                height: 300,
                legend: { position: "none" }
            });
            chartRow += 16;
        }

        if (meta.bankSpend && meta.bankSpend.dataEnd >= meta.bankSpend.dataStart) {
            Dashboard.createOrUpdateChart(dash, analytics, {
                title: "Account-wise spending (" + ctx.curMonthLabel + ")",
                type: Charts.ChartType.COLUMN,
                range: analytics.getRange(
                    meta.bankSpend.dataStart, 1,
                    meta.bankSpend.dataEnd - meta.bankSpend.dataStart + 1, 2
                ),
                anchorRow: chartRow,
                anchorCol: chartCol,
                width: 440,
                height: 280,
                legend: { position: "none" }
            });
            chartRow += 15;
        }

        if (meta.weekday && meta.weekday.dataEnd >= meta.weekday.dataStart) {
            Dashboard.createOrUpdateChart(dash, analytics, {
                title: "Weekday spending (" + ctx.curMonthLabel + ")",
                type: Charts.ChartType.COLUMN,
                range: analytics.getRange(
                    meta.weekday.dataStart, 1,
                    meta.weekday.dataEnd - meta.weekday.dataStart + 1, 2
                ),
                anchorRow: chartRow,
                anchorCol: chartCol,
                width: 400,
                height: 240,
                legend: { position: "none" }
            });
        }
    },

    createOrUpdateChart(dash, _sourceSheet, opts) {
        const builder = dash.newChart()
            .setChartType(opts.type)
            .setPosition(opts.anchorRow, opts.anchorCol, 0, 0)
            .setOption("title", opts.title)
            .setOption("width", opts.width || 400)
            .setOption("height", opts.height || 250);

        if (opts.ranges && opts.ranges.length) {
            opts.ranges.forEach(r => builder.addRange(r));
        } else if (opts.range) {
            builder.addRange(opts.range);
        }

        if (opts.legend) builder.setOption("legend", opts.legend);
        if (opts.pieHole != null) builder.setOption("pieHole", opts.pieHole);
        if (opts.seriesOption) builder.setOption("series", opts.seriesOption);

        builder.setNumHeaders(1);
        dash.insertChart(builder.build());
    },

    removeAllCharts(sheet) {
        if (!sheet) return;
        sheet.getCharts().forEach(c => sheet.removeChart(c));
    },

    applyDashboardChrome(dash, freezeAfterRow) {
        dash.setColumnWidth(1, 240);
        dash.setColumnWidth(2, 160);
        dash.setColumnWidth(3, 130);
        dash.setColumnWidth(4, 110);
        dash.setColumnWidth(5, 40);
        dash.setColumnWidth(6, 120);
        dash.setFrozenRows(Math.min(freezeAfterRow || 2, 12));
    },

    /************************************************************
     * Budget spent — batch update Budget sheet
     ************************************************************/
    updateBudgetSpent(ss, curSheet, budgetSheet) {
        const lastTxRow = curSheet.getLastRow();
        if (lastTxRow < Dashboard.DATA_START_ROW) return;

        const numRows = lastTxRow - Dashboard.DATA_START_ROW + 1;
        const txData = curSheet.getRange(
            Dashboard.DATA_START_ROW, 1, numRows, 5
        ).getValues();

        const lastBudRow = budgetSheet.getLastRow();
        if (lastBudRow < 2) return;

        const budRows = budgetSheet.getRange(2, 1, lastBudRow - 1, 2).getValues();
        const spentUpdates = [];

        budRows.forEach(([cat, budget]) => {
            if (!cat) {
                spentUpdates.push(["", ""]);
                return;
            }
            const spent = txData
                .filter(row => row[1] === "Debit" && row[4] === cat)
                .reduce((sum, row) => sum + Dashboard._num(row[2]), 0);
            const b = Dashboard._num(budget);
            const pct = b > 0
                ? Math.round((spent / b) * 100) + "%"
                : "No budget set";
            spentUpdates.push([spent, pct]);
        });

        if (spentUpdates.length > 0) {
            budgetSheet.getRange(2, 3, spentUpdates.length, 2).setValues(spentUpdates);
        }
    },

    // ── Private: section renderers ─────────────────────────────────

    _renderBudgetSection(ss, dash, row, ctx) {
        row = Dashboard._sectionHeader(dash, row, 4, "BUDGET STATUS",
            Dashboard.STYLE.sectionGreen);
        dash.getRange(row, 1, 1, 4)
            .setValues([["Category", "Budget", "Spent", "% Used"]])
            .setFontWeight("bold")
            .setBackground("#d9ead3");
        row++;

        const budgetSheet = ss.getSheetByName("Budget");
        const body = [];
        if (budgetSheet && budgetSheet.getLastRow() > 1) {
            budgetSheet.getRange(2, 1, budgetSheet.getLastRow() - 1, 4).getValues()
                .forEach(([cat, budget, spent, pct]) => {
                    if (!cat) return;
                    body.push([cat, budget, spent, pct]);
                });
        }
        if (body.length) {
            dash.getRange(row, 1, body.length, 4).setValues(body);
            body.forEach((line, i) => {
                const pct = line[3];
                if (typeof pct === "string" && pct.indexOf("%") !== -1) {
                    const num = parseInt(pct, 10);
                    if (num > 100) dash.getRange(row + i, 1, 1, 4).setBackground(Dashboard.STYLE.dangerBg);
                    else if (num > 80) dash.getRange(row + i, 1, 1, 4).setBackground(Dashboard.STYLE.warnBg);
                }
            });
            row += body.length;
        } else {
            dash.getRange(row, 1).setValue("No budget data");
            row++;
        }
        return row + 1;
    },

    _renderRecurringSection(dash, row, ctx) {
        row = Dashboard._sectionHeader(dash, row, 5, "RECURRING PAYMENTS",
            Dashboard.STYLE.sectionOrange);
        dash.getRange(row, 1, 1, 5)
            .setValues([["Name", "Amount", "Due day", "Next due", "Status"]])
            .setFontWeight("bold")
            .setBackground("#fce5cd");
        row++;

        const body = ctx.recurring.items.map(item => [
            item.name, item.amount, item.dueDay, item.nextDue, item.status
        ]);

        if (body.length) {
            dash.getRange(row, 1, body.length, 5).setValues(body);
            body.forEach((line, i) => {
                const status = (line[4] || "").toString();
                dash.getRange(row + i, 5).setBackground(
                    status === "Paid" ? Dashboard.STYLE.okBg : Dashboard.STYLE.dangerBg
                );
            });
            row += body.length;
        } else {
            dash.getRange(row, 1).setValue("No recurring payments configured");
            row++;
        }

        if (ctx.recurring.totalMonthly > 0) {
            dash.getRange(row, 1, 1, 2)
                .setValues([["Est. monthly recurring total", ctx.recurring.totalMonthly]])
                .setFontWeight("bold");
            dash.getRange(row, 2).setNumberFormat("#,##0.00");
            row++;
        }
        return row + 1;
    },

    _renderAccountsSection(ss, dash, row) {
        row = Dashboard._sectionHeader(dash, row, 3, "ACCOUNT BALANCES",
            Dashboard.STYLE.sectionPurple);
        dash.getRange(row, 1, 1, 3)
            .setValues([["Account", "Type", "Balance"]])
            .setFontWeight("bold")
            .setBackground("#d9d2e9");
        row++;

        const accSheet = ss.getSheetByName("Accounts");
        const accBody = [];
        if (accSheet && accSheet.getLastRow() > 1) {
            accSheet.getRange(2, 1, accSheet.getLastRow() - 1, 4).getValues()
                .forEach(([bank, type, , balance]) => {
                    if (!bank) return;
                    accBody.push([bank + " " + type, type, balance]);
                });
        }
        if (accBody.length) {
            dash.getRange(row, 1, accBody.length, 3).setValues(accBody);
            dash.getRange(row, 3, accBody.length, 1).setNumberFormat("#,##0.00");
            row += accBody.length;
        } else {
            dash.getRange(row, 1).setValue("No accounts configured");
            row++;
        }
        row++;

        row = Dashboard._sectionHeader(dash, row, 3, "CREDIT CARDS",
            Dashboard.STYLE.sectionRed);
        dash.getRange(row, 1, 1, 3)
            .setValues([["Card", "Outstanding", "Available limit"]])
            .setFontWeight("bold")
            .setBackground("#f4cccc");
        row++;

        const ccSheet = ss.getSheetByName("Accounts_CC");
        const ccBody = [];
        if (ccSheet && ccSheet.getLastRow() > 1) {
            ccSheet.getRange(2, 1, ccSheet.getLastRow() - 1, 7).getValues()
                .forEach(([, cardName, last4, , , outstanding, available]) => {
                    if (!cardName) return;
                    ccBody.push([cardName + " (... " + last4 + ")", outstanding, available]);
                });
        }
        if (ccBody.length) {
            dash.getRange(row, 1, ccBody.length, 3).setValues(ccBody);
            dash.getRange(row, 2, ccBody.length, 2).setNumberFormat("#,##0.00");
            row += ccBody.length;
        } else {
            dash.getRange(row, 1).setValue("No credit cards configured");
            row++;
        }
        return row + 1;
    },

    _renderLabelsSection(dash, row, ctx) {
        row = Dashboard._sectionHeader(dash, row, 3, "LABEL ANALYTICS — " + ctx.curMonthLabel,
            Dashboard.STYLE.sectionTeal);
        dash.getRange(row, 1, 1, 3)
            .setValues([["Label", "Spend", "Transactions"]])
            .setFontWeight("bold")
            .setBackground("#b2dfdb");
        row++;

        const labelMap = Dashboard._labelAggregation(ctx.curDebits);
        const entries = Object.keys(labelMap)
            .map(k => ({
                label: k,
                amount: labelMap[k].amount,
                count: labelMap[k].count
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, Dashboard.LABEL_TOP_N);

        if (entries.length) {
            const body = entries.map(e => [e.label, e.amount, e.count]);
            dash.getRange(row, 1, body.length, 3).setValues(body);
            dash.getRange(row, 2, body.length, 1).setNumberFormat("#,##0.00");
            row += body.length;
        } else {
            dash.getRange(row, 1, 1, 3).setValues([[
                "(no labels yet)",
                "",
                "Try #trip #office #family #reimbursable in Labels column"
            ]]).setFontStyle("italic").setFontColor("#666666");
            row++;
        }
        return row + 1;
    },

    _renderMonthlyHistorySection(dash, row, ctx) {
        row = Dashboard._sectionHeader(dash, row, 3, "MONTHLY HISTORY",
            Dashboard.STYLE.sectionGray);
        dash.getRange(row, 1, 1, 4)
            .setValues([["Month", "Expense", "Income", "Net"]])
            .setFontWeight("bold")
            .setBackground(Dashboard.STYLE.subHeaderBg);
        row++;

        const keys = Object.keys(ctx.monthly).sort(Dashboard._compareMonthKeys).reverse();
        const limited = keys.slice(0, Dashboard.MONTHS_FOR_TREND);
        const body = limited.map(k => {
            const m = ctx.monthly[k];
            return [k.replace("_", " "), m.expense, m.income, m.net];
        });

        if (body.length) {
            dash.getRange(row, 1, body.length, 4).setValues(body);
            dash.getRange(row, 2, body.length, 3).setNumberFormat("#,##0.00");
            row += body.length;
        } else {
            dash.getRange(row, 1).setValue("No transaction history yet");
            row++;
        }
        return row;
    },

    // ── Private: analytics builders ────────────────────────────────

    _buildMonthlyRows(ctx) {
        const keys = Object.keys(ctx.monthly).sort(Dashboard._compareMonthKeys);
        const recent = keys.slice(-Dashboard.MONTHS_FOR_TREND);
        return recent.map(k => {
            const m = ctx.monthly[k];
            return [k.replace("_", " "), m.expense, m.income, m.net];
        });
    },

    _buildWeekdayRows(ctx) {
        const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const totals = {};
        order.forEach(d => { totals[d] = 0; });

        ctx.curDebits.forEach(tx => {
            const day = Dashboard._weekdayLabel(tx.timestamp, ctx.tz);
            if (totals[day] != null) totals[day] += tx.amount;
        });

        return order.map(d => [d, totals[d]]);
    },

    _aggregateRows(items, keyFn, limit) {
        const map = {};
        items.forEach(item => {
            const k = keyFn(item);
            map[k] = (map[k] || 0) + item.amount;
        });
        return Object.keys(map)
            .map(k => [k, map[k]])
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit || 99);
    },

    _aggregateLabelRows(debits) {
        const map = Dashboard._labelAggregation(debits);
        return Object.keys(map)
            .map(k => [k, map[k].amount, map[k].count])
            .sort((a, b) => b[1] - a[1])
            .slice(0, Dashboard.LABEL_TOP_N);
    },

    _labelAggregation(debits) {
        const map = {};
        debits.forEach(tx => {
            const tags = Dashboard._extractLabels(tx.labels);
            if (!tags.length) return;
            tags.forEach(tag => {
                if (!map[tag]) map[tag] = { amount: 0, count: 0 };
                map[tag].amount += tx.amount;
                map[tag].count += 1;
            });
        });
        return map;
    },

    _extractLabels(labelsStr) {
        if (!labelsStr) return [];
        const tags = [];
        labelsStr.toString().split(/[,;]+/).forEach(part => {
            const p = part.trim();
            if (!p) return;
            const hash = p.match(/#[\w-]+/gi);
            if (hash) {
                hash.forEach(h => tags.push(h.toLowerCase()));
            } else if (p.charAt(0) === "#") {
                tags.push(p.toLowerCase());
            } else {
                tags.push(p.toLowerCase());
            }
        });
        return tags;
    },

    _loadRecurring(ss, tz, now) {
        const sheet = ss.getSheetByName("Settings_Recurring");
        const result = {
            items: [],
            count: 0,
            totalMonthly: 0,
            nextDue: null,
            nextDueLabel: ""
        };
        if (!sheet || sheet.getLastRow() < 2) return result;

        sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues()
            .forEach(([name, amt, dueDay, , , , status]) => {
                if (!name) return;
                const amount = Dashboard._num(amt);
                const nextDue = Dashboard._nextDueDate(dueDay, now, tz);
                const nextDate = nextDue ? nextDue.date : null;

                result.items.push({
                    name: name,
                    amount: amount,
                    dueDay: dueDay,
                    nextDue: nextDue ? nextDue.label : "—",
                    status: status || "Unpaid"
                });
                result.count += 1;
                result.totalMonthly += amount;

                if (nextDate && (!result.nextDue || nextDate < result.nextDue)) {
                    result.nextDue = nextDate;
                    result.nextDueLabel = name + " — " + nextDue.label;
                }
            });

        result.items.sort((a, b) => {
            const da = Dashboard._parseDueSort(a.nextDue);
            const db = Dashboard._parseDueSort(b.nextDue);
            return da - db;
        });

        return result;
    },

    _nextDueDate(dueDay, now, tz) {
        const day = parseInt(dueDay, 10);
        if (!day || day < 1 || day > 31) return null;

        let year = now.getFullYear();
        let month = now.getMonth();
        let candidate = Dashboard._dateWithDay(year, month, day);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (candidate < today) {
            month += 1;
            if (month > 11) {
                month = 0;
                year += 1;
            }
            candidate = Dashboard._dateWithDay(year, month, day);
        }

        return {
            date: candidate,
            label: Utilities.formatDate(candidate, tz, "dd MMM yyyy")
        };
    },

    _dateWithDay(year, month, day) {
        const dim = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(day, dim));
    },

    _weekdayLabel(timestamp, tz) {
        if (!timestamp) return "Mon";
        const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        try {
            const dow = parseInt(Utilities.formatDate(d, tz, "u"), 10);
            if (dow >= 1 && dow <= 7) return names[dow % 7];
        } catch (e) { /* fall through */ }
        return names[d.getDay()];
    },

    _topByKey(items, keyFn) {
        const map = {};
        items.forEach(item => {
            const k = keyFn(item);
            map[k] = (map[k] || 0) + item.amount;
        });
        let best = { name: "", amount: 0 };
        Object.keys(map).forEach(k => {
            if (map[k] > best.amount) best = { name: k, amount: map[k] };
        });
        return best;
    },

    _writeTable(sheet, startRow, headers, dataRows) {
        const headerRow = startRow;
        sheet.getRange(headerRow, 1, 1, headers.length)
            .setValues([headers])
            .setFontWeight("bold")
            .setBackground(Dashboard.STYLE.subHeaderBg);

        const dataStart = headerRow + 1;
        let dataEnd = headerRow;

        if (dataRows && dataRows.length > 0) {
            sheet.getRange(dataStart, 1, dataRows.length, headers.length)
                .setValues(dataRows);
            dataEnd = dataStart + dataRows.length - 1;
            if (headers.length >= 2) {
                sheet.getRange(dataStart, 2, dataRows.length, headers.length - 1)
                    .setNumberFormat("#,##0.00");
            }
        }

        return {
            headerRow: headerRow,
            dataStart: dataStart,
            dataEnd: dataEnd,
            endRow: Math.max(dataEnd, headerRow)
        };
    },

    _analyticsSectionHeader(sheet, row, title) {
        sheet.getRange(row, 1, 1, 4)
            .merge()
            .setValue(title)
            .setFontWeight("bold")
            .setBackground("#cfd8dc");
        return row + 1;
    },

    _sectionHeader(dash, row, cols, title, bg) {
        dash.getRange(row, 1, 1, cols)
            .merge()
            .setValue(title)
            .setFontWeight("bold")
            .setFontSize(11)
            .setBackground(bg)
            .setFontColor("#ffffff");
        return row + 1;
    },

    _ensureSheet(ss, name, index) {
        let sheet = ss.getSheetByName(name);
        if (!sheet) {
            sheet = ss.insertSheet(name, index != null ? index : ss.getSheets().length);
        }
        return sheet;
    },

    _num(val) {
        const n = parseFloat(val);
        return isNaN(n) ? 0 : n;
    },

    _fmtAmt(n) {
        return (Math.round(n * 100) / 100).toLocaleString("en-IN");
    },

    _parseDueSort(label) {
        if (!label || label === "—") return 99999999;
        try {
            return new Date(label).getTime() || 99999999;
        } catch (e) {
            return 99999999;
        }
    },

    _compareMonthKeys(a, b) {
        const da = Dashboard._monthKeyToDate(a);
        const db = Dashboard._monthKeyToDate(b);
        if (!da && !db) return 0;
        if (!da) return -1;
        if (!db) return 1;
        return da.getTime() - db.getTime();
    },

    _monthKeyToDate(key) {
        if (!key) return null;
        const parts = key.split("_");
        if (parts.length < 2) return null;
        const mon = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        const m = mon[parts[0]];
        const y = parseInt(parts[1], 10);
        if (m == null || isNaN(y)) return null;
        return new Date(y, m, 1);
    }
};
