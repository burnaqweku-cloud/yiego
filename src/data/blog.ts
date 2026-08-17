/* ══════════════════════════════════════════════════════════════
   The DataYego blog.

   Posts live here as structured data rather than HTML or markdown
   files for three reasons: the block types below are the only
   shapes the renderer can produce, so a post can never inject
   markup or break the page; every post is part of the bundle, so
   it needs no database round-trip; and because this module is
   plain data with no React imports, vite.config.ts can read it at
   build time to give each post its own sitemap entry and its own
   pre-rendered HTML file (see src/lib/site.ts).

   Keep posts honest and genuinely useful. These pages exist to be
   the best answer to a real question a Ghanaian typed into
   Google — the sale follows from that, not the other way round.
   ══════════════════════════════════════════════════════════════ */

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "callout"; text: string }
  | { type: "cta"; label: string; to: string; text: string }
  /* Renders the live catalogue ranked by price per GB. A post carrying this
     block re-dates itself every time it loads, so the recurring "what is
     cheapest right now" article never needs rewriting by hand. */
  | { type: "bestValue" };

export interface BlogPost {
  slug: string;
  /** Document title, written like a search result. */
  title: string;
  /** On-page H1 — plainer than the title, no brand suffix. */
  heading: string;
  description: string;
  /** One sentence on the index card. */
  excerpt: string;
  category: "Guides" | "Codes" | "Explainers";
  /** ISO date. `updated` is what a reader sees when it differs. */
  published: string;
  updated?: string;
  readMinutes: number;
  body: BlogBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "cheapest-data-bundles-ghana",
    title: "Cheapest Data Bundles in Ghana: Price per GB | DataYego",
    heading: "Cheapest data bundles in Ghana: how to compare properly",
    description: "The cheapest bundle is rarely the smallest one. How to compare Ghanaian data bundles by price per gigabyte, with our live MTN, Telecel and AirtelTigo prices.",
    excerpt: "The cheapest bundle is rarely the one with the smallest price tag. Here is how to compare by price per gigabyte, with our live prices for all three networks.",
    category: "Guides",
    published: "2026-08-17",
    readMinutes: 5,
    body: [
      { type: "p", text: "The cheapest data bundle is not the one with the smallest price tag. It is the one that costs you least **per gigabyte**. A GHS 5 bundle looks cheaper than a GHS 50 one, but if the small bundle works out at GHS 10 a gigabyte and the large one at GHS 4, the large one is better value by a distance — provided you will actually use it." },
      { type: "p", text: "That single sum, price divided by gigabytes, is how to compare any two bundles on any network. Here is what it looks like across the bundles we sell today." },
      { type: "bestValue" },
      { type: "callout", text: "These are DataYego's own prices, read live from our catalogue as you load the page. We cannot survey every seller in Ghana, so treat this as an honest look at our shelf rather than a league table of the whole market." },
      { type: "h2", text: "Work out price per gigabyte before you buy" },
      { type: "p", text: "Take the price, divide by the number of gigabytes, and you have a number you can compare against anything else. A 2GB bundle at GHS 12 is GHS 6 a gigabyte. A 10GB bundle at GHS 40 is GHS 4. The second is a third cheaper for every gigabyte you use, even though it costs more to buy." },
      { type: "p", text: "Headline prices are designed to be compared badly. Price per gigabyte is the number that cannot be dressed up." },
      { type: "h2", text: "Bigger is usually better value — up to a point" },
      { type: "p", text: "On every network in Ghana, larger bundles almost always cost less per gigabyte. That is normal pricing, not a trick. But it only helps if the data gets used." },
      { type: "p", text: "A 25GB bundle at a low price per gigabyte is poor value to someone who browses lightly and lets half of it lapse. The honest rule: buy the largest bundle you are confident of finishing within its validity, and no larger. Check the [full price list](/prices) and compare two or three sizes before deciding." },
      { type: "h2", text: "Validity changes the maths" },
      { type: "p", text: "A bundle that expires in a day and one that does not expire are not the same product, even at the same price per gigabyte. If a cheap weekly bundle leaves 3GB unused when it lapses, you did not pay for 10GB — you paid for 7GB, at a much worse rate than the label suggested." },
      { type: "p", text: "Every bundle on our pages shows its validity next to its price, so you can weigh the two together. Our [non-expiry guide](/blog/non-expiry-data-bundles-ghana) explains what happens to leftover data in more detail." },
      { type: "h2", text: "Compare the networks, not just the bundles" },
      { type: "p", text: "The three networks price differently, and the best value shifts between them as offers change. It is worth checking all three rather than staying loyal out of habit — especially if you are buying for someone else's line, where the network is theirs, not yours." },
      { type: "ul", items: ["[MTN bundles](/mtn-data-bundles) — the widest coverage, and the range most people compare against.", "[Telecel bundles](/telecel-data-bundles) — the network formerly known as Vodafone Ghana.", "[AirtelTigo bundles](/airteltigo-data-bundles) — often the value pick, and the one worth checking before you assume."] },
      { type: "h2", text: "Why prices move" },
      { type: "p", text: "Bundle prices in Ghana are not fixed for long. Networks run promotions, revise their line-ups, and occasionally change what a given price buys. Regulation moves them too: in July 2025 operators were directed to increase the amount of data customers receive for the same money." },
      { type: "p", text: "This is why a price list published as an article goes stale, and why the table above reads our live catalogue instead of quoting numbers we typed in months ago. Whatever it shows is what you would pay at checkout right now." },
      { type: "h2", text: "A short checklist before you pay" },
      { type: "ol", items: ["Divide price by gigabytes for the two or three bundles you are weighing up.", "Check the validity, and be honest about whether you will finish the data inside it.", "Confirm which network the receiving number is actually on — if it was ported, the prefix will mislead you.", "Read the receiving number back to yourself before paying. It is the one mistake that is hard to undo.", "Keep the YG- reference from your receipt so you can follow the order on [Track Order](/track-order)."] },
      { type: "cta", label: "Compare live prices", to: "/prices", text: "Every bundle we sell for MTN, Telecel and AirtelTigo, with today's prices and validity side by side." },
    ],
  },
  {
    slug: "how-to-buy-data-online-ghana",
    title: "How to Buy Data Bundles Online in Ghana | DataYego",
    heading: "How to buy data bundles online in Ghana",
    description: "The three ways Ghanaians buy data: network short codes, the carrier apps and online shops. How to pay with Mobile Money and buy for any number.",
    excerpt: "A plain guide to the three ways of buying data in Ghana, how to pay with Mobile Money, and how to send a bundle to someone else's number.",
    category: "Guides",
    published: "2026-08-17",
    readMinutes: 6,
    body: [
    { type: "p", text: "There are three practical ways to buy data in Ghana: dial your network's own short code, use the network's app, or buy from an online data shop and pay with Mobile Money. All three put the same bundle on the same SIM. What differs is how much you have to type, what you end up paying, and whether you can send data to a number that is not your own." },
    { type: "h2", text: "The three ways Ghanaians buy data" },
    { type: "h3", text: "1. Dialling your network's short code" },
    { type: "p", text: "This is the oldest method and the most dependable, because it works on any handset and needs no internet. On MTN you dial *138# and follow the data menu. On Telecel you dial *700# and choose Buy Data. On AirtelTigo the data offers sit behind *111#. You pick a bundle from the list, confirm, and it is charged to your airtime or your Mobile Money wallet." },
    { type: "p", text: "The drawback is the menu. It is long, the options move around, and on a weak line it is easy to time out halfway or pick the wrong bundle." },
    { type: "h3", text: "2. The network apps" },
    { type: "p", text: "Each network has its own app: myMTN, Telecel Play and AT's own app. They do the short code's job on a proper screen, and show your balance and history too. You need a smartphone, some data or Wi-Fi to open the app, and a login tied to your number. That last part is the catch when the phone in your hand is not the phone that needs the data." },
    { type: "h3", text: "3. Online data shops" },
    { type: "p", text: "An online data shop buys bundles in volume from the networks and sells them on through a website. You choose the network and the bundle, type in the number that should receive it, pay by Mobile Money or card, and the bundle is pushed to that SIM automatically. No USSD menu at all." },
    { type: "p", text: "It is what most people reach for when buying for someone else, or when they want one page covering every network. DataYego works this way for [MTN](/mtn-data-bundles), [Telecel](/telecel-data-bundles) and [AirtelTigo](/airteltigo-data-bundles), with current sizes on the [prices page](/prices)." },
    { type: "table", head: ["Method", "Needs internet", "Best for"], rows: [["Network short code", "No", "Buying for your own SIM, anywhere, on any phone"], ["Network app", "Yes", "Seeing your balance and history on a smartphone"], ["Online data shop", "Yes", "Buying for any number on any network, with a receipt"]] },
    { type: "h2", text: "What you need before you start" },
    { type: "ul", items: ["The receiving number, in full and checked once. It does not have to be yours.", "The network that number is actually on. If it was ported, the prefix will not tell you the truth, so ask.", "The bundle you want, or the amount you want to spend. GHS 20 is enough if you are testing a new shop.", "A funded Mobile Money wallet or a card, plus the phone the wallet is registered to. You need it in your hand to approve the payment.", "Nothing else. On DataYego there is no sign-up step, and guest checkout works."] },
    { type: "h2", text: "Buying online, step by step" },
    { type: "ol", items: ["Open the [shop](/shop) and choose the network the receiving number is on.", "Pick the bundle size. Compare a few on the [prices](/prices) page if you are unsure what a gigabyte should cost you.", "Type the receiving number into the recipient field and read it back to yourself. This is the one mistake that is hard to undo.", "Choose how to pay: Mobile Money, card, or a DataYego wallet balance topped up earlier. Wallet payments skip the card and Mobile Money processing fee.", "Approve the payment on your phone. The next section explains what you will see.", "Wait on the confirmation screen for your order reference, which begins with YG-. Keep it.", "Check the bundle landed. If it has not after a few minutes, look the reference up on [Track Order](/track-order)."] },
    { type: "h2", text: "How paying with Mobile Money works" },
    { type: "p", text: "Payments on DataYego are secured by Paystack, the processor behind a lot of Ghanaian checkouts. The flow is the same wherever you meet it:" },
    { type: "ol", items: ["You choose Mobile Money and enter the number your wallet is registered to, plus your network: MTN, Telecel or AirtelTigo.", "A prompt arrives on that phone. Depending on the network you may first be sent a one-time code (OTP) to type in.", "You enter your Mobile Money PIN on your own phone to authorise the payment.", "The confirmation comes back to the shop, usually within seconds, and the order moves to paid."] },
    { type: "p", text: "Worth knowing about MTN: sometimes the approval prompt does not appear. It is not lost. Dial *170#, go to My Wallet, then My Approvals, enter your PIN, select the pending payment and approve it." },
    { type: "p", text: "The number you pay from and the number receiving the data are separate. You can pay from your MTN wallet for a bundle going to a Telecel number." },
    { type: "callout", text: "The 1% E-Levy on electronic transfers was repealed in April 2025, so it no longer applies. Any small fee you see at checkout is the payment processor's, not a government levy." },
    { type: "h2", text: "Buying data for someone else's number" },
    { type: "p", text: "This is normal, and it is what online shops are best at. On the networks' own menus you have to hunt for a Buy for Others option, and MTN in Ghana no longer lets you transfer data you already own to another MTN number. Online, the receiving number is just a field: type in your mother's number, pay from your wallet, and the data lands on her SIM." },
    { type: "p", text: "The recipient does not need an account, an app, or to do anything at all. The receipt and the YG- reference come to you, the buyer, not to them." },
    { type: "h2", text: "How long delivery takes" },
    { type: "p", text: "On DataYego, bundles are delivered automatically to any Ghana number, usually within minutes of the payment clearing. Most of that wait is the payment confirming, not the bundle." },
    { type: "p", text: "Delays do happen. Networks run maintenance, month-end evenings get busy, and sometimes a payment sits unconfirmed because the prompt was never answered. If your money has left your wallet and the data has not arrived, report it rather than buying again. Buying twice usually means two bundles, not a refund." },
    { type: "h2", text: "How to check an order went through" },
    { type: "p", text: "Work through these in order. Each one tells you something different." },
    { type: "ol", items: ["Check for the debit SMS from your Mobile Money wallet. No debit means the payment never completed.", "Look up your YG- reference on [Track Order](/track-order). That tells you what happened to the order itself.", "Have the recipient check their data balance: MTN on *138#, Telecel on *126#, AirtelTigo through their data menu or app. It can take a moment to refresh after a bundle lands."] },
    { type: "p", text: "If the debit went through but the order has not, send the YG- reference and the receiving number to [support](/support) on WhatsApp or by email. Those two details are enough to trace it. There is more on wrong numbers and wallet top-ups in the [FAQ](/faq)." },
    { type: "h2", text: "Staying safe when you pay" },
    { type: "p", text: "Most Mobile Money losses in Ghana are not hacked systems. They are people talked into approving something, or into handing over a code. MTN's own guidance is blunt: never share your PIN or OTP with anyone, not even someone claiming to be from MTN." },
    { type: "ul", items: ["Your MoMo PIN is typed on your own handset, into your own network's prompt. Never into a website, a form, a chat, or over the phone.", "A one-time code is exactly that. Anyone who calls asking you to read it out is trying to take your money, whoever they say they are.", "Read the prompt before you approve. The amount and the merchant name should match what you are buying.", "Do not use your date of birth or your phone number as your PIN. Those are the first things a fraudster tries.", "Treat 'I sent you money by mistake, please approve the reversal' as a scam. Verify with your network, never with the number that contacted you."] },
    { type: "callout", text: "No real seller, agent or network staff member will ever ask for your Mobile Money PIN or an OTP. There is no situation where they need it. DataYego never asks." },
    { type: "h2", text: "So which method should you use" },
    { type: "p", text: "For topping up your own phone, the short code is quick and needs nothing. For buying on another number, covering more than one network, or keeping a record of every purchase, an online shop is easier." },
    { type: "cta", label: "Buy data on DataYego", to: "/shop", text: "Choose a bundle, enter the number it should go to, and pay by Mobile Money, card or wallet balance. No account needed." },
    ],
  },
  {
    slug: "non-expiry-data-bundles-ghana",
    title: "Non-Expiry Data Bundles in Ghana, Explained | DataYego",
    heading: "Non-expiry data bundles in Ghana, explained",
    description: "What non-expiry data means in Ghana, how it differs from daily and monthly bundles, what MTN, Telecel and AT offer, and why your data finishes fast.",
    excerpt: "A plain guide to data that has no deadline: what non-expiry really means, what each Ghanaian network offers, and how to stop your bundle vanishing in a week.",
    category: "Explainers",
    published: "2026-08-17",
    readMinutes: 5,
    body: [
    { type: "p", text: "A non-expiry data bundle is data that stays on your line until you finish it. No deadline, no midnight cut-off. A daily, weekly or monthly bundle works the other way round: whatever you have not used when the period ends is gone. That one difference decides how much of what you paid for you actually get to use." },
    { type: "h2", text: "What non-expiry actually means" },
    { type: "p", text: "Every bundle carries two numbers that matter. The **size**, in megabytes or gigabytes. And the **validity**, which is how long you have to use it. When the clock runs out the balance goes to zero, whether you had used ninety per cent of it or ten." },
    { type: "p", text: "A non-expiry bundle removes the clock. The balance sits on the line and only drops as you browse. If you travel, if your phone stays off for two weeks, if you simply have a quiet month, the data waits for you. On some networks a new purchase also sits on top of an old balance so the two add up, but that is set by the network, so confirm it for your own line." },
    { type: "callout", text: "Non-expiry is not the same as unlimited. It is still a fixed amount of data. The only thing that has been removed is the deadline." },
    { type: "h2", text: "Why the difference matters for how Ghanaians actually buy" },
    { type: "p", text: "Most people here do not buy data once a month on a tidy salary rhythm. They top up small and often. GHS 20 today because work needs it, nothing for a week when money is tight, then more when a big download is coming. A short-validity bundle punishes that pattern: you buy on Monday, life gets busy, and by Sunday night part of it has evaporated." },
    { type: "ul", items: ["**You buy in small amounts.** A GHS 20 top-up with no deadline is money banked. The same GHS 20 on a one-day bundle has to be spent today or lost.", "**You buy for other people.** A parent sending data to a child at school cannot control when that child will actually use it.", "**Your usage is uneven.** Exam season, a slow month at work, a long stay somewhere with Wi-Fi. Usage drops, but a dated bundle keeps counting down anyway."] },
    { type: "h2", text: "What each network offers" },
    { type: "p", text: "This part changes often, so treat the specifics as something to confirm rather than memorise. In June 2025 the Minister for Communication, Digital Technology and Innovations, Samuel Nartey George, announced that operators would raise bundle values from 1 July 2025: about fifteen per cent more data on MTN and about ten per cent more on Telecel and AT, at unchanged prices. Line-ups have moved again since." },
    { type: "h3", text: "AT (formerly AirtelTigo)" },
    { type: "p", text: "AT is the network that made no-expiry data a mainstream idea in Ghana. Its **BigTime** bundles were launched and marketed on exactly that promise: no daily, weekly or monthly window, and the data stays until you finish it. The sizes attached to it have been revised several times since, so check the live menu on your own line rather than an old list online, or see our [AirtelTigo bundles](/airteltigo-data-bundles) page." },
    { type: "h3", text: "Telecel" },
    { type: "p", text: "Telecel publishes a **Flexi Non-Expiry** option on its broadband side, described in its own words as taking away the worry about data expiring, with the balance lasting until it is exhausted. Telecel also states that a non-expiry Flexi bundle cannot be set to renew automatically. Its mobile line-up is separate, and validity there varies by offer. Our [Telecel bundles](/telecel-data-bundles) page shows it on each one." },
    { type: "h3", text: "MTN" },
    { type: "p", text: "MTN's publicly listed mobile bundles carry stated validity periods, and MTN's own terms say the expiry date resets to match whatever bundle you buy next. Non-expiry MTN data is advertised very widely by data shops here, but we could not confirm the terms of such a product on MTN's own public pages, so we will not describe it as though we had. If anyone sells you MTN data as non-expiry, ask them to state the validity first. Our [MTN bundles](/mtn-data-bundles) page shows it next to each price." },
    { type: "callout", text: "Validity is set by the network, not by the shop. Any seller, us included, can only pass on the terms the network attaches to that bundle on that day, and those terms can change." },
    { type: "h2", text: "Why data shops sell non-expiry bundles" },
    { type: "p", text: "There is no mystery in this. Shops and resellers buy data through the networks' agent and dealer channels, usually in bulk, and send it on to customers' lines. The products in those channels are not always identical to the public USSD menu, and non-expiry stock is common in them. Two plain reasons it sells so widely:" },
    { type: "ul", items: ["**It is easier to sell honestly.** A customer who loses a bundle to a deadline blames the shop, even when the deadline came from the network.", "**It fits how people top up.** Small amounts, often, frequently gifted to somebody else's number. A countdown fits that badly."] },
    { type: "p", text: "What a shop cannot do is invent the terms. A shop that will not tell you the validity in plain words is a shop to walk away from." },
    { type: "h2", text: "What to check before you buy" },
    { type: "ol", items: ["**The validity, stated.** No expiry, thirty days, seven days, whatever it is. See it written next to the price before you pay.", "**Whether it stacks.** Ask whether a new bundle adds to your balance or replaces it. This differs by network.", "**The number.** Data goes to the number you type, not the number you meant. Check it digit by digit.", "**What happens if it stalls.** A real seller gives you a reference to quote and a way to reach a human being.", "**That the terms are current.** A bundle that was non-expiry last year may not be this year."] },
    { type: "h2", text: "Why your data seems to finish so fast" },
    { type: "p", text: "This is the most common complaint we hear, and non-expiry does not solve it. If 10GB disappears in a week, the deadline was never the problem. Something on the phone was eating it, usually more than one thing. The usual suspects:" },
    { type: "ul", items: ["**Background refresh.** Apps sync, pull feeds and check for messages while the phone sits in your pocket.", "**Automatic app updates.** A few apps updating over mobile data can cost hundreds of megabytes in one afternoon.", "**Video autoplay.** Social apps start playing video as it scrolls into view, whether you watch it or not.", "**Streaming quality.** High-definition video costs several times more than standard definition for the same minutes.", "**Hotspot and cloud backup.** A tethered laptop downloads at laptop scale, and photo backup left on any network pushes every clip you record."] },
    { type: "p", text: "The steps that save the most, in order:" },
    { type: "ol", items: ["Set app store updates to Wi-Fi only, in the Play Store's network preferences on Android or under Settings, App Store on iPhone.", "Turn off video autoplay in each social app's own data settings. It is not a phone setting, so do it app by app.", "Drop streaming quality to standard definition on mobile data.", "Turn on the phone's data saver. Android calls it Data Saver; iPhone calls it Low Data Mode.", "Switch off background refresh for apps that do not need updating live, and set photo backup to Wi-Fi only.", "Check the phone's data usage screen after a week. It ranks apps by consumption and usually names the culprit."] },
    { type: "h2", text: "How we handle this at DataYego" },
    { type: "p", text: "We sell MTN, Telecel and AirtelTigo bundles online, delivered automatically to any Ghana number, usually within minutes of the payment clearing. Pay by Mobile Money or card through Paystack, or from a prepaid DataYego wallet, which skips the processing fee. No account is needed, and every order carries a YG- reference you can quote if anything needs chasing." },
    { type: "p", text: "We will not claim every bundle we sell is non-expiry, because validity belongs to the network. What we do is show it next to the price on every bundle. Start at the [shop](/shop), or go straight to [MTN](/mtn-data-bundles), [Telecel](/telecel-data-bundles) or [AirtelTigo](/airteltigo-data-bundles). The [FAQ](/faq) covers delivery and stalled orders, and [support](/support) is a real person." },
    { type: "cta", label: "Compare bundle prices", to: "/prices", text: "Every bundle we sell shows its size, its price and its validity in one place, so you can see exactly what you are buying before you pay." },
    ],
  },
  {
    slug: "mtn-data-codes-ghana",
    title: "MTN Data Bundle Codes Ghana: All Short Codes | DataYego",
    heading: "MTN Ghana short codes and data bundle codes",
    description: "Every MTN Ghana short code that still works: *138# for data bundles, *124# for airtime, *156# for your own number, plus AFA and customer care.",
    excerpt: "The MTN Ghana short codes that actually work, from *138# for data bundles to *156# for your own number, each one checked against MTN's own channels.",
    category: "Codes",
    published: "2026-08-17",
    readMinutes: 5,
    body: [
    { type: "p", text: "Dial *138# to buy an MTN data bundle, *124# to check your airtime balance and *156# to see your own MTN number. Those three cover most of what people need day to day. Everything below was checked against MTN Ghana's own channels and other recent sources, because a wrong code wastes your time and sometimes your airtime." },
    { type: "h2", text: "Every MTN code worth saving" },
    { type: "p", text: "Dial each one exactly as written, with the star and the hash." },
    { type: "table", head: ["What you want", "Dial"], rows: [["Buy an MTN data bundle (main data menu)", "*138#"], ["Check your data bundle balance", "*138#"], ["Check your airtime balance", "*124#"], ["Check your own MTN number", "*156#"], ["Social media bundles (WhatsApp, Facebook, X, TikTok)", "*138*1*5#"], ["Unlimited bundles", "*138*1*4#"], ["Video and YouTube bundles", "*138*16#"], ["MTN Zone daily bundles", "*135#"], ["Personalised offers for your number", "*141#"], ["MTN Pulse (discounted calls and data)", "*567#"], ["MTN AFA bundles and registration", "*1848#"], ["Borrow airtime or data (Xtratime)", "*506#"], ["Share airtime credit with another MTN number (Me2U)", "*198#"], ["Recharge with a voucher PIN", "*134*voucher PIN#"], ["Recharge someone else's number with a voucher", "*144*their number*voucher PIN#"], ["MTN Mobile Money menu", "*170#"], ["Check your SIM registration status", "*400#"], ["Internet settings and 4G check", "*585#"], ["MTN customer care from an MTN line", "100"], ["MTN customer care from any line", "0244 300 000"]] },
    { type: "callout", text: "These are MTN Ghana codes only. Telecel and AirtelTigo use different ones, so a code that works on a friend's phone may do nothing on yours." },
    { type: "h2", text: "*138# is the main data menu" },
    { type: "p", text: "*138# is the code MTN itself advertises for data. It opens a menu where you choose a category, choose a bundle, then pay from your airtime or from Mobile Money. Fixed daily and monthly bundles, flexi bundles, social media bundles and video bundles all sit inside it." },
    { type: "p", text: "The shortcuts save a few steps. *138*1*5# goes to social media bundles for WhatsApp, Facebook, X, Instagram and TikTok. *138*1*4# goes to the unlimited plans. *138*16# goes to video and YouTube bundles. If a shortcut lands you somewhere odd, back out and dial plain *138# instead. The menu numbering is the part MTN changes most often." },
    { type: "p", text: "Buying on *138# is perfectly fine, and it is the quickest thing to do when you have run dry and cannot get online at all. The reason many people use a data shop instead is price and reach. Shop bundles are usually cheaper per gigabyte, and you can send data to any number rather than only the SIM in your hand. Compare for yourself on our [MTN bundle list](/mtn-data-bundles) or the full [price list](/prices) before you decide." },
    { type: "h2", text: "How to check your MTN data balance" },
    { type: "p", text: "Dial *138# and choose the balance option in the menu. On most handsets that means picking the bundle or account section, then the data balance. The exact numbers you press move around from time to time, so read the menu rather than memorising a sequence." },
    { type: "p", text: "The myMTN app shows your data balance on its home screen once you have signed in with your number, which is easier if you check often. Mobile Money users can also reach a balance option inside *170#. Some guides publish a one-shot code in the form *138*your number#. It is widely repeated on Ghanaian sites but we could not confirm it on MTN's own channels, so treat it as a maybe rather than a fact." },
    { type: "h2", text: "Your airtime balance and your own number" },
    { type: "p", text: "*124# shows your remaining airtime credit. It is free and it needs no data. *156# shows the number of the SIM sitting in the phone, which is the one to use when you have picked up an old SIM and cannot remember what number it carries. On a dual-SIM phone, dial from the MTN slot, otherwise you will get the other network's menu or nothing at all." },
    { type: "h2", text: "Putting data on somebody else's number" },
    { type: "p", text: "This is the one people get wrong. *198# is MTN's Me2U service and it shares **airtime credit, not data**. Handing over a data bundle you have already bought to another MTN number is not something MTN currently offers in Ghana, whatever older blog posts say." },
    { type: "p", text: "So if you want to send data to your mother in Kumasi, you either buy it on her phone or you use a shop that delivers to any number. That is what we do at [DataYego](/shop). You enter the recipient's number, pay by Mobile Money or card through Paystack, or from a prepaid DataYego wallet, and the bundle lands on that number, usually within minutes. There is no account to create, and every order carries a reference starting with YG- so you can [track it](/track-order) afterwards. It works the same way for MTN, Telecel and AirtelTigo numbers." },
    { type: "h2", text: "MTN AFA on *1848#" },
    { type: "p", text: "AFA is MTN's association bundle, built for groups such as farmers, traders, drivers and health workers, and it sells talk time and data at lower rates. *1848# is the code, both for registering and for buying once you are registered. Registration has changed over the years and now involves verifying who you are, so if the menu asks you to contact the programme partner before it will let you subscribe, that is normal rather than a fault." },
    { type: "h2", text: "Reaching MTN customer care" },
    { type: "p", text: "Dial 100 from an MTN line to reach customer care at no charge. From any other line, call 0244 300 000. MTN also answers on WhatsApp on 0554 300 000. Use those for anything to do with your SIM, your MoMo wallet, or a bundle MTN itself charged you for. If your question is about an order you placed with us, our [support page](/support) and our [FAQ](/faq) will be quicker, because MTN cannot see our orders." },
    { type: "h2", text: "When a code does not work" },
    { type: "p", text: "USSD failures are common and the cause is usually mundane. Work through these in order." },
    { type: "ol", items: ["Check exactly what you dialled. A missing star or hash, or a stray space, and the network simply rejects it.", "Dial from the right SIM. Dual-SIM phones default to whichever slot you used last.", "Wait a few minutes and try again. Congestion in the evenings makes USSD sessions time out part way through.", "Keep a little airtime on the line. The codes themselves are free, but a purchase paid from airtime will fail if the balance is short.", "Back out to the top. If a shortcut such as *138*1*4# lands somewhere unexpected, MTN has renumbered the menu and plain *138# will still get you there.", "Restart the phone or reseat the SIM if every code fails, then call 100 if it still will not go through."] },
    { type: "callout", text: "Menus change more often than codes do. The top-level codes here are stable, but the numbers you press inside them are not, so read each screen instead of typing a sequence from memory." },
    { type: "p", text: "Keep this page bookmarked and you will not have to hunt for *138# again. And if the bundle you want is cheaper from a shop than from the menu, that is worth two minutes of your time to check." },
    { type: "cta", label: "See MTN bundle prices", to: "/mtn-data-bundles", text: "Compare what a gigabyte costs on our list before you buy it on *138#." },
    ],
  },
  {
    slug: "telecel-data-codes-ghana",
    title: "Telecel Data Codes Ghana: Full Short Code List | DataYego",
    heading: "Telecel Ghana short codes and data bundle codes",
    description: "Verified Telecel Ghana short codes: *700# for data bundles, *126# for your data balance, *124# for airtime, *127# for your own number, and 100 for care.",
    excerpt: "The Telecel Ghana short codes that actually work, including the data bundle menu, balance checks and customer care, with the old Vodafone names explained.",
    category: "Codes",
    published: "2026-08-17",
    readMinutes: 5,
    body: [
    { type: "p", text: "The two you probably came for: dial *700# to open the Telecel data bundle menu and buy data, and *126# to check how much data you have left. For your airtime balance, dial *124#. To see your own Telecel number, dial *127#. To reach a human, dial **100** from your Telecel line." },
    { type: "p", text: "If you searched for a Vodafone Ghana code and landed here, you are still in the right place. **Vodafone Ghana is now Telecel Ghana.** Telecel Group completed the purchase of a 70 per cent stake in February 2023, and the Telecel brand was launched in Ghana on 13 March 2024. Same network, same SIM card, same number. New name." },
    { type: "p", text: "That rename is exactly why so many people are searching. Shops, adverts and the app all changed. Most of the everyday USSD codes did not: *124#, *126# and *127# carried over from the Vodafone days and still work. But some promotional menus were retired or renamed along the way, which is why an old blog post can send you to a code that no longer exists. Everything below is either stated on Telecel's own website or confirmed by at least two independent sources." },
    { type: "h2", text: "Telecel Ghana short codes at a glance" },
    { type: "table", head: ["What you want", "Dial"], rows: [["Buy data / open the data bundle menu", "*700#"], ["Check your data bundle balance", "*126#"], ["Check your airtime balance (and bundles)", "*124#"], ["Check your own Telecel number", "*127#"], ["Telecel Red offers (voice and data deals)", "*7070#"], ["Borrow airtime (SOS credit)", "*505#"], ["Transfer airtime to another Telecel number", "*516#"], ["Telecel Cash mobile money menu", "*110#"], ["Check your SIM registration status", "*400#"], ["Customer care from a Telecel line", "100"], ["Customer care from another network", "0505555111"]] },
    { type: "callout", text: "Codes we could not confirm against a recent, credible source are deliberately left out of that table. A wrong USSD code wastes your airtime and your afternoon, so we would rather list a short set that works than a long one that might not." },
    { type: "h2", text: "*700#: the data bundle menu" },
    { type: "p", text: "*700# is the main data menu on Telecel. It is where you browse and buy bundles, from small daily and hourly offers up to weekly and monthly plans, plus the Flexi option that lets you choose your own amount rather than a fixed package." },
    { type: "p", text: "Two things inside that menu are worth knowing. The first is pay-as-you-go browsing, which you can switch on or off from *700#. When your bundle runs out, PAYG lets your phone keep browsing and charges the data straight to your airtime. That is handy in an emergency and expensive the rest of the time, so many people turn it off and buy another bundle instead. The second is that you can buy a bundle for a different Telecel number from the same menu." },
    { type: "h2", text: "Checking your data and airtime balance" },
    { type: "p", text: "Telecel's own help pages draw a clear line between the two balance codes, and it is a line worth remembering. *124# shows your main airtime balance together with your bundle allocations. *126# shows only your bundle allocations, nothing else." },
    { type: "p", text: "So if you only want to know how much data is left, *126# is the cleaner one, and it lists each bundle separately with its own expiry when you have more than one running. If you are wondering whether you have enough cedis on the line to make a call, dial *124#." },
    { type: "p", text: "Both are free and neither needs internet, so they work on a basic phone and on a line with zero credit." },
    { type: "h2", text: "How to check your own Telecel number" },
    { type: "p", text: "Dial *127# and your number appears on the screen. It is free and works on any handset. If the code fails, check Settings, then About phone, then SIM status on Android, or simply call a friend and read your number off their screen." },
    { type: "p", text: "It is worth getting this right before you buy data anywhere, including at our [shop](/shop). A single wrong digit sends someone else a bundle, and once a bundle lands on a number it cannot be pulled back." },
    { type: "h2", text: "Sending data or airtime to someone else" },
    { type: "p", text: "Telecel's data bundle terms are clear that you cannot split a bundle you have already bought and hand part of it to a friend. What you can do is buy them a fresh bundle, either through *700# or through Telecel Cash on *110#." },
    { type: "p", text: "Airtime is different. *516# transfers credit from your Telecel line to another Telecel line. You choose the transfer option, enter the receiving number, enter your transfer PIN and confirm. There is a small charge, and it only works Telecel to Telecel. If you need to send data across networks, to an MTN or AirtelTigo number, no Telecel USSD menu will do it, and that is one of the gaps a data shop fills." },
    { type: "h2", text: "Telecel customer care" },
    { type: "p", text: "Dial **100** from your Telecel line and it is free. From another network, call **0505555111**. Telecel also lists WhatsApp support on 050 100 0300, an SMS line on 655 for mobile services and 755 for fixed services, and email at info@telecel.com.gh. For anything involving your SIM identity, such as a lost SIM or a registration problem, expect to visit a service centre with your Ghana Card." },
    { type: "h2", text: "When a code does not work" },
    { type: "p", text: "Most failed USSD attempts in Ghana come down to a handful of causes. Work through these in order before you conclude the code is dead." },
    { type: "ol", items: ["Check which SIM you are dialling from. On a dual-SIM phone the dialler often defaults to the other line, and a Telecel code dialled from an MTN SIM will simply fail.", "Type the code exactly, including the leading star and the closing hash, then press call. No spaces.", "Make sure you have network bars. USSD needs the mobile network, not Wi-Fi, so it will not work on Wi-Fi calling alone.", "Wait a few minutes and try again. USSD gateways get congested, especially in the evening and at month end, and a busy gateway looks exactly like a broken code.", "Toggle flight mode on and off, or restart the phone, to force the SIM back onto the network.", "If it still fails, dial 100 and ask. Menus do get reorganised, and care will give you the current path."] },
    { type: "callout", text: "An error like \"connection problem or invalid MMI code\" almost always means the wrong SIM slot or a busy network, not a broken phone. Switch the dialling SIM to your Telecel line and try again shortly." },
    { type: "h2", text: "Dialling the menu, or buying from a data shop" },
    { type: "p", text: "We should be straight with you: *700# is a perfectly good way to buy data. It is instant, it needs no internet, and it comes straight from the network. If you have credit on the line and you only ever buy for yourself, dialling works fine." },
    { type: "p", text: "A data shop is useful for two other reasons. The first is price. Shops buy in volume, so the same gigabyte usually costs less than the standard menu rate, and you can compare on our [prices](/prices) page before you commit. The second is reach. You can send a bundle to any Ghana number on MTN, Telecel or AirtelTigo, whichever network your own line is on, which is exactly what *516# and *700# will not do for you." },
    { type: "p", text: "DataYego sells MTN, Telecel and AirtelTigo bundles online and delivers them automatically, usually within minutes. You pay by Mobile Money or card through Paystack, or from a prepaid DataYego wallet. Checkout is open to guests, so no account is needed, and every order gets a reference starting with YG- that you can follow on [track order](/track-order). If anything looks unclear, the [FAQ](/faq) covers the common questions and [support](/support) will pick up the rest." },
    { type: "cta", label: "See Telecel bundle prices", to: "/telecel-data-bundles", text: "Compare current Telecel bundle sizes and prices before you dial anything." },
    ],
  },
  {
    slug: "airteltigo-data-codes-ghana",
    title: "AirtelTigo Data Code: All AT Ghana Short Codes | DataYego",
    heading: "AirtelTigo (AT) Ghana data codes and short codes",
    description: "Verified AirtelTigo (AT) Ghana short codes: dial *111# for data bundles, *504# for your data balance, *124# for airtime and *703# for your own number.",
    excerpt: "The AT (AirtelTigo) short codes worth saving, checked against the network's own channels, plus what to do when a code refuses to work.",
    category: "Codes",
    published: "2026-08-17",
    readMinutes: 5,
    body: [
    { type: "p", text: "On AT, the network most people still call AirtelTigo, four codes cover almost everything. Dial *111# for the data bundle menu, *504# to check your data balance, *124# to check your airtime, and *703# to see your own number. Every code on this page was checked against AT's own channels or the regulator. Anything we could not confirm has been left out rather than guessed." },
    { type: "table", head: ["What you want", "Dial"], rows: [["Buy a data bundle, including BigTime", "*111#"], ["Check your data balance", "*504#"], ["Check your airtime balance", "*124#"], ["Check your own number", "*703#"], ["AT Money menu", "*110#"], ["Check your SIM registration details", "*400#"], ["Customer care", "100"]] },
    { type: "h2", text: "Buying data on AT: *111#" },
    { type: "p", text: "*111# is the main data menu. Dial it, pick the bundle you want, choose whether the data is for yourself or another number, then choose how to pay. Payment usually comes off your airtime or your AT Money wallet. The data lands on the SIM straight away, and you get an SMS confirming it." },
    { type: "p", text: "The menu changes as AT adds and retires offers, so read the options on the screen rather than pressing numbers from memory. A promo that used to be option 2 can quietly become option 4." },
    { type: "h3", text: "BigTime data" },
    { type: "p", text: "BigTime is AT's best-known data offer, and the reason is simple: **BigTime data does not expire**. AT launched it as an answer to the common complaint of losing unused megabytes at the end of a validity period. You buy it, and it sits on your SIM until you finish it. There is no 24-hour or 30-day clock quietly running down." },
    { type: "p", text: "You buy BigTime through the same *111# menu. Sizes run from a cedi or two up to very large bundles, and AT has at times given extra data when you pay with AT Money rather than airtime. Treat any specific size or price you read online as a rough guide only, including on this page. Bundle tables go stale quickly, which is why we do not print AT's own prices here." },
    { type: "callout", text: "If your data disappears faster than you expect, it is usually not the bundle. Background app updates, cloud photo backups and auto-playing video are the usual culprits. Turn off automatic updates over mobile data and the difference is noticeable." },
    { type: "h2", text: "How to check your AirtelTigo data balance" },
    { type: "p", text: "Dial *504#. You will see a short message on screen saying your balance is on its way, and the details arrive by SMS a few seconds later. The SMS covers your data bundles and any bonus data you are holding, which is handy when you have several bundles stacked on one SIM." },
    { type: "p", text: "If nothing arrives after a minute, dial again before assuming something is wrong. SMS delivery on a busy network can lag. The AT Mobile App shows the same information with a bit more detail on usage." },
    { type: "h2", text: "How to check your airtime balance" },
    { type: "p", text: "Dial *124#. This is the credit balance enquiry, and it answers on screen rather than by SMS. Keep the two apart in your head: *124# is money on the SIM, *504# is megabytes. People often dial one expecting the other and conclude the code is broken." },
    { type: "h2", text: "How to check your own number on AT" },
    { type: "p", text: "Dial *703#. AT confirms this one directly, and it is free. Your number comes back with the country code in front, so 233 followed by nine digits. To write it the normal Ghanaian way, swap the 233 for a 0. So 233271234567 is 0271234567." },
    { type: "p", text: "This is worth doing before you buy data online anywhere. A single wrong digit sends the bundle to a stranger, and no network or vendor can pull it back once it has been delivered." },
    { type: "h2", text: "AT Money, SIM registration and customer care" },
    { type: "p", text: "*110# opens the AT Money menu. It kept the same code through the rebrand from AirtelTigo Money, so your wallet, PIN and menu did not change. You can register, send and receive money, pay bills and buy bundles from there." },
    { type: "p", text: "*400# shows your SIM registration details. This one is set by the National Communications Authority and works across all Ghanaian networks, not just AT. It is the quickest way to confirm your SIM is properly registered in your name before a deadline or a network sweep catches you out." },
    { type: "p", text: "For customer care, call 100 from your AT line. It is the network's own call centre. AT also runs support through the AT Mobile App, its social media pages and its service shops. We deliberately have not printed an alternative helpline number here, because the numbers floating around online contradict one another and we would rather you dial 100 and get through than dial a dead line." },
    { type: "h2", text: "Sending data to another number" },
    { type: "p", text: "Inside *111# you can choose to buy a bundle for someone else's number rather than your own, which covers most family situations. What we could not verify is a reliable code for transferring data you already own to another AT number, so we have not invented one. If a friend or a vendor gives you such a code, test it with the smallest amount possible first." },
    { type: "p", text: "This is one place where a data shop is genuinely easier. On [DataYego](/shop) you type in any Ghana number, MTN, Telecel or AT, and the bundle goes to that number. You do not need to be holding the SIM, and you do not need an account to do it." },
    { type: "h2", text: "When a code does not work" },
    { type: "p", text: "USSD failures are usually boring and fixable. Work through these in order." },
    { type: "ol", items: ["Check you dialled the full code, including the star at the front and the hash at the end. A missing # is the single most common reason a code fails.", "On a dual-SIM phone, make sure the code went out on the AT SIM. Most phones ask which SIM to use, and it is easy to tap the wrong one.", "Wait a minute and try again. Network congestion causes most connection problems, and the same code often works second time.", "Restart the phone. This clears a surprising number of stuck USSD sessions.", "If you are abroad, remember that many of these codes only work on the home network in Ghana.", "Still nothing? Call 100 and ask. If a code has changed, the call centre will know before any website does."] },
    { type: "p", text: "Remember too that MTN and Telecel have their own menus, so a code a friend swears by may simply belong to another network. Our [FAQ](/faq) covers the cross-network questions we get asked most." },
    { type: "h2", text: "Dialling AT, or buying from a data shop" },
    { type: "p", text: "Dialling *111# is a perfectly good way to buy data. It works without internet, it takes seconds, and nothing goes wrong with it. If that suits you, keep doing it." },
    { type: "p", text: "The case for a data shop is different. A shop like ours buys in volume, so a data shop is usually cheaper per gigabyte than the standard menu, and you can send a bundle to any Ghana number without touching that person's phone. DataYego sells MTN, Telecel and AirtelTigo bundles online, delivered automatically, usually within minutes. You pay by Mobile Money or card through Paystack, or from a prepaid DataYego wallet. Checkout is open to guests, so no account is needed, and every order carries a reference beginning with YG- that you can follow on [track order](/track-order)." },
    { type: "callout", text: "Before you buy from anyone, dial *703# and confirm the number you are about to type. It takes five seconds and saves the one mistake nobody can undo." },
    { type: "p", text: "If you are weighing it up, compare against what the *111# menu quotes you. Our [prices](/prices) are listed in full, and if anything is unclear our [support](/support) team will answer." },
    { type: "cta", label: "See AirtelTigo bundle prices", to: "/airteltigo-data-bundles", text: "Check current AT bundle sizes and prices, then send data to any Ghana number in a couple of taps." },
    ],
  },
];

export const BLOG_INDEX_TITLE = "Data Guides for Ghana — Codes, Prices & How-tos | DataYego";
export const BLOG_INDEX_DESCRIPTION =
  "Straight answers about buying and using data in Ghana: network short codes, how to buy with Mobile Money, bundle validity and what to check before you pay.";

/** Newest first. Posts sharing a date keep their order in the array above,
 *  so that order is the editorial one. */
export function sortedPosts() {
  return [...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published));
}

export function postBySlug(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}
