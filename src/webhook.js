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
                    data = JSON.parse(e.postData.contents) || {};
                } catch (parseErr) {
                    Logger.log("Webhook: invalid JSON body — " + parseErr);
                    return Webhook.jsonResponse({
                        status: "error",
                        message: "invalid JSON body"
                    });
                }
            }

            // URL query parameters are merged in (body wins). App notifications are
            // sent this way because their text can contain quotes / line breaks that
            // would break a hand-built JSON body.
            data = Object.assign({}, (e && e.parameter) || {}, data);

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

            if (data.source === "notification") {
                return Webhook.handleNotification(ss, data, now, tz);
            }

            const rawSms = data.message || "";
            const sender = data.sender || "";
            const smsId = data.smsId || "";

            Logger.log("Webhook: received SMS | sender=" + sender + " | smsId=" + smsId
                + " | message=" + rawSms.substring(0, 80));

            // Dedup key = smsId + sender + hash of the SMS text.
            // The text hash is essential: if the forwarder sends a non-unique smsId
            // (e.g. an unresolved placeholder like "[sms_sender]-[sms_date]"), a key
            // without it makes every SMS look like a duplicate for 6 hours.
            // Sender stays in the key so both sides of a self-transfer are kept.
            const dedupKey = smsId
                ? (smsId + "|" + sender + "|" + Transactions.contentHash(rawSms))
                : "";
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

            // Same SMS body seen in the last 15 min (double delivery) — skip.
            // Checked only for SMS that would be saved, so ignored promos don't fill the cache.
            if (Transactions.isDuplicateContent(rawSms)) {
                Logger.log("Webhook: duplicate SMS body — skipping");
                return Webhook.jsonResponse({ status: "duplicate", reason: "same content" });
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

            // If an app notification already recorded this payment a moment ago,
            // upgrade that row with the SMS details instead of adding a second row.
            const row = Transactions.buildRow({ now, parsed, category, bankDisplayName, rawSms });
            const pair = Pairing.claim(ss, tz, {
                source: "sms", rank: 3, type: parsed.type, amount: parsed.amount,
                raw: rawSms, row, now
            });

            if (pair.action === "new") {
                Transactions.save(ss, {
                    now,
                    tz,
                    parsed,
                    category,
                    bankDisplayName,
                    rawSms,
                    lowConfidence
                });
            }

            BalanceCheck.afterSms(ss, tz, now, rawSms, bankDisplayName);

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

    /************************************************************
     * HANDLE APP NOTIFICATION (GPay, PhonePe, Paytm, CRED, bank apps)
     * Every forwarded notification is logged to Notification_Log with
     * the decision, so rules can be tuned from real data.
     ************************************************************/
    handleNotification(ss, data, now, tz) {
        // A placeholder the forwarder could not fill arrives as literal "{name}" / "[name]"
        const clean = v => {
            const t = (v === null || v === undefined ? "" : v).toString().trim();
            return /^[\[{][\w]+[\]}]$/.test(t) ? "" : t;
        };
        const app = clean(data.app);
        const title = clean(data.title);
        // prefer the expanded ("big") text when the app provides one
        const text = clean(data.big) || clean(data.message) || clean(data.text);

        // Optional original time (epoch ms) — used when replaying old notifications
        const ts = Number(data.ts);
        const historical = !!ts && !isNaN(ts) && Math.abs(now.getTime() - ts) > 15 * 60 * 1000;
        if (historical) now = new Date(ts);

        const finish = (result, extra) => {
            Webhook.logNotification(ss, now, app, title, text, result);
            return Webhook.jsonResponse(Object.assign({ status: result }, extra || {}));
        };

        const parsed = Parser.parseNotification(app, title, text);
        if (!parsed) return finish("ignored: empty");
        if (parsed.ignored) return finish("ignored: promo/reminder");
        if (!parsed.amount || parsed.type === "Unknown") return finish("ignored: not a payment");

        const bankDisplayName = Main.resolveAccountDisplayName(ss, parsed.bank);
        const category = Categories.getSmartCategory(
            ss, parsed.entity, parsed.amount,
            Utilities.formatDate(now, tz, "HH:mm"), Utilities.formatDate(now, tz, "EEE")
        );
        const row = Transactions.buildRow({
            now, parsed, category, bankDisplayName, rawSms: parsed.rawSms
        });

        const report = {
            source: "notif:" + app,
            rank: bankDisplayName !== "Other" ? 2 : 1,
            type: parsed.type, amount: parsed.amount,
            raw: parsed.rawSms, row, now
        };
        const pair = historical
            ? Pairing.claimHistorical(ss, tz, report, bankDisplayName)
            : Pairing.claim(ss, tz, report);

        if (pair.action === "new") {
            const saved = Transactions.save(ss, {
                now, tz, parsed, category, bankDisplayName,
                rawSms: parsed.rawSms, lowConfidence: false
            });
            if (historical) {
                // keep the month tab in date order
                const last = saved.sheet.getLastRow();
                if (last > 6) {
                    saved.sheet.getRange(6, 1, last - 5, TxSchema.HEADERS.length)
                        .sort({ column: 1, ascending: true });
                }
            }
            Webhook.checkRecurringMatch(ss, now, parsed.amount, parsed.entity, category);
            return finish("saved", { type: parsed.type, amount: parsed.amount });
        }
        return finish(pair.action === "upgraded"
            ? "merged: improved existing row" : "duplicate: already recorded");
    },

    logNotification(ss, now, app, title, text, result) {
        let sheet = ss.getSheetByName("Notification_Log");
        if (!sheet) {
            sheet = ss.insertSheet("Notification_Log");
            sheet.appendRow(["Timestamp", "App", "Title", "Text", "Result"]);
            sheet.getRange("A1:E1").setFontWeight("bold");
        }
        sheet.appendRow([now, app, title, text, result]);
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
