/************************************************************
 * SECURITY
 * Webhook authentication via Script Properties (shared secret).
 *
 * Setup (run once in Apps Script editor):
 *   Security.setWebhookSecret("your-long-random-secret");
 *
 * Client MUST send secret (recommended — most reliable in Apps Script):
 *   POST JSON: { "secret": "...", "message": "...", "sender": "...", "smsId": "..." }
 *
 * Optional fallback:
 *   Query parameter: .../exec?secret=...
 *
 * Do NOT rely on HTTP headers — Apps Script web apps often do not expose them.
 ************************************************************/

const Security = {

    PROP_KEY: "WEBHOOK_SECRET",

    QUERY_PARAM: "secret",

    BODY_FIELD: "secret",

    /************************************************************
     * STORED SECRET (Script Properties — never hardcoded)
     ************************************************************/
    getStoredSecret() {
        return PropertiesService.getScriptProperties().getProperty(Security.PROP_KEY);
    },

    setWebhookSecret(secret) {
        if (!secret || !String(secret).trim()) {
            throw new Error("Webhook secret must be a non-empty string.");
        }
        PropertiesService.getScriptProperties().setProperty(
            Security.PROP_KEY,
            String(secret).trim()
        );
        Logger.log("Security: WEBHOOK_SECRET saved to Script Properties.");
    },

    clearWebhookSecret() {
        PropertiesService.getScriptProperties().deleteProperty(Security.PROP_KEY);
        Logger.log("Security: WEBHOOK_SECRET removed from Script Properties.");
    },

    /************************************************************
     * EXTRACT SECRET FROM REQUEST (body first, then query param)
     ************************************************************/
    extractProvidedSecret(e, parsedBody) {
        const body = parsedBody || {};

        if (body[Security.BODY_FIELD]) {
            return String(body[Security.BODY_FIELD]);
        }

        if (e && e.parameter && e.parameter[Security.QUERY_PARAM]) {
            return String(e.parameter[Security.QUERY_PARAM]);
        }

        if (e && e.parameters && e.parameters[Security.QUERY_PARAM]) {
            const p = e.parameters[Security.QUERY_PARAM];
            return String(Array.isArray(p) ? p[0] : p);
        }

        return "";
    },

    /************************************************************
     * CONSTANT-TIME STRING COMPARE (best-effort in Apps Script)
     ************************************************************/
    secureEquals(a, b) {
        const strA = a === null || a === undefined ? "" : String(a);
        const strB = b === null || b === undefined ? "" : String(b);

        const lenA = strA.length;
        const lenB = strB.length;
        const maxLen = Math.max(lenA, lenB);

        let diff = lenA ^ lenB;

        for (let i = 0; i < maxLen; i++) {
            const codeA = i < lenA ? strA.charCodeAt(i) : 0;
            const codeB = i < lenB ? strB.charCodeAt(i) : 0;
            diff |= codeA ^ codeB;
        }

        return diff === 0;
    },

    /************************************************************
     * VALIDATE WEBHOOK SECRET
     * Returns { valid: boolean, reason: string }
     * Fails closed if WEBHOOK_SECRET is not configured.
     ************************************************************/
    validateWebhookSecret(e, parsedBody) {
        const stored = Security.getStoredSecret();

        if (!stored || !stored.trim()) {
            return { valid: false, reason: "secret_not_configured" };
        }

        const provided = Security.extractProvidedSecret(e, parsedBody);

        if (!provided) {
            return { valid: false, reason: "missing_secret" };
        }

        if (!Security.secureEquals(provided, stored)) {
            return { valid: false, reason: "invalid_secret" };
        }

        return { valid: true, reason: "ok" };
    },

    /************************************************************
     * REDACT SECRET FROM OBJECTS BEFORE LOGGING
     ************************************************************/
    redactRequestBody(data) {
        if (!data || typeof data !== "object") {
            return data;
        }
        const copy = Object.assign({}, data);
        delete copy[Security.BODY_FIELD];
        return copy;
    }
};
