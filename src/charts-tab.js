/************************************************************
 * CHARTS TAB
 * Builds a "Charts" sheet with three charts, rebuilt from the
 * transaction rows each time (TraFin → Update Charts, and after
 * Update Dashboard):
 *   1. Spent vs income by month        (grouped columns)
 *   2. This month's spending by category (sorted bars)
 *   3. This month's top payees          (sorted bars)
 * Transfers and card bill payments are left out, like the
 * monthly summary. (Named ChartsTab because `Charts` is an
 * Apps Script built-in service.)
 ************************************************************/

const ChartsTab = {

    SHEET: "Charts",
    COLORS: { spent: "#f47230", income: "#257de0", cashOut: "#00b894", single: "#257de0" },
    EXCLUDED: ["Transfer", "CC Payment"],
    MONTHS: ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

    /** Pure: totals for one month's rows (TxSchema order). */
    summarize(rows) {
        // spent   = purchases, counted when made (card purchases included)
        // cashOut = money that actually left bank accounts: bank debits plus
        //           card bill payments; card purchases are not cash yet
        const out = { spent: 0, income: 0, cashOut: 0, untrackedOut: 0, untrackedIn: 0,
            byCategory: {}, byPayee: {} };
        const payeeNames = {}; // "blinkit" -> first spelling seen, so BLINKIT and Blinkit merge
        rows.forEach(r => {
            const type = r[1];
            const amount = Number(r[2]) || 0;
            const category = (r[4] || "Misc").toString();
            if (!r[0] || !amount) return;

            const onCard = /\(\.\.\.\w{4}\)$/.test((r[6] || "").toString().trim());
            if (type === "CC_Payment") { out.cashOut += amount; return; }
            if (ChartsTab.EXCLUDED.indexOf(category) >= 0) return;
            if (type === "Debit" && !onCard) out.cashOut += amount;
            if (category === "Untracked") {
                if (type === "Debit") out.untrackedOut += amount;
                else if (type === "Credit") out.untrackedIn += amount;
            }

            if (type === "Debit") {
                out.spent += amount;
                out.byCategory[category] = (out.byCategory[category] || 0) + amount;
                const raw = (r[3] || "Unknown").toString().replace(/\s+/g, " ").trim();
                const key = raw.toLowerCase();
                const payee = payeeNames[key] || (payeeNames[key] = raw);
                out.byPayee[payee] = (out.byPayee[payee] || 0) + amount;
            } else if (type === "Credit") {
                out.income += amount;
            }
        });
        return out;
    },

    /** Pure: largest `limit` entries of {name: value}, rest folded into "Other". */
    top(map, limit) {
        const sorted = Object.keys(map)
            .map(k => [k, Math.round(map[k] * 100) / 100])
            .sort((a, b) => b[1] - a[1]);
        const head = sorted.slice(0, limit);
        const rest = sorted.slice(limit).reduce((s, e) => s + e[1], 0);
        if (rest > 0) head.push(["Other", Math.round(rest * 100) / 100]);
        return head;
    },

    /** "Transactions_Nov_2026" -> sortable number 202611 */
    monthKey(sheetName) {
        const m = /^Transactions_(\w{3})_(\d{4})$/.exec(sheetName);
        if (!m) return 0;
        return Number(m[2]) * 100 + ChartsTab.MONTHS.indexOf(m[1]) + 1;
    },

    update(silent) {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const tz = Config.getTimezone(ss);
        const width = TxSchema.HEADERS.length;

        const months = ss.getSheets()
            .filter(s => ChartsTab.monthKey(s.getName()) > 0)
            .sort((a, b) => ChartsTab.monthKey(a.getName()) - ChartsTab.monthKey(b.getName()))
            .map(s => {
                const last = s.getLastRow();
                const rows = last >= 6 ? s.getRange(6, 1, last - 5, width).getValues() : [];
                return {
                    label: s.getName().replace("Transactions_", "").replace("_", " "),
                    name: s.getName(),
                    stats: ChartsTab.summarize(rows)
                };
            });
        if (months.length === 0) return;

        const currentName = "Transactions_" + Utilities.formatDate(new Date(), tz, "MMM_yyyy");
        const current = months.filter(m => m.name === currentName)[0] || months[months.length - 1];

        let sheet = ss.getSheetByName(ChartsTab.SHEET);
        if (!sheet) sheet = ss.insertSheet(ChartsTab.SHEET);
        sheet.getCharts().forEach(c => sheet.removeChart(c));
        sheet.clearContents();

        // ---- data tables (columns A-H); charts sit to the right from column J
        const monthly = [["Month", "Spent", "Income", "Cash out"]].concat(
            months.map(m => [m.label,
                Math.round(m.stats.spent * 100) / 100,
                Math.round(m.stats.income * 100) / 100,
                Math.round(m.stats.cashOut * 100) / 100]));
        const cats = [["Category", "Spent"]].concat(ChartsTab.top(current.stats.byCategory, 10));
        const payees = [["Payee", "Spent"]].concat(ChartsTab.top(current.stats.byPayee, 10));

        sheet.getRange(1, 1, monthly.length, 4).setValues(monthly);
        sheet.getRange(1, 5, cats.length, 2).setValues(cats);
        sheet.getRange(1, 7 + 1, payees.length, 2).setValues(payees);
        sheet.getRange("A1:I1").setFontWeight("bold");

        const text = { color: "#191919", fontSize: 12 };
        const muted = { color: "#666666", fontSize: 11 };
        const base = b => b
            .setOption("backgroundColor", "#ffffff")
            .setOption("titleTextStyle", { color: "#191919", fontSize: 14, bold: true })
            .setOption("hAxis", { textStyle: muted, gridlines: { color: "#eeeeee" } })
            .setOption("vAxis", { textStyle: muted, gridlines: { color: "#eeeeee" }, minValue: 0 })
            .setOption("width", 620)
            .setOption("height", 340);

        sheet.insertChart(base(sheet.newChart()
            .setChartType(Charts.ChartType.COLUMN)
            .addRange(sheet.getRange(1, 1, monthly.length, 4))
            .setNumHeaders(1)
            .setOption("title", "Spent, income and cash out by month (₹, transfers excluded)")
            .setOption("colors", [ChartsTab.COLORS.spent, ChartsTab.COLORS.income,
                ChartsTab.COLORS.cashOut])
            .setOption("legend", { position: "top", textStyle: text })
            .setPosition(1, 11, 0, 0)).build());

        if (cats.length > 1) {
            sheet.insertChart(base(sheet.newChart()
                .setChartType(Charts.ChartType.BAR)
                .addRange(sheet.getRange(1, 5, cats.length, 2))
                .setNumHeaders(1)
                .setOption("title", "Spending by category — " + current.label + " (₹)")
                .setOption("colors", [ChartsTab.COLORS.single])
                .setOption("legend", { position: "none" })
                .setPosition(19, 11, 0, 0)).build());
        }

        if (payees.length > 1) {
            sheet.insertChart(base(sheet.newChart()
                .setChartType(Charts.ChartType.BAR)
                .addRange(sheet.getRange(1, 8, payees.length, 2))
                .setNumHeaders(1)
                .setOption("title", "Top payees — " + current.label + " (₹)")
                .setOption("colors", [ChartsTab.COLORS.single])
                .setOption("legend", { position: "none" })
                .setPosition(37, 11, 0, 0)).build());
        }

        sheet.setColumnWidth(5, 170);
        sheet.setColumnWidth(8, 220);
        if (!silent) Main.alert("Charts updated — see the '" + ChartsTab.SHEET + "' tab.");
    }
};
