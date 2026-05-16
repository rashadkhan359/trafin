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
                    return Webhook.jsonResponse({
                        status: "error",
                        message: "invalid JSON body"
                    });
                }
            }

            const auth = Security.validateWebhookSecret(e, data);
            if (!auth.valid) {
                Logger.log("Webhook unauthorized: " + auth.reason);
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

            if (smsId && Transactions.isDuplicate(smsId)) {
                return Webhook.jsonResponse({ status: "duplicate" });
            }

            const parsed = Parser.parseSms(rawSms, sender);

            if (!parsed) {
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: "unable to parse"
                });
            }

            if (parsed.ignored) {
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: parsed.reason
                });
            }

            if (parsed.confidence < 0.5) {
                Logging.logUnknownSms(Security.redactRequestBody(data), parsed);
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: "low confidence"
                });
            }

            if (!parsed.amount || parsed.type === "Unknown") {
                Logging.logUnknownSms(Security.redactRequestBody(data), parsed);
                return Webhook.jsonResponse({
                    status: "ignored",
                    reason: "missing critical fields"
                });
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
                rawSms
            });

            Webhook.checkRecurringMatch(ss, now, parsed.amount, parsed.entity, category);

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
