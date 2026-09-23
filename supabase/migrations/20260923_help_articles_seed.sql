insert into phase1.help_articles (slug, category, title, summary, body, keywords, sort_order) values
-- ───────── Money ─────────
('available-vs-pending', 'Money', 'Available balance vs Pending', 'Available is money you can withdraw now. Pending is profit on orders that haven''t delivered yet.',
$md$Your earnings are shown as two numbers.

**Available balance** is profit from orders that have been **delivered**. This is yours to withdraw whenever it reaches the minimum.

**Pending** is profit from orders your customers have paid for but that haven't delivered yet — for example an order still in progress, or one being verified by MTN. It's still your money. It moves into your Available balance the moment the order is delivered.

Pending only goes away in one situation: if we refund the customer. Then there was no sale, so there's no profit on it.

You don't need to do anything with pending orders — delivery happens automatically.$md$,
'{pending,available,balance,earnings,profit,margin,money,not paid,waiting,released,withdraw}', 10),

('when-profit-is-credited', 'Money', 'When is my profit added?', 'The moment the order is delivered.',
$md$Your profit on a sale is the difference between what your customer paid and your agent price.

It's added to your **Available balance** as soon as the bundle is delivered to your customer's phone — usually within minutes of payment.

While the order is still on its way, the profit shows as **Pending** so you can see it's coming.

If an order is refunded to the customer, there's no sale and no profit on that order.$md$,
'{profit,credited,added,earnings,delivered,commission,margin,when}', 20),

('withdrawing', 'Money', 'Withdrawing to MoMo', 'From GH₵ 20.00, to the MoMo number on your Store page. Fee 1% (minimum GH₵ 1.00).',
$md$You can withdraw once your Available balance is **GH₵ 20.00** or more.

1. Go to **Earnings** and tap **Withdraw**.
2. Enter the amount. The fee and the exact amount you'll receive are shown before you confirm.
3. The money is sent to the **MoMo number on your Store page** — make sure the number and the name on it are correct before you request.

**Fee:** 1% of the amount, minimum GH₵ 1.00. So withdrawing GH₵ 50.00 costs GH₵ 1.00 and you receive GH₵ 49.00.

**How long:** withdrawals are sent by our team, normally the same day. You'll get an email the moment it's sent, with the amount and reference.

You can have one withdrawal request open at a time. The amount is held from your balance while it's being processed, so it can't be spent twice.$md$,
'{withdraw,withdrawal,payout,momo,mobile money,cash out,minimum,fee,how long,receive}', 30),

('withdrawal-rejected', 'Money', 'My withdrawal was returned', 'Usually a wrong MoMo number or name. The money is back in your balance.',
$md$If a withdrawal can't be sent, it's returned to your Available balance and you get an email explaining why.

The most common reasons:

- The **MoMo number** on your Store page is wrong or belongs to a different network than you think.
- The **name** on your Store page doesn't match the name registered on that MoMo number.

Fix the details under **Store**, then request again. Nothing is lost.$md$,
'{rejected,returned,failed,withdrawal,payout,momo,wrong number,name}', 40),

('pending-went-down', 'Money', 'Why did my pending amount go down?', 'An order was delivered (moved to Available) or refunded to the customer.',
$md$Pending goes down for one of two reasons:

- **The order delivered.** Its profit moved from Pending to your **Available balance**. Check Earnings — you'll see it there.
- **The customer was refunded.** If a bundle really can't be delivered, we refund the customer in full. There's no sale, so the profit on it is removed.

Refunds are rare and you'll see the order marked **Refunded** in your Orders list.$md$,
'{pending,went down,disappeared,dropped,less,reduced,refund,missing}', 50),

-- ───────── Orders ─────────
('order-stages', 'Orders', 'What each order stage means', 'Delivered, In progress, Being verified by MTN, Being looked at, Refunded.',
$md$Every order shows one of these stages:

**Delivered** — the bundle is on the customer's phone. Your profit has been added to Available.

**In progress** — paid and on its way. Most orders deliver within a few minutes.

**Being verified by MTN** — MTN is checking the customer's number before releasing the bundle. This happens the first time a number buys through our channel. The money is safe and it delivers automatically once MTN clears it. See *"Being verified by MTN"* for what to tell your customer.

**Being looked at** — something unusual happened and our team is on it. You don't need to do anything.

**Refunded** — the bundle couldn't be delivered, so the customer got their money back in full.$md$,
'{stage,status,in progress,processing,delivered,verified,looked at,refunded,meaning,what does}', 10),

('mtn-verification', 'Orders', '"Being verified by MTN" — what it is', 'A one-time check MTN runs on a number the first time it buys through our channel. Money is safe; it delivers automatically.',
$md$Sometimes an MTN order sits at **Being verified by MTN** instead of delivering in minutes. Here's what's happening.

**What it is.** The first time a phone number receives a data bundle through our supply channel, MTN holds it and runs a verification on the number. It's MTN's process, not something we or your customer did wrong.

**How long.** MTN clears these in batches. Some clear within the hour; some take a day or two. We re-send every held order automatically as soon as MTN opens the window.

**Is the money safe?** Yes. The payment is held with us, not with MTN. Nothing is lost.

**Does the customer need to do anything?** No. It delivers on its own once verified, and they'll get it on the same number.

**Does it happen again?** No — it's once per number. The next order to that number delivers normally.

**What to tell your customer:**
> "MTN is verifying your number because it's the first time it's received a bundle this way. Your payment is safe and the data will land automatically — usually within the day. It only happens once."

If a verified order hasn't delivered after two days, message support with the Order ID and we'll chase it.$md$,
'{verified,verification,mtn,hold,held,stuck,first time,not delivered,waiting,delay,how long,safe}', 20),

('customer-says-no-data', 'Orders', 'Customer says the data hasn''t arrived', 'Check the order stage first — it tells you exactly what to say.',
$md$Open **Orders** and find the order (tap the Order ID to copy it).

- **Delivered** — ask the customer to dial **\*138#** (MTN), **\*126#** (Telecel) or **\*100#** (AirtelTigo) to check their balance, and confirm the number on the order is the number they're checking. Data goes to the number on the order, not the number that paid.
- **In progress** — it's on its way. Most deliver within 15 minutes.
- **Being verified by MTN** — read *"Being verified by MTN"* and share the message there with your customer.
- **Being looked at** — our team is already on it. Tell the customer it's being handled.

If it's been more than an hour on **In progress**, or you think something is wrong, message support with the **Order ID** and the customer's number.$md$,
'{not received,no data,didn''t get,hasn''t arrived,customer complaint,where is,missing data}', 30),

('refunds', 'Orders', 'Refunds', 'If a bundle can''t be delivered, the customer is refunded in full to the account they paid from.',
$md$We refund a customer only when the bundle genuinely can't be delivered — for example a wrong network for the number, or a supplier failure we can't recover.

- The customer gets **the full amount** back to the MoMo or card they paid with. Paystack refunds usually land within a few hours, sometimes up to a few days for cards.
- The order shows **Refunded** in your list.
- There's no profit on a refunded order, so any pending amount on it is removed.

Customers don't contact you for refunds — they're handled by DataYego. If a customer asks, tell them to reply to their order email or contact support with the Order ID.$md$,
'{refund,money back,refunded,cancelled,failed,wrong network}', 40),

-- ───────── Your store ─────────
('setting-prices', 'Your store', 'Setting your prices', 'Every bundle has a suggested store price. Set your own on any bundle; clear it to go back to the suggestion.',
$md$Go to **Prices**. Each bundle shows three numbers:

- **Your agent price** — what you pay. This is fixed.
- **Suggested store price** — what your store charges if you don't set your own. We keep this in line with the market.
- **Your price** — set it to anything above your agent price. The difference is your profit on every sale.

Your own price always wins. If we change a suggested price later, it only affects bundles where you haven't set your own.

Tap **Clear** on a bundle to go back to the suggested price.

A good rule: keep your prices close to the suggestions. Customers compare, and a store that's a little cheaper on the popular sizes (2GB, 5GB, 10GB) tends to sell far more.$md$,
'{price,prices,pricing,set price,margin,profit,default,suggested,clear,markup}', 10),

('sharing-your-store', 'Your store', 'Sharing your store link', 'Your link is on the Home page. Share it on WhatsApp status, groups and to customers directly.',
$md$Your store lives at the link shown on your **Home** page. Tap the copy icon, or **Share store** to send it straight to WhatsApp.

Ideas that work for agents:

- Put it on your **WhatsApp status** with a short price list. Home has a **Copy price list** button that pastes all your prices with the link at the bottom.
- Pin it in the **groups** you're in (family, church, school, work).
- When someone asks you for data, send the link instead of doing it by hand — they pay, it delivers, you earn.

Customers don't need an account. They pick a bundle, enter the number, pay with MoMo or card, and it's delivered.$md$,
'{share,link,store link,whatsapp,status,price list,customers,promote}', 20),

('how-customers-pay', 'Your store', 'How customers pay', 'Through Paystack on your store — MoMo or card. You never handle cash.',
$md$Customers pay on your store through **Paystack** (MTN MoMo, Telecel Cash, AirtelTigo Money, or card). The bundle is sent as soon as the payment is confirmed.

You never collect cash or forward money to anyone. Your profit on each sale is credited to your earnings automatically.

The customer gets an order email with the Order ID and a tracking link — branded with your store name, so they know it came from you.$md$,
'{pay,payment,paystack,momo,card,cash,how do customers,checkout}', 30),

('store-details', 'Your store', 'Store name, WhatsApp and MoMo details', 'All under Store. Your WhatsApp shows on your storefront; your MoMo is where withdrawals go.',
$md$Under **Store** you can change:

- **Store name and tagline** — what customers see at the top of your store.
- **WhatsApp number** — shown as a chat button on your store so customers can reach you.
- **MoMo number and name** — where your withdrawals are sent. Make sure the name matches the name registered on that MoMo line, or the payment will bounce.$md$,
'{store,name,tagline,whatsapp,momo,details,settings,change}', 40),

-- ───────── Your plan ─────────
('plan-and-pricing', 'Your plan', 'Plans and what they cost', '1 month GH₵ 5.00 · 3 months GH₵ 13.50 · 12 months GH₵ 48.00, plus a 4% checkout fee.',
$md$Being an agent is a subscription. You can pay for **1, 3 or 12 months** at a time:

| Plan | Price | Per month |
|---|---|---|
| 1 month | GH₵ 5.00 | GH₵ 5.00 |
| 3 months | GH₵ 13.50 | GH₵ 4.50 |
| 12 months | GH₵ 48.00 | GH₵ 4.00 |

A **4% checkout fee** is added at payment, the same as on every Paystack payment. The exact total is shown before you pay.

**Extending:** you can extend any time from Home. Whatever you buy is added to the end of your current plan — you never lose days you've already paid for.

**Promotions** are shown on the payment screen when one is running and say which plans they apply to.

There are no refunds on 3 and 12-month plans.$md$,
'{plan,subscription,price,cost,monthly,yearly,3 months,12 months,fee,extend,renew,discount,promo}', 10),

('plan-ends', 'Your plan', 'What happens when my plan ends', 'You get one extra day. After that your store closes and agent prices lock — but your balance and dashboard stay open.',
$md$We email you 3 days before your plan ends, on the day, and the day after.

**The day after it ends** is a grace day. Nothing changes — your store is open and everything works. Renew and carry on.

**After the grace day**, if you haven't renewed:

- Your **store closes** — customers see your store name and a message to contact you on WhatsApp, but they can't order.
- **Buy data** at agent price is locked.
- Your **dashboard stays open**. You can see your orders, and you can still **withdraw** your balance as normal.

Renew from Home and everything reopens instantly. Your new plan starts from the day you pay.$md$,
'{plan ended,expired,lapsed,closed,locked,grace,renew,reopen,store closed,what happens}', 20),

-- ───────── Buying for yourself ─────────
('buy-data-yourself', 'Buying for yourself', 'Buying data at your agent price', 'Use Buy data for yourself, family or anyone — you pay the agent price directly.',
$md$**Buy data** lets you buy at your agent price for any number — your own, family, friends, or a customer who paid you in cash.

- You pay the agent price plus the 4% checkout fee, with MoMo or card.
- There's no markup and nothing is added to your earnings — it's simply data at the cheapest price you have.
- The order appears in your Orders list like any other.

It's the fastest way to serve someone standing in front of you. For everyone else, share your store link so they pay online and you earn the profit.$md$,
'{buy data,agent price,myself,own,family,cash customer,cheaper}', 10);
