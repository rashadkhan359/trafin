/************************************************************
 * UNIVERSAL INDIAN BANK SMS PARSER
 * Reliable for most:
 * - UPI
 * - Debit/Credit
 * - Wallets
 * - Credit cards
 * - Major Indian banks
 ************************************************************/

const Parser = {
  /************************************************************
   * PARSE SMS
   ************************************************************/
  parseSms(rawSms, sender) {

    if (!rawSms) {
      return null;
    }

    const sms = Parser.normalizeSms(rawSms);

    if (Parser.shouldIgnoreSms(sms)) {

      return {
        ignored: true,
        reason: "Ignored keyword"
      };
    }

    let amount = Parser.extractAmount(sms);
    if (!amount) {
      amount = Parser.extractAmountLegacy(rawSms);
    }

    const bank = Parser.detectBank(sender, sms, rawSms);

    const legacyTxn = Parser.matchLegacyTxn(rawSms, sms);
    let type;
    let entity;

    if (legacyTxn) {
      type = legacyTxn.type;
      entity = legacyTxn.entity;
    } else {
      type = Parser.detectTxnType(sms);
      entity = Parser.extractEntity(sms, rawSms);
    }

    entity = Parser.cleanEntity(entity);

    const account = Parser.extractAccount(sms);

    const refNo = Parser.extractReference(sms);

    const confidence = Parser.calculateConfidence({
      type,
      amount,
      entity,
      bank,
      account
    });

    return {

      ignored: false,

      rawSms,

      normalizedSms: sms,

      sender: sender || "",

      type,

      amount,

      entity,

      bank,

      account,

      reference: refNo,

      confidence,

      category: Parser.autoCategorize(entity, type),

      labels: [],

      parsedAt: new Date()
    };
  },

  /************************************************************
   * LEGACY ORDERED TXN PATTERNS (parity with monolithic Code.js)
   * Most specific first; returns null to fall through to generic heuristics.
   ************************************************************/
  matchLegacyTxn(rawSms, normalizedSms) {
    const lower = normalizedSms.toLowerCase();

    // CC spend: "INR X spent on Kotak Credit Card xNNNN at MERCHANT."
    if (/\bspent on\b.*credit card/i.test(rawSms) ||
        /\bspent on\b.*credit card/i.test(normalizedSms)) {
      const m = rawSms.match(/\bat\s+(.+?)\./i) ||
        normalizedSms.match(/\bat\s+(.+?)\./i);
      return {
        type: "Debit",
        entity: m ? m[1].trim() : "CC Spend"
      };
    }

    // CC bill payment: "Payment of INR X is credited to your ... Credit Card"
    if (/credited to your.*credit card/i.test(lower) ||
        /credited to your.*credit card/i.test(rawSms.toLowerCase())) {
      return {
        type: "CC_Payment",
        entity: "CC Bill Payment"
      };
    }

    // Add this block BEFORE the debited check
    if (lower.includes("sent") && /from\s+kotak\s+bank/i.test(rawSms)) {
      const m = rawSms.match(/to\s+([\w.@]+)\s+on/i);
      return {
        type: "Debit",
        entity: m ? m[1].trim() : "Unknown"
      };
    }

    // Standard UPI / account debit
    if (lower.includes("debited") || rawSms.toLowerCase().includes("debited")) {
      const m = rawSms.match(/credited to\s+(.+?)\s+via/i) ||
        rawSms.match(/to\s+(.+?)\s+UPI/i) ||
        normalizedSms.match(/credited to\s+(.+?)\s+via/i) ||
        normalizedSms.match(/to\s+(.+?)\s+UPI/i) ||
        normalizedSms.match(/paid to\s+(.+?)\s+on/i);
      return {
        type: "Debit",
        entity: m ? m[1].trim() : "Unknown"
      };
    }

    // Standard credit / received (after CC payment branch)
    if (lower.includes("credited") || lower.includes("received") ||
        rawSms.toLowerCase().includes("credited") ||
        rawSms.toLowerCase().includes("received")) {
      const m = rawSms.match(/from\s+(.+?)\s+on/i) ||
        rawSms.match(/from\s+(.+?)\s+credited/i) ||
        normalizedSms.match(/from\s+(.+?)\s+on/i) ||
        normalizedSms.match(/from\s+(.+?)\s+credited/i);
      return {
        type: "Credit",
        entity: m ? m[1].trim() : "Income"
      };
    }

    return null;
  },

  /************************************************************
   * LEGACY AMOUNT (pre-normalization Rs/INR variants)
   ************************************************************/
  extractAmountLegacy(rawSms) {
    const amountMatch = rawSms.match(/(?:Rs\.?|INR|Rs:|₹)\s*([\d,]+\.?\d*)/i);
    if (!amountMatch) return null;
    const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
    return (!isNaN(amount) && amount > 0) ? amount : null;
  },

  /************************************************************
   * CARD LAST-4 (Kotak CC parserId mapping)
   ************************************************************/
  extractLast4(rawSms) {
    const m = rawSms.match(/[xX]{1,4}(\d{4})/i);
    return m ? m[1] : "XXXX";
  },

  /************************************************************
   * NORMALIZE SMS
   ************************************************************/
  normalizeSms(sms) {

    return sms

      .replace(/\s+/g, " ")

      .replace(/₹/g, " INR ")

      .replace(/rs\./gi, " INR ")

      .replace(/rs:/gi, " INR ")

      .replace(/\brs\b/gi, " INR ")

      .replace(/inr/gi, " INR ")

      .replace(/\*/g, "X")

      .replace(/-/g, " ")

      .replace(/\s+/g, " ")

      .trim();
  },

  /************************************************************
   * IGNORE NON-TRANSACTION SMS
   ************************************************************/
  shouldIgnoreSms(sms, sender) {
    const lower = sms.toLowerCase();
  
    // Hard ignore — these never contain real transactions
    const hardIgnore = [
      "otp",
      "one time password",
      "reward point",
      "loan offer",
      "pre-approved",
      "pre approved",
      "emi due",
      "minimum due",
      "statement generated",
      "kyc",
      "insurance offer",
      "voucher",
      "available credit limit",
      "is due on",
      "is due for payment",
      "ignore if already paid",
      "please ignore if",
      "special gift",
      "every year",
      "postpaid plan",
      "passbook balance",       // catches the provident fund SMS
      "contribution of",        // catches the provident fund SMS
    ];
  
    if (hardIgnore.some(k => lower.includes(k))) return true;

    // "dear customer" only ignore if no debit/credit verb present
    if (lower.includes("dear customer")) {
      const hasTxnVerb = /(debited|credited|sent|received|spent)\s/i.test(sms);
      if (!hasTxnVerb) return true;
    }

    // "credit limit" — ignore if no transaction verb
    if (lower.includes("credit limit") &&
        !/(debited|spent|sent)\b/i.test(lower)) {
      return true;
    }
  
    return false;
  },

  /************************************************************
   * DETECT TRANSACTION TYPE
   ************************************************************/
  detectTxnType(sms) {

    const lower = sms.toLowerCase();

    const debitWords = [

      "debited",
      "spent",
      "sent",
      "paid",
      "purchase",
      "withdrawn",
      "dr.",
      "payment done",
      "upi payment"
    ];

    const creditWords = [

      "credited",
      "received",
      "deposited",
      "refund",
      "cr.",
      "cashback",
      "reversed"
    ];

    let debitScore = 0;
    let creditScore = 0;

    debitWords.forEach(w => {
      if (lower.includes(w)) debitScore++;
    });

    creditWords.forEach(w => {
      if (lower.includes(w)) creditScore++;
    });

    if (debitScore > creditScore) return "Debit";

    if (creditScore > debitScore) return "Credit";

    return "Unknown";
  },

  /************************************************************
   * EXTRACT AMOUNT
   ************************************************************/
  extractAmount(sms) {

    const patterns = [

      /INR\s*([\d,]+(?:\.\d+)?)/i,

      /(?:debited|credited)\s*(?:with)?\s*INR\s*([\d,]+(?:\.\d+)?)/i,

      /(?:debited|credited)\s*by\s*INR\s*([\d,]+(?:\.\d+)?)/i,

      /amount\s*(?:of)?\s*INR\s*([\d,]+(?:\.\d+)?)/i,

      /for\s*INR\s*([\d,]+(?:\.\d+)?)/i,

      /txn of INR\s*([\d,]+(?:\.\d+)?)/i
    ];

    for (const pattern of patterns) {

      const match = sms.match(pattern);

      if (match) {

        const amount = parseFloat(
          match[1].replace(/,/g, "")
        );

        if (!isNaN(amount)) {
          return amount;
        }
      }
    }

    return null;
  },

  /************************************************************
   * EXTRACT ENTITY / MERCHANT
   ************************************************************/
  extractEntity(normalizedSms, rawSms) {
    const sources = [normalizedSms, rawSms || ""];

    const patterns = [
      /credited to\s+(.+?)\s+via/i,
      /paid to\s+(.+?)\s+on/i,
      /to\s+(.+?)\s+on/i,
      /to\s+(.+?)\s+Ref/i,
      /to\s+(.+?)\s+UPI/i,
      /UPI\/(.+?)\//i,
      /VPA\s+(.+?)\s/i,
      /Info:\s*UPI\s*(.+?)\s/i,
      /trf to\s+(.+?)\s/i,
      /merchant[: ]+(.+?)\s/i,
      /from\s+(.+?)\s+on/i,
      /from\s+(.+?)\s+credited/i
    ];

    for (const text of sources) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const cleaned = Parser.cleanEntity(match[1]);
          if (cleaned.length > 1 && cleaned !== "Unknown") {
            return cleaned;
          }
        }
      }
    }

    return "Unknown";
  },

  /************************************************************
   * CLEAN ENTITY
   ************************************************************/
  cleanEntity(entity) {
    if (!entity) return "Unknown";

    return entity
      .toString()
      .split("@")[0]
      .replace(/[0-9]{7,}/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\bvia\b/gi, "")
      .replace(/\bupi\b/gi, "")
      .replace(/\bon\b/gi, "")
      .trim() || "Unknown";
  },

  /************************************************************
   * DETECT BANK
   ************************************************************/
  detectBank(sender, sms, rawSms) {
    // Legacy SMS patterns first — Kotak_CC_{last4} must win over sender "Kotak"
    const legacyBank = Parser.detectBankLegacySms(rawSms || "");
    if (legacyBank !== "Unknown") {
      return legacyBank;
    }

    const fromSender = Parser.detectBankFromSender(sender);
    if (fromSender !== "Unknown") {
      return fromSender;
    }

    return Parser.detectBankFromSmsText(sms);
  },

  detectBankFromSender(sender) {
    sender = (sender || "").toUpperCase();

    const mappings = {
      "HDFCBK": "HDFC",
      "ICICIB": "ICICI",
      "SBIBNK": "SBI",
      "KOTAKB": "Kotak",
      "AXISBK": "Axis",
      "BOI": "BOI",
      "IDFCFB": "IDFC",
      "YESBNK": "Yes Bank",
      "PNBSMS": "PNB",
      "CANBNK": "Canara",
      "UNIONB": "Union Bank",
      "PAYTMB": "Paytm"
    };

    for (const key in mappings) {
      if (sender.includes(key)) {
        return mappings[key];
      }
    }

    return "Unknown";
  },

  /************************************************************
   * LEGACY SMS BANK DETECTION (raw SMS — BOI, Kotak CC last-4)
   ************************************************************/
  detectBankLegacySms(rawSms) {
    if (rawSms.includes("-BOI") || /\bBOI\b/.test(rawSms)) {
      return "BOI";
    }
    if (/kotak.*credit card|credit card.*kotak/i.test(rawSms)) {
      return "Kotak_CC_" + Parser.extractLast4(rawSms);
    }
    if (/\bKotak\b/i.test(rawSms)) {
      return "Kotak";
    }
    return "Unknown";
  },

  detectBankFromSmsText(sms) {
    const lower = sms.toLowerCase();

    if (lower.includes("hdfc")) return "HDFC";
    if (lower.includes("icici")) return "ICICI";
    if (lower.includes("sbi")) return "SBI";
    if (lower.includes("kotak")) return "Kotak";
    if (lower.includes("axis")) return "Axis";
    if (lower.includes("boi") || lower.includes("bank of india")) return "BOI";
    if (lower.includes("idfc")) return "IDFC";
    if (lower.includes("yes bank")) return "Yes Bank";
    if (lower.includes("pnb") || lower.includes("punjab national")) return "PNB";
    if (lower.includes("canara")) return "Canara";
    if (lower.includes("union bank")) return "Union Bank";
    if (lower.includes("paytm")) return "Paytm";

    return "Unknown";
  },

  /************************************************************
   * EXTRACT ACCOUNT NUMBER
   ************************************************************/
  extractAccount(sms) {

    const patterns = [

      /A\/c(?:XX|X+)?(\d{3,6})/i,

      /Acct(?:XX|X+)?(\d{3,6})/i,

      /account(?:XX|X+)?(\d{3,6})/i,

      /card(?:XX|X+)?(\d{3,6})/i
    ];

    for (const pattern of patterns) {

      const match = sms.match(pattern);

      if (match) {
        return match[1];
      }
    }

    return "";
  },

  /************************************************************
   * EXTRACT REFERENCE NUMBER
   ************************************************************/
  extractReference(sms) {

    const patterns = [

      /Ref(?: No)?\.?\s*([A-Z0-9]+)/i,

      /UTR[: ]+([A-Z0-9]+)/i,

      /UPI Ref(?: No)?\.?\s*([A-Z0-9]+)/i,

      /Txn(?: ID)?[: ]+([A-Z0-9]+)/i
    ];

    for (const pattern of patterns) {

      const match = sms.match(pattern);

      if (match) {
        return match[1];
      }
    }

    return "";
  },

  /************************************************************
   * CONFIDENCE SCORE
   ************************************************************/
  calculateConfidence(data) {

    let score = 0;

    if (data.type !== "Unknown") {
      score += 0.2;
    }

    if (data.type === "CC_Payment") {
      score += 0.1;
    }

    if (data.amount !== null) {
      score += 0.4;
    }

    if (
      data.entity &&
      data.entity !== "Unknown"
    ) {
      score += 0.2;
    }

    if (
      data.bank &&
      data.bank !== "Unknown"
    ) {
      score += 0.1;
    }

    if (data.account) {
      score += 0.1;
    }

    return Number(score.toFixed(2));
  },

  /************************************************************
   * AUTO CATEGORY
   ************************************************************/
  autoCategorize(entity, type) {

    if (!entity) return "Misc";

    const e = entity.toLowerCase();

    const categories = {

      Food: [
        "zomato",
        "swiggy",
        "dominos",
        "pizza",
        "restaurant",
        "cafe"
      ],

      Travel: [
        "uber",
        "ola",
        "metro",
        "irctc",
        "rapido"
      ],

      Shopping: [
        "amazon",
        "flipkart",
        "myntra",
        "meesho"
      ],

      Bills: [
        "electricity",
        "broadband",
        "recharge",
        "airtel",
        "jio",
        "vi"
      ],

      Transfer: [
        "self",
        "transfer",
        "upi"
      ]
    };

    for (const category in categories) {

      const keywords = categories[category];

      if (
        keywords.some(k => e.includes(k))
      ) {
        return category;
      }
    }

    if (type === "Credit") {
      return "Income";
    }

    return "Misc";
  }
};