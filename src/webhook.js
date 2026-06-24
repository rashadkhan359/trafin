/************************************************************
 * WEBHOOK
 * HTTP entry orchestration — parse, categorize, persist.
 ************************************************************/

const Webhook = {
    /************************************************************
     * HANDLE INCOMING SMS
     ************************************************************/
    handle(e) {
        const lock = LockService.getScriptLock();
        let lockAcquired = false;

        try {
            lock.waitLock(30000);
            lockAcquired = true;

            let data = {};
            if (e.postData && e.postData.contents) {
                try {
                    data = JSON.parse(e.postData.contents);
                } catch (parseErr) {
                    Logger.log("Webhook: invalid JSON body — " + parseErr);
                    return Webhook.jsonResponse({
                        status: "error",
                        message: "invalid JSON body"
                    });
                }
            }

            const auth = Security.validateWebhookSecret(e, data);
            if (!auth.valid) {
                Logger.log("Webhook: unauthorized — " + auth.reason);
                return Webhook.jsonResponse({
                    status: "unauthorized",
                    reason: auth.reason
                });
            }

            const ss = SpreadsheetApp.getActiveSpreadsheet();
            const tz = Config.getTimezone(ss);
            const now = new Date();

            const rawSms = data.message || "";
            const sender = data.sender || "";
            const smsId = data.smsId || "";

            Logger.log("Webhook: received SMS | sender=" + sender + " | smsId=" + smsId
                + " | message=" + rawSms.substring(0, 80));

            // Dedup key includes sender so that a self-transfer (same UPI ref in
            // both the debit bank's SMS and the credit bank's SMS) is NOT collapsed
            // into a single entry — they have different senders and are two distinct
            // transactions. Only a true re-delivery of the exact same SMS is skipped.
            const dedupKey = smsId ? (smsId + "|" + sender) : "";
            if (dedupKey && Transactions.isDuplicate(dedupKey)) {
                Logger.log("Webhook: duplicate dedupKey=" + dedupKey + " — skipping");
                return Webhook.jsonResponse({ status: "duplicate" });
            }

            const parsed = Parser.parseSms(rawSms, sender);

            if (!parsed) {
                Logger.log("Webhook: parseSms returned null — unable to parse | sender=" + sender);
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: "unable to parse"
                });
            }

            Logger.log("Webhook: parsed — type=" + parsed.type + " amount=" + parsed.amount
                + " entity=" + parsed.entity + " bank=" + parsed.bank
                + " confidence=" + parsed.confidence + " ignored=" + parsed.ignored);

            if (parsed.ignored) {
                Logger.log("Webhook: SMS ignored by parser — reason=" + parsed.reason);
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: parsed.reason
                });
            }

            // Missing amount or Unknown type: nothing useful to record — skip.
            if (!parsed.amount || parsed.type === "Unknown") {
                Logger.log("Webhook: missing critical fields — amount=" + parsed.amount
                    + " type=" + parsed.type + " | logging to Unknown_SMS");
                Logging.logUnknownSms(Security.redactRequestBody(data), parsed);
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: "missing critical fields"
                });
            }

            // Low confidence: still write to sheet but highlight the row in orange
            // so the user can review rather than silently losing the transaction.
            const lowConfidence = parsed.confidence < 0.5;
            if (lowConfidence) {
                Logger.log("Webhook: low confidence=" + parsed.confidence
                    + " — writing to sheet with orange highlight");
                Logging.logUnknownSms(Security.redactRequestBody(data), parsed);
            }

            const bankDisplayName = Main.resolveAccountDisplayName(ss, parsed.bank);

            const timeStr = Utilities.formatDate(now, tz, "HH:mm");
            const dayStr = Utilities.formatDate(now, tz, "EEE");
            const category = Categories.getSmartCategory(
                ss, parsed.entity, parsed.amount, timeStr, dayStr
            );

            Transactions.save(ss, {
                now,
                tz,
                parsed,
                category,
                bankDisplayName,
                rawSms,
                lowConfidence
            });

            Webhook.checkRecurringMatch(ss, now, parsed.amount, parsed.entity, category);

            Logger.log("Webhook: success — type=" + parsed.type + " amount=" + parsed.amount
                + " entity=" + parsed.entity + " lowConfidence=" + lowConfidence);

            return Webhook.jsonResponse({
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
            Logger.log("Webhook error: " + err);
            return Webhook.jsonResponse({ status: "error", message: err.toString() });
        } finally {
            if (lockAcquired) lock.releaseLock();
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

    jsonResponse(obj) {
        return ContentService
            .createTextOutput(JSON.stringify(obj))
            .setMimeType(ContentService.MimeType.JSON);
    }
};
