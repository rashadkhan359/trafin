/************************************************************
 * CLEANUP
 * One-off, user-triggered repair of existing Transactions_* sheets
 * using the current parser rules:
 *   - rows whose Raw SMS is not a real transaction (promos, reminders,
 *     "will be debited" notices...) are MOVED to the "Removed_SMS" sheet
 *   - exact duplicate rows (same Raw SMS in the same sheet) are moved too
 *   - Entity "Unknown", Category "Misc" and Bank "Other" are re-derived
 * Nothing is destroyed: moved rows can be copied back from Removed_SMS.
 * Rows without Raw SMS (typed by hand) are never touched.
 ************************************************************/

const Cleanup = {

    REMOVED_SHEET: "Removed_SMS",

    /************************************************************
     * PLAN (pure) — decide what to do with each data row.
     * rows: array of 8-column transaction rows (TxSchema order).
     * Returns [{ index, action: "keep"|"remove"|"update", reason, entity }]
     ************************************************************/
    plan(rows, validBankNames) {
        const seen = {};
        const valid = validBankNames || null;

        return rows.map((row, index) => {
            const rawSms = (row[7] || "").toString();
            if (!rawSms.trim()) return { index, action: "keep" };

            const parsed = Parser.parseSms(rawSms, "");
            const isTxn = parsed && !parsed.ignored && parsed.amount &&
                parsed.type !== "Unknown";
            if (!isTxn) {
                return { index, action: "remove", reason: "Not a transaction" };
            }

            const key = rawSms.replace(/\s+/g, " ").trim();
            if (seen[key]) {
                return { index, action: "remove", reason: "Duplicate" };
            }
            seen[key] = true;

            const entityNow = (row[3] || "").toString().trim();
            const needsEntity = (!entityNow || entityNow === "Unknown") &&
                parsed.entity && parsed.entity !== "Unknown";
            // "Other", or a card label that no longer exists (card was replaced)
            const bankNow = (row[6] || "").toString().trim();
            const needsBank = bankNow === "Other" ||
                (!!valid && /\(\.\.\.\w{4}\)$/.test(bankNow) && valid.indexOf(bankNow) === -1);
            const needsCategory = (row[4] || "").toString().trim() === "Misc";

            if (needsEntity || needsBank || needsCategory) {
                return {
                    index,
                    action: "update",
                    entity: needsEntity ? parsed.entity : entityNow,
                    entityChanged: needsEntity,
                    parserBank: needsBank ? parsed.bank : null,
                    recategorize: needsCategory
                };
            }
            return { index, action: "keep" };
        });
    },

    /************************************************************
     * RUN — apply the plan to every Transactions_* sheet.
     ************************************************************/
    run() {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const ui = SpreadsheetApp.getUi();

        const answer = ui.alert(
            "Clean up transactions",
            "This re-checks every row in all Transactions_* sheets against the " +
            "current SMS rules.\n\n" +
            "• Promo / reminder / duplicate rows are MOVED to the '" +
            Cleanup.REMOVED_SHEET + "' sheet (not destroyed).\n" +
            "• Unknown entities, Misc categories and 'Other' banks are filled in " +
            "where the SMS allows.\n\nContinue?",
            ui.ButtonSet.YES_NO
        );
        if (answer !== ui.Button.YES) return;

        const tz = Config.getTimezone(ss);
        const accounts = Config.getAccountsList(ss);
        const validNames = accounts.map(a => a.displayName);
        const tables = Categories.loadTables(ss);
        const width = TxSchema.HEADERS.length;
        let removed = 0, entities = 0, categories = 0, banks = 0;

        let removedSheet = ss.getSheetByName(Cleanup.REMOVED_SHEET);
        if (!removedSheet) {
            removedSheet = ss.insertSheet(Cleanup.REMOVED_SHEET);
            removedSheet.appendRow(
                ["Removed At", "From Sheet", "Reason"].concat(TxSchema.HEADERS)
            );
        }

        ss.getSheets()
            .filter(s => s.getName().startsWith("Transactions_"))
            .forEach(sheet => {
                const lastRow = sheet.getLastRow();
                if (lastRow < 6) return;

                const range = sheet.getRange(6, 1, lastRow - 5, width);
                const rows = range.getValues();
                const plan = Cleanup.plan(rows, validNames);
                const toDelete = [];
                const removedRows = [];

                plan.forEach(step => {
                    const row = rows[step.index];
                    const sheetRow = step.index + 6;

                    if (step.action === "remove") {
                        removedRows.push(
                            [new Date(), sheet.getName(), step.reason].concat(row)
                        );
                        toDelete.push(sheetRow);
                        return;
                    }
                    if (step.action !== "update") return;

                    if (step.entityChanged) {
                        sheet.getRange(sheetRow, 4).setValue(step.entity);
                        entities++;
                    }
                    if (step.parserBank) {
                        const name = Main.resolveAccountDisplayName(ss, step.parserBank, accounts);
                        if (name !== "Other") {
                            sheet.getRange(sheetRow, 7).setValue(name);
                            banks++;
                        }
                    }
                    if (step.recategorize) {
                        const when = row[0] instanceof Date ? row[0] : new Date();
                        const category = Categories.getSmartCategory(
                            ss, step.entity, Number(row[2]) || 0,
                            Utilities.formatDate(when, tz, "HH:mm"),
                            Utilities.formatDate(when, tz, "EEE"),
                            tables
                        );
                        if (category && category !== "Misc") {
                            sheet.getRange(sheetRow, 5).setValue(category);
                            categories++;
                        }
                    }
                });

                if (removedRows.length) {
                    removedSheet
                        .getRange(removedSheet.getLastRow() + 1, 1,
                            removedRows.length, removedRows[0].length)
                        .setValues(removedRows);
                }
                // bottom-up so row numbers stay valid
                toDelete.sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
                removed += toDelete.length;
            });

        Main.alert(
            "Cleanup finished.\n\n" +
            "Rows moved to " + Cleanup.REMOVED_SHEET + ": " + removed + "\n" +
            "Entities filled in: " + entities + "\n" +
            "Categories filled in: " + categories + "\n" +
            "Banks filled in: " + banks
        );
    }
};
