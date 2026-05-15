const Logging = {

    
    /************************************************************
     * LOG UNKNOWN SMS
     ************************************************************/
    logUnknownSms(data, parsed) {
        const ss = SpreadsheetApp.getActive();
      
        let sheet = ss.getSheetByName("Unknown_SMS");
      
        if (!sheet) {
          sheet = ss.insertSheet("Unknown_SMS");
          sheet.appendRow(["Timestamp", "Sender", "Message", "Confidence", "Parsed JSON"]);
        }
      
        sheet.appendRow([
          new Date(),
          data.sender || "",
          data.message || "",
          parsed.confidence || 0,
          JSON.stringify(parsed)
        ]);
    }
}