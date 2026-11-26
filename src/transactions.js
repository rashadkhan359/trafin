/************************************************************
 * TRANSACTIONS
 * Persistence layer for monthly transaction sheets.
 ************************************************************/

const Transactions = {

    /************************************************************
     * DUPLICATE CHECK (CacheService, 6h TTL)
     ************************************************************/
    isDuplicate(smsId, ttlSeconds) {
        if (!smsId) return false;

        const cache = CacheService.getScriptCache();
        const existing = cache.get(smsId);
        if (existing) return true;

        cache.put(smsId, "1", ttlSeconds || 21600);
        return false;
    },

    /************************************************************
     * CONTENT DUPLICATE CHECK (15 min window)
     * Banks sometimes deliver the exact same SMS twice from two sender IDs
     * (e.g. JK-KOTAKB-S and VK-KOTAKB-S), which the smsId|sender key cannot
     * catch. Two genuine transactions never share an identical body because
     * the UPI ref / available balance differs.
     ************************************************************/
    isDuplicateContent(rawSms) {
        if (!rawSms) return false;

        return Transactions.isDuplicate("body|" + Transactions.contentHash(rawSms), 900);
    },

    contentHash(rawSms) {
        const digest = Utilities.computeDigest(
            Utilities.DigestAlgorithm.MD5,
            (rawSms || "").replace(/\s+/g, " ").trim()
        );
        return Utilities.base64Encode(digest);
    },

    /************************************************************
     * MONTHLY SHEET — get or create Transactions_MMM_yyyy
     ************************************************************/
    getMonthlySheet(ss, now, tz) {
        const monthName = Utilities.formatDate(now, tz, "MMM_yyyy");
        const sheetName = "Transactions_" + monthName;

        let sheet = ss.getSheetByName(sheetName);
        const isNewSheet = !sheet;
        if (isNewSheet) {
            sheet = Sheet.createMonthlySheet(ss, sheetName);
        }

        return { sheet, isNewSheet, sheetName };
    },

    /************************************************************
     * BUILD ROW — delegates to TxSchema.toRow
     ************************************************************/
    buildRow(params) {
        const { now, parsed, category, bankDisplayName, rawSms } = params;

        return TxSchema.toRow(parsed, {
            now,
            category,
            bankDisplayName,
            rawSms
        });
    },

    /************************************************************
     * APPEND — write one transaction row to sheet.
     * If lowConfidence is true, highlights the row in orange so
     * the user can review it rather than the row being silently dropped.
     ************************************************************/
    append(ss, sheet, row, lowConfidence) {
        sheet.appendRow(row);
        if (lowConfidence) {
            const lastRow = sheet.getLastRow();
            sheet.getRange(lastRow, 1, 1, row.length).setBackground("#ffe0b2");
        }
        Sheet.ensureTransactionDropdowns(ss, sheet);
    },

    /************************************************************
     * SAVE — orchestrate sheet, row build, append, balance refresh
     ************************************************************/
    save(ss, params) {
        const { now, tz, parsed, category, bankDisplayName, rawSms, lowConfidence } = params;

        const { sheet, isNewSheet } = Transactions.getMonthlySheet(ss, now, tz);
        const row = Transactions.buildRow({
            now,
            parsed,
            category,
            bankDisplayName,
            rawSms
        });

        Transactions.append(ss, sheet, row, lowConfidence);

        if (isNewSheet) {
            Main.refreshAccountBalances();
            Main.refreshCCBalances();
        }

        return { sheet, isNewSheet };
    }
};
