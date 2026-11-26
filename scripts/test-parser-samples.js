/**
 * Parser regression samples. Run: npm run test:parser
 * Samples mirror real Kotak / BOI SMS formats with made-up names and numbers.
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "sms-parser.js"), "utf8");
const Parser = new Function(src + "; return Parser;")();

// expect: null => must NOT be saved; otherwise fields that must match
const CASES = [
  ["JX-KOTAKB-S", "Sent Rs.50.00 from Kotak Bank A/c X1234 to Ravi Tea Stall on 27-11-26. UPI Ref 633100000001. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud",
    { type: "Debit", amount: 50, entity: "Ravi Tea Stall", bank: "Kotak" }],
  ["AD-KOTAKB-S", "Sent Rs.45.00 from Kotak Bank AC X1234 to Q123456789@ybl on 27-11-26.UPI Ref 633100000002. Not you, https://kotak.com/KBANKT/Fraud",
    { type: "Debit", amount: 45, entity: "q123456789@ybl" }],
  ["JK-KOTAKB-S", "Sent Rs.10000.00 from Kotak Bank AC X1234 to 9000000001@axl on 27-11-26.UPI Ref 633100000003. Not you, https://kotak.com/KBANKT/Fraud",
    { type: "Debit", amount: 10000, entity: "9000000001@axl" }],
  ["JX-KOTAKB-S", "Sent Rs.35.00 from Kotak Bank AC X1234 to shopname@pty on 27-11-26.UPI Ref 633100000004. Not you, https://kotak.com/KBANKT/Fraud",
    { type: "Debit", amount: 35, entity: "shopname" }],
  ["JM-KOTAKB-S", "Received Rs.440.00 in your Kotak Bank AC X1234 from AMIT KUMAR on 27-11-26.UPI Ref:633100000005",
    { type: "Credit", amount: 440, entity: "AMIT KUMAR", bank: "Kotak" }],
  ["JK-KOTAKB-S", "Rs: 50,000.00 has been transferred to your account XXXXXX1234 on 07-Jun-2026. Please check with your bank for details. From Kotak Bank",
    { type: "Credit", amount: 50000, entity: "Account Transfer", bank: "Kotak" }],
  ["AD-KOTAKB-S", "INR 1549 spent on Kotak Credit Card x4321 on 27-11-26 at BLINKIT. Avl limit INR 85000.00 Not you? SMS CCLOST 4321 to 5676788",
    { type: "Debit", amount: 1549, entity: "BLINKIT", bank: "Kotak_CC_4321" }],
  ["VM-KOTAKB-S", "Payment of INR 23486.02 is credited to your Kotak Bank Credit Card x4321 on 05-JUL-26. Available Credit limit is INR 100000.00.",
    { type: "CC_Payment", amount: 23486.02, entity: "CC Bill Payment", bank: "Kotak_CC_4321" }],
  ["VM-Kotakb-S", "INR 262 from BISTRO refunded to your Kotak Credit Card x4321 on 16-Jul-2026. Opted for EMI? Please call 18002090000 to cancel.",
    { type: "Credit", amount: 262, entity: "BISTRO Refund", bank: "Kotak_CC_4321" }],
  ["AD-KOTAKB-S", "Auto-Pay YAQno57VnR of INR 499.00 to HOTSTAR debited via Kotak Card x4321 on 27/08/2026. Manage Auto-Pay: https://kotak.bank.in/KOTAKB/msi",
    { type: "Debit", amount: 499, entity: "HOTSTAR", bank: "Kotak_CC_4321" }],
  ["AD-KOTAKB-T", "Rs.1355.16 spent via Kotak Debit Card XX8888 at Lycamobile on 27/11/2026 IST. Avl bal Rs.1000.00 Not you?Tap https://kotak.bank.in/KBANKT/Fraud",
    { type: "Debit", amount: 1355.16, entity: "Lycamobile", bank: "Kotak" }],
  ["JM-BOIIND-S", "Rs.28.00 debited A/cXX5678 and credited to Ravi Tea Stall via UPI Ref No 633100000006 on 27Sep26. Call 18001031906, if not done by you. -BOI",
    { type: "Debit", amount: 28, entity: "Ravi Tea Stall", bank: "BOI" }],
  ["JM-BOIIND-S", "BOI -  Rs.2000.00 Credited to your Ac XX5678 on 27-11-26 by UPI ref No.633100000007.Avl Bal 5000.00",
    { type: "Credit", amount: 2000, bank: "BOI" }],
  ["BP-BOIIND-S", "BOI UPI - Your VPA someone@oksbi linked to Bank Of India a/c no. XXXXXXXXXXX5678 is reversed for Rs.20.00 (UPI Ref no 633100000008).",
    { type: "Credit", amount: 20, entity: "Reversal", bank: "BOI" }],
  ["JM-BOIIND-T", "BOI -  Rs 23.60 Debited(TRF) SMSChrgsJUL-SEP26 GST 3.6 CUST in your Ac XX5678 on 27-11-26. .Avl BalRs 5000.00.",
    { type: "Debit", amount: 23.6, entity: "Bank Charges", bank: "BOI" }],

  // ---- must NOT be saved ----
  ["JD-KOTAKB-P", "Still spending without rewards? Link Kotak UPI Rupay CC to your UPI app & earn 3 pts on every Rs 100 spent. Apply: https://1.kotak.bank.in/KOTAKB/X", null],
  ["JD-KOTAKB-S", "Still spending without rewards? Link Kotak UPI Rupay CC to your UPI app & earn 3 pts on every Rs 100 spent. Apply: https://1.kotak.bank.in/KOTAKB/X", null],
  ["AD-650022-P", "Account Update: ATM Card offer expiring! Open your bank account now & get Rs.50 cashback every month + Rs.2,000 brand discount - https://i.airtel.in/Open", null],
  ["AD-KOTAKB-S", "Auto-Pay YAQno57VnR of INR 499.00 to HOTSTAR will be debited to Kotak Card x4321 on 27/08/2026. Edit Auto-Pay: https://kotak.bank.in/KOTAKB/msi", null],
  ["VM-KOTAKB-S", "Auto-Pay activated on Kotak Card x4321 for Google Play from 25/06/2026 for INR 299.00. To edit/cancel: https://kotak.com/KBANKT/msi", null],
  ["JX-KOTAKB-S", "Your ASPRESENTED UPI AutoPay Mandate from 01/01/2026 to 31/12/2036 is successfully created towards Google Play Store for Rs.299.00. Refer UM no. abc@axisb", null],
  ["JX-KOTAKB-S", "Jun-26 statement for Kotak Credit Card X4321 Total Due: INR 23486.02 Min Due: INR 1174.00 Due date: 05-Jun-26. Pay at https://1.kotak.bank.in/KOTAKB/e/X", null],
  ["VM-KOTAKB-S", "Payment of INR 738.90 on Kotak Credit Card xx4321 is due on 05-07-26. Min due: INR 100.00. Tap to pay: https://gs.im/KOTAKB/e/Y Ignore if paid", null],
  ["JD-KOTAKB-S", "Dear Customer, trxn of INR 274.00 at ASSPL on your Kotak Bank Credit Card x4321 could not be approved. Please call 18602662666 for assistance.", null],
  ["AD-KOTAKB-S", "Txn of INR 470.82 on Kotak Credit Card x4321 at RELIANCE RETAIL LTD declined as domestic online txn is disabled.", null],
  ["JX-JIOPAY-S", "Your last payment attempt of Rs. 470.82 on Jul 5, 2026 10:00:00 PM for Jio number 9000000001 was unsuccessful. Please try again.", null],
  ["AD-HDFCMF-S", "Your Purchase in Folio 123/45 under HDFC Large & Mid Cap Fund-Reg Gr for Rs. 4,999.75 has been processed at the NAV of 300.1 for 16.6 units.", null],
  ["JX-BSTRO-S", "We have initiated a refund of Rs.262.00 for the cancelled order ORD123 back to your card, which should reflect in 5-7 business days. -Bistro by Blinkit", null],
  ["JD-KOTAKB-S", "123456 is your OTP for txn of INR 500.00 at AMAZON on Kotak Credit Card x4321. Do not share.", null],
];

let failed = 0;
for (const [sender, sms, expect] of CASES) {
  const p = Parser.parseSms(sms, sender);
  const saved = p && !p.ignored && p.amount && p.type !== "Unknown";
  const problems = [];
  if (expect === null) {
    if (saved) problems.push("should NOT be saved, got " + JSON.stringify({ type: p.type, amount: p.amount, entity: p.entity }));
  } else if (!saved) {
    problems.push("should be saved, got " + JSON.stringify(p && (p.ignored ? { ignored: p.reason } : { type: p.type, amount: p.amount })));
  } else {
    for (const k of Object.keys(expect)) {
      if (p[k] !== expect[k]) problems.push(k + ": expected " + JSON.stringify(expect[k]) + ", got " + JSON.stringify(p[k]));
    }
  }
  if (problems.length) {
    failed++;
    console.log("FAIL  " + sms.slice(0, 70) + "...\n      " + problems.join("\n      "));
  }
}
console.log((CASES.length - failed) + "/" + CASES.length + " passed");
process.exit(failed ? 1 : 0);
