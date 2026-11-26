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

    if (Parser.shouldIgnoreSms(sms, sender)) {

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
   * PARSE APP NOTIFICATION (GPay, PhonePe, Paytm, CRED, wallet, bank apps)
   * Stricter than SMS: must have an amount and an explicit
   * "money moved" phrase, otherwise it is only logged.
   ************************************************************/
  parseNotification(app, title, text) {
    const raw = [title || "", text || ""].join(". ").replace(/\s+/g, " ").trim();
    if (!raw || raw === ".") return null;

    const sms = Parser.normalizeSms(raw);
    const lower = raw.toLowerCase();

    const promo = /\b(loan|emi starts|reminder|requested|request(ing)? money|pending|failed|failure|declined|expired?|expiring|win |won |reward|scratch|coupon|voucher|upto|up to|invite|refer|due on|is due|bill generated|statement)\b/i;
    if (Parser.shouldIgnoreSms(sms, "") || promo.test(lower)) {
      return { ignored: true, reason: "Not a payment notification" };
    }

    const amountMatch = raw.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : null;

    let type = "Unknown";
    let entity = "Unknown";
    let m;

    if (/\b(paid|sent) you\b|\breceived\b|\bcredited\b|\brefund(ed)?\b|\bmoney received\b/i.test(raw)) {
      type = "Credit";
      m = raw.match(/([A-Za-z][\w .&'-]{1,40}?) (?:has )?(?:paid|sent) you\b/i) ||
        raw.match(/\bfrom ([^.₹]+?)(?: on\b| via\b| in\b| to your\b|\.|$)/i);
    } else if (/\byou (?:have )?(?:paid|sent)\b|\bpaid to\b|\bsent to\b|\bdebited\b|\bspent\b|\bpaid successfully\b|\b(?:payment|recharge|transfer|transaction|purchase)\b.{0,80}\b(?:successful|success|completed|done)\b|\bsuccessfully (?:paid|sent)\b/i.test(raw)) {
      type = "Debit";
      // "Recharge of Delhi Metro Smart Card 123 for Rs. 200 was successful"
      m = raw.match(/\b(?:recharge|payment|purchase) (?:of|for) ([^.₹]+?) (?:for|of) (?:₹|Rs\.?|INR)/i) ||
        raw.match(/\b(?:paid|sent)(?: (?:₹|Rs\.?|INR)\s*[\d,.]+)? to ([^.₹]+?)(?: on\b| via\b| using\b| from\b| for\b|\.|$)/i) ||
        raw.match(/\bto ([^.₹]+?)(?: on\b| via\b| using\b| from\b| was\b| is\b|\.|$)/i) ||
        raw.match(/\bat ([^.₹]+?)(?: on\b| via\b| using\b|\.|$)/i) ||
        raw.match(/\b(?:recharge|payment|purchase) (?:of|for) ([^.₹]+?)(?: for\b| of\b| was\b| is\b|\.|$)/i);
    }
    if (m) entity = Parser.cleanEntity(m[1]);

    // Account is only known when the notifying app is the bank itself
    // (text like "Sent using Paytm UPI" describes the other party, not your account).
    let bank = Parser.detectBankFromSmsText((app || "").toLowerCase());
    const card = raw.match(/credit card\s*[xX*-]*(\d{4})/i);

    // CRED / bank app: "payment of ₹X on your ... credit card XXXX-2993 has been processed"
    if (card && /payment of .* credit card .*(processed|successful|received)|paid instantly to/i.test(raw)) {
      type = "CC_Payment";
      entity = "CC Bill Payment";
    }
    // Kotak app: "₹349 paid successfully. Amount spent from credit card XX2993."
    else if (card && type === "Debit" && entity === "Unknown") {
      entity = "Card Spend";
    }
    if (card) {
      const issuer = bank !== "Unknown" ? bank : Parser.detectBankFromSmsText(sms);
      if (issuer !== "Unknown") bank = issuer + "_CC_" + card[1];
    }
    // CRED: "X sent you ₹2,000. Bank of India account has been successfully credited."
    if (bank === "Unknown") {
      const acct = raw.match(/([A-Za-z][A-Za-z ]+?) account has been (?:successfully )?(?:credited|debited)/i);
      if (acct) bank = Parser.detectBankFromSmsText(acct[1].toLowerCase());
    }

    return {
      ignored: false,
      rawSms: "[" + (app || "App") + "] " + raw,
      normalizedSms: sms,
      sender: app || "",
      type,
      amount,
      entity,
      bank,
      account: "",
      reference: Parser.extractReference(sms),
      confidence: 0.6,
      category: Parser.autoCategorize(entity, type),
      labels: ["via " + (app || "app")],
      parsedAt: new Date()
    };
  },

  /************************************************************
   * BALANCE STATED BY THE BANK IN THE SMS
   * Returns { kind: "balance" | "limit", value } or null.
   ************************************************************/
  extractStatedBalance(rawSms) {
    const num = m => parseFloat(m[1].replace(/,/g, ""));
    let m = (rawSms || "").match(/Avl\.?\s*Bal(?:ance)?\.?\s*(?:is)?\s*:?\s*(?:INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
    if (m) return { kind: "balance", value: num(m) };
    m = (rawSms || "").match(/(?:Avl\.?|Available)\s*(?:Credit\s*)?limit\s*(?:is)?\s*:?\s*(?:INR|Rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
    if (m) return { kind: "limit", value: num(m) };
    return null;
  },

  /************************************************************
   * LEGACY ORDERED TXN PATTERNS (parity with monolithic Code.js)
   * Most specific first; returns null to fall through to generic heuristics.
   ************************************************************/
  matchLegacyTxn(rawSms, normalizedSms) {
    const lower = normalizedSms.toLowerCase();

    // CC refund: "INR X from MERCHANT refunded to your Kotak Credit Card xNNNN"
    if (/refunded to\b.*credit card/i.test(rawSms)) {
      const m = rawSms.match(/from\s+(.+?)\s+refunded/i);
      return {
        type: "Credit",
        entity: (m ? m[1].trim() + " " : "") + "Refund"
      };
    }

    // UPI reversal: "... is reversed for Rs.X (UPI Ref no ...)"
    if (/\bis reversed for\b/i.test(rawSms)) {
      return { type: "Credit", entity: "Reversal" };
    }

    // Card auto-pay: "Auto-Pay ID of INR X to MERCHANT debited via Kotak Card xNNNN"
    if (/auto-?pay\b.*\bdebited via\b/i.test(rawSms)) {
      const m = rawSms.match(/\bto\s+(.+?)\s+debited via/i);
      return { type: "Debit", entity: m ? m[1].trim() : "Auto-Pay" };
    }

    // Debit/credit card spend without "credit card" wording:
    // "Rs.X spent via Kotak Debit Card XXNNNN at MERCHANT on DATE"
    if (/\bspent (?:via|on|using)\b/i.test(rawSms) && !/credit card/i.test(rawSms)) {
      const m = rawSms.match(/\bat\s+(.+?)\s+on\s+\d/i) ||
        rawSms.match(/\bat\s+(.+?)\./i);
      return { type: "Debit", entity: m ? m[1].trim() : "Card Spend" };
    }

    // Incoming transfer with no payer (salary / NEFT):
    // "Rs: X has been transferred to your account XXXXXXNNNN on DATE"
    if (/has been transferred to your account/i.test(rawSms)) {
      return { type: "Credit", entity: "Account Transfer" };
    }

    // Bank charges: "BOI - Rs X Debited(TRF) SMSChrgsJUL-SEP26 GST ..."
    if (/debited\(trf\)\s*\S*chrg/i.test(rawSms)) {
      return { type: "Debit", entity: "Bank Charges" };
    }

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

    // Kotak UPI debit: "Sent Rs.X from Kotak Bank AC XNNNN to VPA on DATE"
    // The VPA may be glued to "to" with no space (e.g. "topaytm.s25fvw3@pty"),
    // so try with-space first, then fall back to no-space.
    if (lower.includes("sent") && /from\s+kotak\s+bank/i.test(rawSms)) {
      const m = rawSms.match(/\bto\s+(.+?)\s+on\s+\d/i)
             || rawSms.match(/to\s+([\w.@-]+)\s+on/i)
             || rawSms.match(/to([\w.@-]+)\s+on/i);
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

    // Indian sender IDs end in -P for promotional traffic (e.g. "JD-KOTAKB-P").
    // Real transaction alerts come from -S / -T senders, never -P.
    if (/-P$/i.test((sender || "").trim())) return true;

    // Hard ignore — these never contain real transactions.
    // NOTE: sms is normalized, so "-" is already a space ("auto-pay" => "auto pay").
    const hardIgnore = [
      "otp",
      "one time password",
      "reward point",
      "loan offer",
      "pre approved",
      "emi due",
      "minimum due",
      "min due",
      "total due",
      "statement generated",
      "statement for",
      "kyc",
      "insurance offer",
      "voucher",
      "is due on",
      "is due for payment",
      "ignore if already paid",
      "ignore if paid",
      "please ignore if",
      "special gift",
      "every year",
      "postpaid plan",
      "passbook balance",       // provident fund SMS
      "contribution of",        // provident fund SMS

      // Marketing
      "t&c",
      "apply now",
      "apply:",
      "offer",
      "cashback",
      "recharge now",
      "earn points",
      "points on purchase",
      "thank you for shopping",
      "choose your emi",

      // Failed / not-yet-happened / non-monetary notifications
      "could not be approved",
      "unsuccessful",
      "declined",
      "will be debited",
      "will be credited",
      "mandate",
      "auto pay activated",
      "autopay activated",
      "your request",
      "access request",
      "initiated a refund",     // the real refund SMS follows from the bank

      // Mutual fund confirmations — the bank debit SMS is the real record
      "folio"
    ];

    if (hardIgnore.some(k => lower.includes(k))) return true;

    // "earn 3 pts on every Rs 100 spent" style promos
    if (/\bearn\b.*\b(pts|points|rewards?)\b/i.test(lower)) return true;

    // "dear customer" only ignore if no debit/credit verb present
    if (lower.includes("dear customer")) {
      const hasTxnVerb = /(debited|credited|sent|received|spent)\s/i.test(sms);
      if (!hasTxnVerb) return true;
    }

    // "credit limit" — ignore unless it is a spend or a card bill payment
    // ("Payment of INR X is credited to your ... Credit Card ... Available Credit limit is ...")
    if (lower.includes("credit limit") &&
        !/(debited|spent|sent)\b/i.test(lower) &&
        !/credited to your.*credit card/i.test(lower)) {
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

    // UPI IDs whose handle is a phone number or machine id ("9876543210@axl",
    // "Q123456789@ybl", "paytm-12345678@ptybl") carry no readable name — keep the
    // full VPA so the row stays identifiable and Settings_Mapping can match it.
    const vpa = entity.toString().trim().match(/^([\w.\-]+)@([\w.]+?)\.?$/);
    if (vpa && (/\d{5,}/.test(vpa[1]) || vpa[1].length < 3)) {
      return (vpa[1] + "@" + vpa[2]).toLowerCase();
    }

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
    if (/kotak.*credit card|credit card.*kotak/i.test(rawSms) ||
        /\bkotak card\s*x+\d{4}/i.test(rawSms)) {
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

      // Kotak format: "AC X0916" or "AC XX0916" (space between AC and masked digits)
      /\bAC\s+X+(\d{3,6})\b/i,

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