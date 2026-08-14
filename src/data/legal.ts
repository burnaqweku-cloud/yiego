/* ══════════════════════════════════════════════════════════════
   Baseline legal documents.

   These ship with the app so the Terms, Privacy and Refund pages
   are never blank. If an admin publishes a document with the same
   slug in `phase1.legal_documents`, the published row WINS — this
   file is only the floor, never an override.

   They describe how DataYego actually works today: data bundles for
   MTN, Telecel and AirtelTigo, guest checkout, Paystack payments,
   a wallet, automatic supplier delivery and a YG- reference on
   every order. Nothing here invents a company registration, an
   address or a promise the product cannot keep.

   Written 5 August 2026. Have a Ghanaian lawyer review before
   relying on them in a dispute, and edit the review windows in the
   refund policy to whatever the team can genuinely hold to.
   ══════════════════════════════════════════════════════════════ */

export interface LegalFallback {
  title: string;
  summary: string;
  content: string;
  version: number;
  published_at: string;
}

const EFFECTIVE = "2026-08-05";

/* The renderer turns plain text into prose: `##` is a heading, `-` is a
   bullet, `**bold**` works, and each line is its own block — so a paragraph
   must stay on one line. */

const TERMS = `
DataYego sells prepaid mobile data bundles in Ghana for MTN, Telecel and AirtelTigo. These terms are the agreement between you and DataYego when you use the website, buy a bundle, or hold a DataYego wallet. By placing an order you accept them.

## 1. Who can use DataYego

You may use DataYego if you are able to enter a binding contract under Ghanaian law. You can buy as a guest with just an email address, or create an account. If you create an account, you are responsible for keeping your password safe and for everything done through it. Tell us immediately if you think someone else has access.

## 2. What you are buying

Each order is for one data bundle, on one network, for one recipient phone number, at the price shown at checkout. The bundle itself is provided by the mobile network. DataYego buys it and has it delivered to the number you give us.

We show the bundle size and, where the network states one, its validity period. Where no validity is shown, the network sets it when the bundle lands. Data allowances, expiry rules and fair-use limits are set by the network, not by DataYego.

## 3. The recipient number is your responsibility

You choose the number a bundle is delivered to, and it does not have to be your own. Check it before you pay.

- Once a bundle has been delivered to a number, the network cannot recall it. We cannot move it to a different number and cannot refund it.
- If you are buying for someone else, make sure you have their permission to use their number.
- An order's recipient number and bundle cannot be changed after the order is created. If you got it wrong, cancel the order before paying and start again.

## 4. Prices and payment

Prices are shown in Ghana cedis and are the full amount you pay. Nothing is added at checkout. Prices can change when the networks change theirs; the price that applies to your order is the one shown when you place it.

You can pay by Mobile Money or card through our payment provider, or from your DataYego wallet. Card and Mobile Money details are handled by the payment provider — DataYego never sees or stores your card number, Mobile Money PIN or one-time codes.

An order is only sent to the network once payment has actually cleared. An unpaid order expires after the window shown on the order.

## 5. The DataYego wallet

The wallet holds prepaid credit for buying bundles on DataYego. It is not a bank account, it earns no interest, and it is not a means of transferring money to other people.

- Your balance can only be changed by our servers — never from your phone or browser.
- Every credit and debit is recorded on your wallet statement.
- Wallet credit is used to pay for bundles. If you want money back out of a wallet rather than spending it, contact support; we may ask you to confirm your identity first.

## 6. Paying for someone else's order

An order can be shared so that another DataYego user pays for it using its order reference. Whoever pays sees the network, bundle, recipient number and amount before paying, and cannot change any of them. Payment requests expire after the period shown when the request is created.

## 7. Delivery

Orders are sent to the network automatically once payment clears, and most arrive within minutes. Delivery depends on the mobile networks and on our supplier, so it is not instant in every case and can be delayed or interrupted by problems outside our control.

Every order carries a reference beginning with **YG-**. You can check payment and delivery status at any time on the Track Order page, and account holders can see all their orders under Orders.

## 8. Cancellations and refunds

You can cancel an order that has not been paid for. Once payment has cleared and the bundle has been delivered, the order cannot be cancelled.

Where an order is paid for but the data is never delivered, you are entitled to your money back. Our Refund policy explains what qualifies, how to ask, and how refunds are paid.

## 9. Using DataYego fairly

You agree not to:

- use DataYego for fraud, money laundering, or with money that is not lawfully yours
- use someone else's payment details, account or identity
- attempt to break, overload, probe or reverse-engineer the service, or to obtain data belonging to other customers
- resell, automate or bulk-purchase through DataYego in a way that breaches a network's own terms
- abuse refunds, disputes or chargebacks

## 10. Suspension

We may hold, cancel or refuse an order, and suspend or close an account, where we reasonably suspect fraud, abuse, a breach of these terms, or a legal obligation to do so. Where we hold an order we will tell you why, and any money you have paid for an undelivered bundle will be returned.

## 11. Availability

We work to keep DataYego available, but we do not promise it will be uninterrupted or error free. Features may change, and parts of the service may be unavailable during maintenance or during an outage at a network, a supplier or a payment provider.

## 12. Our responsibility to you

Nothing in these terms limits any right you have under Ghanaian law that cannot lawfully be limited, including for death, personal injury or fraud caused by us.

Subject to that, DataYego is not responsible for loss that was not reasonably foreseeable, for loss of profit, business, or data caused by a delayed or failed delivery, or for the acts of the mobile networks. Our total responsibility to you for any order is limited to the amount you paid for that order.

## 13. Changes to these terms

We may update these terms as the service changes. The version and date at the top of this page show when it was last updated, and the current version always applies to new orders.

## 14. Law and disputes

These terms are governed by the laws of the Republic of Ghana, and the courts of Ghana have jurisdiction over any dispute.

## 15. Contact

Questions about these terms should go to our support team through any of the channels listed on the Contact page.
`.trim();

const PRIVACY = `
This policy explains what personal information DataYego collects when you buy data bundles from us, why we hold it, who we share it with, and the rights you have over it under the Data Protection Act, 2012 (Act 843).

## What we collect

**When you buy a bundle.** The recipient phone number, the network and bundle chosen, the amount, the order reference, and the status of payment and delivery. If you buy as a guest we also collect the email address you give us for the receipt.

**When you create an account.** Your name, email address and phone number, and a securely hashed version of your password. We never store your password itself.

**When you pay.** A record that payment succeeded or failed, the amount, and the reference from our payment provider. Card numbers, Mobile Money PINs and one-time codes are entered with the payment provider and never reach DataYego.

**When you use a wallet.** Every top-up, purchase, refund and adjustment, so your statement is complete and can be reconciled.

**When you contact us.** The messages you send to support or to our AI assistant, and anything you attach to a dispute.

**Automatically.** Basic technical information such as your device and browser type, IP address, and the pages you use, which we need to keep the service running and to detect abuse. Your browser also stores your sign-in session and your light or dark theme preference on your own device.

## Why we hold it

- To take payment, place your order with the network and deliver the bundle you bought
- To show you your orders, your wallet statement and the status of a delivery
- To answer support questions and resolve disputes and refunds
- To detect and prevent fraud, abuse and unauthorised access to accounts
- To keep the financial and transaction records the law requires us to keep

## Who we share it with

We do not sell your personal information, and we do not share it for advertising.

We share only what is necessary with:

- **Our payment provider**, to take and verify payment, and to process refunds
- **The mobile network and the delivery partner that fulfils your order**, which necessarily includes the recipient phone number, network and bundle
- **Our hosting, database and email providers**, which store and transmit the data on our behalf
- **The provider that powers our AI support assistant**, which receives the questions you send it
- **Authorities, regulators or advisers**, where we are legally required to disclose, or where it is necessary to establish or defend a legal claim

## Buying for other people

When you buy a bundle for someone else's number, you give us their phone number. Only enter another person's number if you are entitled to — you are responsible for having their permission.

## How long we keep it

Order, payment and wallet records are kept for as long as we need them for accounting, tax and dispute purposes. Account details are kept while your account is open. Support conversations are kept while they are useful for resolving your issue and for a reasonable period afterwards. When information is no longer needed, we delete it or anonymise it.

## How we protect it

Traffic between your device and DataYego is encrypted. Access to customer data is restricted to the people who need it to run the service. Wallet balances can only be changed by our servers, never from a phone or a browser.

Nobody at DataYego will ever ask you for your password, a one-time code, your card details or your Mobile Money PIN. If someone does, they are not from DataYego.

## Your rights

Under the Data Protection Act, 2012 (Act 843) you can ask us to:

- give you a copy of the personal information we hold about you
- correct anything that is wrong or out of date
- delete information we no longer have a lawful reason to keep
- stop using your information in a particular way, or object to how we use it

Ask through any channel on our Contact page. We may need to confirm who you are before we act, so that nobody else can request your data. If you are unhappy with how we have handled your information, you can complain to the Data Protection Commission of Ghana.

## Children

DataYego is not intended for children. Do not create an account if you cannot enter a binding contract under Ghanaian law.

## Changes

We update this policy when the service changes. The version and date at the top of this page show when it was last updated.

## Contact

For any question about your personal information, reach us through the channels on the Contact page.
`.trim();

const REFUNDS = `
The principle is simple: you pay for a data bundle, and if that bundle is not delivered you get your money back. This page explains when a refund is due, when it is not, and how to ask for one.

## When you get your money back

You are entitled to a refund where:

- payment cleared but the bundle was never delivered to the recipient number
- you were charged twice for the same order
- your order was cancelled, or refused by us, after you had paid
- a payment left your wallet but no order was created against it

In these cases you do not have to argue the point. Send us the order reference and we will make it right.

## When a refund is not possible

Once a bundle has been delivered to a phone number, the network cannot take it back. That means we cannot refund:

- a bundle delivered exactly as ordered, because you no longer want it
- a bundle delivered to the wrong number because the wrong number was entered at checkout
- a bundle that has already been used, in whole or in part
- an amount claimed long after the order, where the delivery can no longer be verified with the network

Data allowances, expiry and fair-use limits are set by the mobile network. A complaint about how fast a bundle ran out, or how long it lasted, is a matter for the network rather than a refund from DataYego.

## If you entered the wrong number

Contact support immediately with your order reference. If the order has not yet been sent to the network there may still be time to cancel it. Once it has been delivered it cannot be reversed — this is a limitation of the networks, not a DataYego policy. Always check the recipient number before you pay.

## An order that is stuck, not failed

An order that is still processing has not failed. Networks are occasionally slow, and an order can sit in progress for a while before it completes. Check the status first on the Track Order page using your **YG-** reference. If it is still not delivered after a reasonable time, contact support and we will chase it and refund it if it cannot be completed.

## How to ask for a refund

Contact support through any channel on our Contact page with:

- your order reference, beginning with **YG-**
- the recipient phone number used at checkout
- what happened, and anything that helps — a screenshot, a payment message from your bank or Mobile Money

We aim to look at every refund request within 2 working days. Where we need to confirm delivery with the network or our supplier first, it can take longer, and we will tell you if it does.

## How refunds are paid

Approved refunds are paid as credit to your DataYego wallet, which you can spend on any bundle straight away. If you would rather have the money returned to the account you paid from, tell us when you make the request. Refunds to a card or Mobile Money account are made through our payment provider, and how long they take to appear is decided by your bank or mobile money operator.

Refunds are always made to the person who paid, and only once per order.

## If you disagree with our decision

Ask us to look again. Raise a dispute with the same order reference and a person will review it independently of the first decision. If you are still not satisfied, you keep every right you have under Ghanaian consumer law — nothing on this page takes that away.

## Chargebacks

If you think something has gone wrong, contact us before asking your bank to reverse the payment. We can usually resolve it faster. Where a chargeback is raised for an order that was in fact delivered, we may suspend the account while it is investigated.
`.trim();

export const LEGAL_FALLBACKS: Record<string, LegalFallback> = {
  terms: {
    title: "Terms of service",
    summary:
      "The agreement between you and DataYego when you buy a data bundle, hold a wallet, or use this site.",
    content: TERMS,
    version: 1,
    published_at: EFFECTIVE,
  },
  privacy: {
    title: "Privacy policy",
    summary:
      "What we collect when you buy data, why we hold it, who we share it with, and the rights you have under Act 843.",
    content: PRIVACY,
    version: 1,
    published_at: EFFECTIVE,
  },
  refunds: {
    title: "Refund policy",
    summary:
      "Pay for a bundle, and if it is not delivered you get your money back. When that applies, and how to ask.",
    content: REFUNDS,
    version: 1,
    published_at: EFFECTIVE,
  },
};
