/************************************************************
 * BALANCE CHECK
 * Some SMS state the balance ("Avl Bal 7342.46") or the card's
 * available limit ("Avl limit INR 78048.24"). After such an SMS is
 * recorded, compare it with the sheet and write the result into the
 * "Balance Check" column, so drift is visible the day it starts.
 ************************************************************/

const BalanceCheck = {

    TOLERANCE: 1,

    TARGETS: {
        balance: { sheet: "Accounts", valueCol: 4, noteCol: 7, what: "balance",
            name: row => `${row[0]} ${row[1]}` },
        limit: { sheet: "Accounts_CC", valueCol: 7, noteCol: 12, what: "available limit",
            name: row => `${row[1]} (...${row[2]})` }
    },

    /** Pure: text for the Balance Check cell. */
    message(stated, sheetValue, what, stamp) {
        const diff = Math.round((stated - sheetValue) * 100) / 100;
        if (Math.abs(diff) <= BalanceCheck.TOLERANCE) {
            return "✓ Matches bank (" + stated.toFixed(2) + ") as of " + stamp;
        }
        return "⚠ " + stamp + ": bank says " + what + " " + stated.toFixed(2) +
            ", sheet says " + Number(sheetValue).toFixed(2) +
            " (difference " + (diff > 0 ? "+" : "") + diff.toFixed(2) +
            "). Something is missing — run TraFin → Reconcile Balances.";
    },

    afterSms(ss, tz, now, rawSms, bankDisplayName) {
        try {
            const stated = Parser.extractStatedBalance(rawSms);
            if (!stated || !bankDisplayName || bankDisplayName === "Other") return;

            const target = BalanceCheck.TARGETS[stated.kind];
            const sheet = ss.getSheetByName(target.sheet);
            if (!sheet || sheet.getLastRow() < 2) return;

            SpreadsheetApp.flush(); // let the balance formulas include the new row

            const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, target.valueCol).getValues();
            for (let i = 0; i < rows.length; i++) {
                if (!rows[i][0] || target.name(rows[i]) !== bankDisplayName) continue;

                const header = sheet.getRange(1, target.noteCol);
                if (!header.getValue()) header.setValue("Balance Check").setFontWeight("bold");

                const text = BalanceCheck.message(
                    stated.value, Number(rows[i][target.valueCol - 1]) || 0, target.what,
                    Utilities.formatDate(now, tz, "d MMM HH:mm")
                );
                sheet.getRange(i + 2, target.noteCol).setValue(text)
                    .setBackground(text.charAt(0) === "✓" ? "#d9ead3" : "#fff2cc");
                return;
            }
        } catch (err) {
            Logger.log("BalanceCheck error: " + err);
        }
    }
};
