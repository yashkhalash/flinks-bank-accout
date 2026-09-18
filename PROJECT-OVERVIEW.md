# Flinks Bank Connect — Simple Project Overview

**For:** managers, product owners, and anyone who wants to understand what this demo does  
**Not for:** developers (technical setup is in other project files)

---

## What is this project?

This is a **demo website** that shows how a customer can safely connect their bank account and how the business can then see basic account information (balances, account type, and so on).

Think of it like this:

1. The customer opens a secure bank-login window on the page.
2. They pick a bank and sign in (in this demo, a fake test bank).
3. After a successful connection, the page shows their **account details**.

No real customer money is moved. This is for **demonstration and testing only**.

---

## Why it exists

Banks do not usually let apps ask for a username and password directly. Services like **Flinks** provide a trusted middle step:

- The customer logs in through Flinks’ secure screen.
- Your app only receives permission to **view** account information the customer agreed to share.

This project is a small working example of that idea.

---

## What you see on the screen (in order)

| Step | What it means in plain language |
|------|----------------------------------|
| Consent | Customer agrees to share bank data |
| Institution Selection | Customer chooses their bank |
| Account Authentication | Customer enters username and password |
| Account Validation — MFA | Extra security question / check (if asked) |
| Account Selection | Customer picks which accounts to connect |
| Confirmation | Success — connection is complete |

After confirmation, the page shows:

- A green **Success** message  
- Clear **Account details** cards (name, number, balances)  
- Optional raw data for technical review (can be ignored by non-technical readers)

---

## How to try the demo (sandbox / test mode)

### Important

In **test mode**, you will mainly see one practice bank:

**Flinks Capital** (a fake bank made for testing)

The Flinks **Dashboard preview** may show many real bank names (TD, RBC, BMO, etc.). Those names are for design preview. This working demo uses the **test toolbox**, where the bank you can fully log into is **Flinks Capital**.

### Test login (safe to use)

| Field | Value |
|-------|--------|
| Bank | Flinks Capital |
| Username | `Greatday` |
| Password | `Everyday` |

If a security question appears, typical test answers are:

| Question (example) | Answer |
|--------------------|--------|
| What city were you born in? | Montreal |
| What is the best country on Earth? | Canada |
| What shape do people like the most? | Triangle |
| Simple math (e.g. 2 + 2) | 4 |

---

## Sample output (what “success” looks like)

After a successful test connection, the page shows account cards similar to the examples below.  
*(Numbers are realistic **sandbox / fake** data from Flinks Capital — not a real person’s bank.)*

### Success message (example)

> **Success! Your account is now connected.**  
> Connected to FlinksCapital. Details from the bank connection:

### Account details (example cards)

#### Example 1 — Investments

| Field | Sample value |
|-------|----------------|
| Institution | Flinks Capital |
| Account name | Investments |
| Account number | INV00001 |
| Type | Investment |
| Holder | Test user (sandbox) |
| Current balance | $100,000.00 |
| Available | — |

#### Example 2 — Chequing

| Field | Sample value |
|-------|----------------|
| Institution | Flinks Capital |
| Account name | Chequing Account |
| Account number | 7641238 |
| Type | Chequing |
| Holder | Testing |
| Current balance | $5,105.50 |
| Available | $5,405.50 |
| Currency | CAD |

#### Example 3 — What a full test run often returns

A complete Flinks Capital test connection can return **several accounts at once** (for example chequing, savings, credit, and investment-style accounts). The demo page lists each one as its own card so you can read balances without opening technical logs.

---

## Sample output (simple picture of the result)

```
Connection: Successful
Bank:       Flinks Capital
Status:     Account details loaded

┌─────────────────────────────┐
│ Investments                 │
│ Account #: INV00001         │
│ Balance:   $100,000.00      │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Chequing Account            │
│ Account #: 7641238          │
│ Balance:   $5,105.50        │
│ Available: $5,405.50        │
└─────────────────────────────┘

(+ other test accounts may appear)
```

---

## What this demo does **not** do

- It does **not** transfer money.  
- It does **not** store customer passwords.  
- It does **not** replace a full production banking product.  
- It does **not** connect every real bank while running in **test / sandbox** mode.

---

## One-sentence summary

**This project is a simple demo that connects to a test bank through Flinks and then shows readable account balances on the page — so anyone can see the customer experience without needing technical knowledge.**

---

## Quick FAQ

**Q: Why don’t I see TD / RBC / BMO in the working demo?**  
A: Those often appear in the Flinks Dashboard preview. The working test environment used here focuses on **Flinks Capital** so login and account data can be demonstrated safely.

**Q: Is the sample data real?**  
A: No. It is sandbox / practice data for demos and training.

**Q: Who is this document for?**  
A: Non-technical readers who need a clear project overview and an example of the final output.

---

*Document type: business / overview · Suitable to export as PDF · No technical architecture or API flow included.*
