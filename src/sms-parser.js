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

    const sms = normalizeSms(rawSms);

    if (shouldIgnoreSms(sms)) {

      return {
        ignored: true,
        reason: "Ignored keyword"
      };
    }

    const type = detectTxnType(sms);

    const amount = extractAmount(sms);

    const entity = extractEntity(sms);

    const bank = detectBank(sender, sms);

    const account = extractAccount(sms);

    const refNo = extractReference(sms);

    const confidence = calculateConfidence({
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

      category: autoCategorize(entity, type),

      labels: [],

      parsedAt: new Date()
    };
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
  shouldIgnoreSms(sms) {

    const lower = sms.toLowerCase();

    const ignoreKeywords = [

      "otp",
      "one time password",
      "reward point",
      "reward points",
      "loan offer",
      "pre approved",
      "credit limit",
      "minimum due",
      "emi due",
      "statement generated",
      "kyc",
      "insurance offer",
      "cashback offer",
      "voucher",
      "dear customer",
      "available credit limit"
    ];

    return ignoreKeywords.some(k =>
      lower.includes(k)
    );
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
  extractEntity(sms) {

    const patterns = [

      /credited to\s+(.+?)\s+via/i,

      /paid to\s+(.+?)\s+on/i,

      /to\s+(.+?)\s+on/i,

      /to\s+(.+?)\s+Ref/i,

      /UPI\/(.+?)\//i,

      /VPA\s+(.+?)\s/i,

      /Info:\s*UPI\s*(.+?)\s/i,

      /trf to\s+(.+?)\s/i,

      /merchant[: ]+(.+?)\s/i
    ];

    for (const pattern of patterns) {

      const match = sms.match(pattern);

      if (match) {

        const cleaned = cleanEntity(match[1]);

        if (cleaned.length > 1) {
          return cleaned;
        }
      }
    }

    return "Unknown";
  },

  /************************************************************
   * CLEAN ENTITY
   ************************************************************/
  cleanEntity(entity) {

    return entity

      .replace(/[^\w\s]/g, " ")

      .replace(/\s+/g, " ")

      .replace(/\bvia\b/gi, "")

      .replace(/\bupi\b/gi, "")

      .replace(/\bon\b/gi, "")

      .trim();
  },

  /************************************************************
   * DETECT BANK
   ************************************************************/
  detectBank(sender, sms) {

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

    const lower = sms.toLowerCase();

    if (lower.includes("hdfc")) return "HDFC";

    if (lower.includes("icici")) return "ICICI";

    if (lower.includes("sbi")) return "SBI";

    if (lower.includes("kotak")) return "Kotak";

    if (lower.includes("axis")) return "Axis";

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