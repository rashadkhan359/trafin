/************************************************************
 * PAIRING
 * One payment can be reported several times: the bank SMS, the bank
 * app's notification and the UPI app's notification. Reports with the
 * same type + amount inside 15 minutes are grouped into one "slot",
 * and each source may join a slot only once — so two genuine payments
 * of the same amount still produce two rows.
 *
 * The best report wins the row: SMS (3) > notification that knows the
 * account (2) > any other notification (1).
 ************************************************************/

const Pairing = {

    WINDOW_MS: 15 * 60 * 1000,

    /************************************************************
     * claim(report) -> { action: "new" | "duplicate" | "upgraded" }
     * report: { source, rank, type, amount, raw, row, now }
     * "new"      caller must append the row
     * "duplicate" already recorded by a better/equal source
     * "upgraded" the existing row was overwritten with this report
     ************************************************************/
    claim(ss, tz, report) {
        const cache = CacheService.getScriptCache();
        const key = "pair|" + report.type + "|" + Number(report.amount).toFixed(2);
        const nowMs = report.now.getTime();

        let slots = [];
        try { slots = JSON.parse(cache.get(key) || "[]"); } catch (e) { slots = []; }
        slots = slots.filter(s => nowMs - s.t < Pairing.WINDOW_MS);

        const sheetName = "Transactions_" + Utilities.formatDate(report.now, tz, "MMM_yyyy");
        const slot = slots.find(s => s.src.indexOf(report.source) === -1);
        let action = "new";

        if (slot) {
            slot.src.push(report.source);
            action = "duplicate";
            if (report.rank > slot.rank &&
                Pairing.replaceRow(ss, slot.sheet, slot.raw, report.row)) {
                slot.rank = report.rank;
                slot.raw = report.raw;
                action = "upgraded";
            }
        } else {
            slots.push({
                src: [report.source], rank: report.rank, raw: report.raw,
                t: nowMs, sheet: sheetName
            });
        }

        cache.put(key, JSON.stringify(slots), 900);
        return { action };
    },

    /************************************************************
     * Overwrite the row whose Raw SMS equals oldRaw (searching the last
     * 80 rows). Keeps the original timestamp. Returns true if found.
     ************************************************************/
    replaceRow(ss, sheetName, oldRaw, newRow) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return false;

        const last = sheet.getLastRow();
        if (last < 6) return false;
        const start = Math.max(6, last - 79);
        const width = TxSchema.HEADERS.length;
        const values = sheet.getRange(start, 1, last - start + 1, width).getValues();

        for (let i = values.length - 1; i >= 0; i--) {
            if (values[i][7] === oldRaw) {
                const row = newRow.slice();
                row[0] = values[i][0];
                sheet.getRange(start + i, 1, 1, width).setValues([row]);
                return true;
            }
        }
        return false;
    }
};
