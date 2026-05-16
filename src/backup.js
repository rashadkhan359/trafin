/************************************************************
 * BACKUP ALL TRANSACTIONS
 ************************************************************/
const Backup = {
    backupAllTransactions(ss) {
        const tz = Config.getTimezone(ss);

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
            ...TxSchema.HEADERS,
            "Backup Timestamp"
        ]);

        backupSheet.getRange(1, 1, 1, TxSchema.HEADERS.length + 2)
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
                    const obj = TxSchema.objectFromRow(row, headers);
                    const normalized = TxSchema.rowFromObject(obj);

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

        const backupName = Backup.backupAllTransactions(ss);
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
                sheet.getRange(5, 1, 1, TxSchema.HEADERS.length)
                    .setValues([TxSchema.HEADERS]).setFontWeight("bold").setBackground("#eeeeee");
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

            // Convert rows safely via header map
            const migrated = data.map(row => {
                const obj = TxSchema.objectFromRow(row, oldHeaders);
                obj["Labels"] = "";
                return TxSchema.rowFromObject(obj);
            });

            // Clear old structure only for transaction area
            if (lastRow > 5) {
                sheet.getRange(6, 1, lastRow - 5, lastCol).clearContent();
            }

            // Ensure enough columns
            if (sheet.getMaxColumns() < TxSchema.HEADERS.length) {
                sheet.insertColumnsAfter(
                    sheet.getMaxColumns(),
                    TxSchema.HEADERS.length - sheet.getMaxColumns()
                );
            }

            // Rewrite headers
            sheet.getRange(5, 1, 1, TxSchema.HEADERS.length)
                .setValues([TxSchema.HEADERS])
                .setFontWeight("bold")
                .setBackground("#eeeeee");

            // Rewrite migrated data
            if (migrated.length > 0) {
                sheet.getRange(6, 1, migrated.length, TxSchema.HEADERS.length)
                    .setValues(migrated);
            }

            // Apply dropdowns
            Sheet.applyTransactionDropdowns(ss, sheet, 6, migrated.length);

            Logger.log(`Migration complete: ${sheet.getName()}`);
        });
    },
};
