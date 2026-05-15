/************************************************************
 * WEBHOOK
 * Handles incoming SMS data from the webhook and processes it.
 * It checks for duplicates, parses the SMS, and saves the transaction to the sheet.
 * It also checks for recurring payments and updates the status accordingly.
 * It also refreshes the account balances and credit card balances.
 * 
 ************************************************************/

const Webhook = {
    /************************************************************
     * HANDLE INCOMING SMS
     ************************************************************/
    doPost(e) {
        const lock = LockService.getScriptLock();

        try {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            const tz = Config.getTimezone(ss);
            const now = new Date();

            const monthName = Utilities.formatDate(now, tz, "MMM_yyyy");
            const sheetName = "Transactions_" + monthName;

            let sheet = ss.getSheetByName(sheetName);
            const isNewSheet = !sheet;
            if (isNewSheet) sheet = createMonthlySheet(ss, sheetName);

            const data = JSON.parse(e.postData.contents);
            const rawSms = data.message || "";
            const sender = data.sender || "";
            const smsId = data.smsId || "";

            // DUPLICATE CHECK
            if (smsId && isDuplicateSms(smsId)) {
                return jsonResponse({
                    status: "duplicate"
                });
            }

            // UNIVERSAL PARSER
            const parsed = parseSms(rawSms, sender);

            if (!parsed) {
                return jsonResponse({
                    status: "ignored",
                    reason: "unable to parse"
                });
            }

            // IGNORE NON-TRANSACTION SMS
            if (parsed.ignored) {
                return jsonResponse({
                    status: "ignored",
                    reason: parsed.reason
                });
            }

            // CONFIDENCE CHECK
            if (parsed.confidence < 0.5) {
                Logging.logUnknownSms(data, parsed);

                return jsonResponse({
                    status: "ignored",
                    reason: "low confidence"
                });
            }

            // EXTRA SAFETY CHECKS
            if (!parsed.amount || parsed.type === "Unknown") {
                Logging.logUnknownSms(data, parsed);

                return jsonResponse({
                    status: "ignored",
                    reason: "missing critical fields"
                });
            }


            const bank = resolveAccountDisplayName(ss, parsed.bank);

            const timeStr = Utilities.formatDate(now, tz, "HH:mm");
            const dayStr = Utilities.formatDate(now, tz, "EEE");
            const category = CgetSmartCategory(ss, entity, amount, timeStr, dayStr);

            // SAVE TO SHEET
            sheet.appendRow([
                now,
                parsed.type,
                parsed.amount,
                parsed.entity,
                category || parsed.category || "Misc",
                parsed.labels ? parsed.labels.join(", ") : "",
                bank || parsed.bank || "Unknown",
                rawSms
            ]);

            checkRecurringMatch(ss, now, parsed.amount, parsed.entity, category);

            if (isNewSheet) {
                refreshAccountBalances();
                refreshCCBalances();
            }

            return jsonResponse({
                status: "success",
                parsed: {
                    type: parsed.type,
                    amount: parsed.amount,
                    entity: parsed.entity,
                    bank: parsed.bank,
                    confidence: parsed.confidence
                }
            });

        } catch (err) {
            Logger.error(err);
            return jsonResponse({ status: "error", message: err.toString() });
        } finally {
            lock.releaseLock();
        }
    },

    checkRecurringMatch(ss, txDate, amount, entity, category) {
        const sheet = ss.getSheetByName("Settings_Recurring");
        if (!sheet) return;

        const data = sheet.getDataRange().getValues();
        const today = txDate.getDate();

        for (let i = 1; i < data.length; i++) {
            const [name, expectedAmt, dueDay, keyword, , , status] = data[i];
            if (!name || status === "Paid") continue;

            const dayMatch = Math.abs(today - dueDay) <= 3;
            const amountMatch = expectedAmt > 0 &&
                Math.abs(amount - expectedAmt) / expectedAmt <= 0.10;
            const entityMatch = keyword &&
                entity.toLowerCase().includes(keyword.toString().toLowerCase());

            if (dayMatch && amountMatch && entityMatch) {
                sheet.getRange(i + 1, 7).setValue("Paid").setBackground("#d9ead3");
                return;
            }
        }
    },

    isDuplicateSms(smsId) {
        if (!smsId) return false;

        const cache = CacheService.getScriptCache();

        const existing = cache.get(smsId);
        if (existing) return true;

        cache.put(smsId, "1", 21600);
        return false;
    },

    jsonResponse(obj) {
        return ContentService
            .createTextOutput(JSON.stringify(obj))
            .setMimeType(ContentService.MimeType.JSON);
    }
}