/************************************************************
 * BACKUP ALL TRANSACTIONS
 ************************************************************/
const Backup = {
    backupAllTransactions(ss) {
        const tz = getTimezone(ss);

        const timestamp = Utilities.formatDate(
            new Date(),
            tz,
            "yyyy-MM-dd HH:mm"
        );

        const backupName =
            "Backup_" +
            Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmm");

        const existing = ss.getSheetByName(backupName);
        if (existing) ss.deleteSheet(existing);

        const backupSheet = ss.insertSheet(backupName);

        backupSheet.appendRow([
            "Source Sheet",
            ...TRANSACTION_COLS,
            "Backup Timestamp"
        ]);

        backupSheet.getRange(1, 1, 1, TRANSACTION_COLS.length + 2)
            .setFontWeight("bold")
            .setBackground("#f4cccc");

        let totalRows = 0;

        ss.getSheets()
            .filter(s => s.getName().startsWith("Transactions_"))
            .forEach(sheet => {

                const lastRow = sheet.getLastRow();
                const lastCol = sheet.getLastColumn();

                if (lastRow < 6) return;

                const headers = sheet
                    .getRange(5, 1, 1, lastCol)
                    .getValues()[0];

                const data = sheet
                    .getRange(6, 1, lastRow - 5, lastCol)
                    .getValues();

                data.forEach(row => {

                    const obj = {};

                    headers.forEach((h, i) => {
                        obj[h] = row[i];
                    });

                    const normalized = [
                        obj["Timestamp"] || "",
                        obj["Type"] || "",
                        obj["Amount"] || "",
                        obj["Entity"] || "",
                        obj["Category"] || "",
                        obj["Labels"] || "",
                        obj["Bank"] || "",
                        obj["Raw SMS"] || ""
                    ];

                    backupSheet.appendRow([
                        sheet.getName(),
                        ...normalized,
                        timestamp
                    ]);

                    totalRows++;
                });
            });

        Logger.log(`Backup complete: ${totalRows} rows → ${backupName}`);

        return backupName;
    },

    /************************************************************
    * MIGRATION — incremental, never destructive
    ************************************************************/
    migrateExistingTransactions(ss) {
        const sheets = ss.getSheets().filter(s => s.getName().startsWith("Transactions_"));
        if (sheets.length === 0) return;

        const backupName = backupAllTransactions(ss);
        Logger.log(`Migration: Backup created → ${backupName}`);

        sheets.forEach(sheet => {
            const lastCol = sheet.getLastColumn();
            const lastRow = sheet.getLastRow();

            // Always ensure summary rows 1-4
            sheet.getRange("A1:B1").setValues([["Monthly Summary", "Value"]]).setFontWeight("bold");
            sheet.getRange("A2:B4").setValues([
                ["Total Expenses", `=SUMIF(B6:B,"Debit",C6:C)`],
                ["Total Income", `=SUMIF(B6:B,"Credit",C6:C)`],
                ["Net Balance", `=B3-B2`]
            ]);
            sheet.setFrozenRows(5);

            if (lastRow < 5) {
                sheet.getRange(5, 1, 1, TRANSACTION_COLS.length)
                    .setValues([TRANSACTION_COLS]).setFontWeight("bold").setBackground("#eeeeee");
                return;
            }

            // Read existing headers
            const oldHeaders = sheet
                .getRange(5, 1, 1, lastCol)
                .getValues()[0];

            // Already migrated
            if (oldHeaders.includes("Labels")) {
                Logger.log(`${sheet.getName()} already migrated.`);
                DataGuard.verifyTransactionSheet(sheet);
                return;
            }

            Logger.log(`Migrating ${sheet.getName()}...`);

            // Read existing data
            const data = sheet
                .getRange(6, 1, lastRow - 5, lastCol)
                .getValues();

            // Convert rows safely
            const migrated = data.map(row => {
                const obj = {};

                oldHeaders.forEach((header, i) => {
                    obj[header] = row[i];
                });

                return [
                    obj["Timestamp"] || "",
                    obj["Type"] || "",
                    obj["Amount"] || "",
                    obj["Entity"] || "",
                    obj["Category"] || "",
                    "", // Labels intentionally empty
                    obj["Bank"] || "",
                    obj["Raw SMS"] || ""
                ];
            });

            // Clear old structure only for transaction area
            if (lastRow > 5) {
                sheet.getRange(6, 1, lastRow - 5, lastCol).clearContent();
            }

            // Ensure enough columns
            if (sheet.getMaxColumns() < 8) {
                sheet.insertColumnsAfter(sheet.getMaxColumns(), 8 - sheet.getMaxColumns());
            }

            // Rewrite headers
            sheet.getRange(5, 1, 1, TRANSACTION_COLS.length)
                .setValues([TRANSACTION_COLS])
                .setFontWeight("bold")
                .setBackground("#eeeeee");

            // Rewrite migrated data
            if (migrated.length > 0) {
                sheet.getRange(6, 1, migrated.length, TRANSACTION_COLS.length)
                    .setValues(migrated);
            }

            // Apply dropdowns
            applyTransactionDropdowns(ss, sheet, 6, migrated.length);

            Logger.log(`Migration complete: ${sheet.getName()}`);
        });
    },
}