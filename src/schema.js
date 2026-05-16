/************************************************************
 * TRANSACTION SCHEMA
 * Single source of truth for column order and row construction.
 ************************************************************/

const TxSchema = {

    HEADERS: [
        "Timestamp", "Type", "Amount", "Entity",
        "Category", "Labels", "Bank", "Raw SMS"
    ],

    /************************************************************
     * HEADER NAME → column index (0-based)
     ************************************************************/
    headerMap(headers) {
        const map = {};
        (headers || []).forEach((h, i) => {
            if (h !== null && h !== undefined && h !== "") {
                map[h.toString().trim()] = i;
            }
        });
        return map;
    },

    /************************************************************
     * BUILD ROW from parser output + runtime metadata
     ************************************************************/
    toRow(parsed, meta) {
        const m = meta || {};

        return [
            m.now || parsed.parsedAt || new Date(),
            parsed.type,
            parsed.amount,
            parsed.entity,
            m.category || parsed.category || "Misc",
            TxSchema.formatLabels(parsed.labels),
            m.bankDisplayName || parsed.bank || "Unknown",
            m.rawSms || parsed.rawSms || ""
        ];
    },

    /************************************************************
     * BUILD ROW from header-keyed object (backup / migration)
     ************************************************************/
    rowFromObject(obj) {
        return [
            obj["Timestamp"] || "",
            obj["Type"] || "",
            obj["Amount"] || "",
            obj["Entity"] || "",
            obj["Category"] || "",
            obj["Labels"] || "",
            obj["Bank"] || "",
            obj["Raw SMS"] || ""
        ];
    },

    /************************************************************
     * OBJECT from header-keyed row data (inverse of rowFromObject)
     ************************************************************/
    objectFromRow(row, headers) {
        const obj = {};
        const cols = headers || TxSchema.HEADERS;
        cols.forEach((h, i) => {
            if (h) obj[h.toString().trim()] = row[i];
        });
        return obj;
    },

    formatLabels(labels) {
        if (!labels) return "";
        if (Array.isArray(labels)) return labels.join(", ");
        return labels.toString();
    },

    /************************************************************
     * VALIDATE row length and minimum required fields
     ************************************************************/
    validateRow(row) {
        if (!row || row.length !== TxSchema.HEADERS.length) {
            return false;
        }
        if (!row[0]) return false;
        if (!row[1] || row[1] === "Unknown") return false;
        if (row[2] === "" || row[2] === null || row[2] === undefined) return false;
        return true;
    }
};

/** Backward-compatible alias — prefer TxSchema.HEADERS */
const TRANSACTION_COLS = TxSchema.HEADERS;
