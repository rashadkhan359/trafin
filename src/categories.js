const Categories = {
    /************************************************************
     * SMART CATEGORIZATION
     ************************************************************/
    getSmartCategory(ss, entity, amount, timeStr, dayStr) {
        if (entity === "CC Bill Payment") return "CC Payment";

        // 1. Keyword mapping — supports comma-separated keywords per row
        const mapData = ss.getSheetByName("Settings_Mapping").getDataRange().getValues();
        for (let i = 1; i < mapData.length; i++) {
            const [keywordCell, category, days] = mapData[i];
            if (!keywordCell) continue;
            const keywords = keywordCell.toString().split(",").map(k => k.trim().toLowerCase());
            const entityLower = entity.toLowerCase();
            if (!keywords.some(kw => kw && entityLower.includes(kw))) continue;
            if (days && !Categories.matchesDay(days, dayStr)) continue;
            return category;
        }

        // 2. Time/amount rules
        const ruleData = ss.getSheetByName("Settings_Rules").getDataRange().getValues();
        for (let i = 1; i < ruleData.length; i++) {
            const [, start, end, maxAmt, days, cat] = ruleData[i];
            if (!start) continue;
            if (timeStr < start || timeStr > end) continue;
            if (amount > Number(maxAmt)) continue;
            if (days && !Categories.matchesDay(days, dayStr)) continue;
            return cat;
        }

        return "Misc";
    },

    matchesDay(daysCell, dayStr) {
        if (!daysCell || daysCell.toString().trim() === "") return true;
        return daysCell.toString().split(",")
            .map(d => d.trim().toLowerCase())
            .includes(dayStr.toLowerCase());
    }
}