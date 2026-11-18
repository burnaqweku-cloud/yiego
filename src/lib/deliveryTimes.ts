/* "Why does my data sometimes take longer?" (owner, 18 Nov 2026): what happens after payment and what decides the
   speed, in our own words. Shared by the main site (/delivery-times) and every agent store (<store>/delivery-times),
   so it never names us: "we" is whoever's shop the reader is in. Rules it keeps (tested in deliveryTimes.test.ts):
   MTN verification "can take a few weeks"; no word about refunds or orders failing; no promise that isn't true
   (no "100%", no "always delivered", no "instant"). */

export interface DeliveryStep { title: string; body: string }
export interface DeliveryReason { key: "busy" | "first_mtn" | "network" | "number"; title: string; body: string }

export const DELIVERY_TIMES = {
  kicker: "Good to know",
  title: "Why does my data sometimes take longer?",
  lead: "Often it lands within minutes. When a network is busy, it can take a few hours. Here is what happens after you pay, and what decides how fast it arrives.",
  stepsTitle: "From your payment to your phone",
  steps: [
    { title: "You pay", body: "As soon as your payment is confirmed, your order starts moving. It doesn't wait in a line on our side." },
    { title: "We pass it to the network", body: "This part is automatic. Your order goes straight to MTN, Telecel or AirtelTigo; nobody has to type it in by hand." },
    { title: "The network loads it", body: "The network checks the number and puts the bundle on it. That last step happens on their side, and it's the part we can't speed up." },
  ] as DeliveryStep[],
  notNetworkTitle: "We sell the data, we don't run the network",
  notNetworkBody: "We buy bundles and send your order on to the network, but we aren't MTN, Telecel or AirtelTigo. Once your order is with them, how quickly it lands is down to them.",
  reasonsTitle: "Quick one day, slow the next: why?",
  reasonsLead: "It comes down to how busy the network is at that moment. The usual reasons an order takes longer:",
  reasons: [
    { key: "busy", title: "Busy hours", body: "When a lot of people buy at the same time, the network works through the orders one after another, yours included." },
    { key: "first_mtn", title: "A number's first MTN bundle", body: "MTN verifies a number the first time it receives a bundle from our supplier. That can take a few weeks. After that, orders for the number go through without the wait." },
    { key: "network", title: "A slow spell at the network", body: "Network systems sometimes slow down or go into maintenance. When it clears, the orders that were waiting move again." },
    { key: "number", title: "A slip in the number", body: "A wrong digit, or a number on a different network from the bundle, holds an order up. It's worth checking the number before you pay." },
  ] as DeliveryReason[],
  canCantTitle: "What we can and can't do",
  cant: "Make the network go faster. Once your order is with the network, nobody on our side can push it through quicker, and we won't pretend otherwise. The honest update is: it's on its way.",
  can: "Look into an order that seems truly stuck. Send us your order ID and we'll check what is happening with it.",
  trackedTitle: "Your order is followed the whole way",
  trackedBody: "Every order is recorded from the moment you pay and followed until it lands. You can see where yours is at any time on the Track page.",
  liveTitle: "See the speed before you buy",
  liveBody: "Next to MTN on the buy page you'll see how long orders are taking right now, worked out from real orders over the last hour. Take it as a guide rather than a promise: an order can land sooner, and sometimes a little later.",
  back: "Back to buying data",
} as const;

/** Every piece of text on the page, for checks. */
export function deliveryTimesText(): string[] {
  const c = DELIVERY_TIMES;
  return [c.kicker, c.title, c.lead, c.stepsTitle, ...c.steps.flatMap((s) => [s.title, s.body]), c.notNetworkTitle, c.notNetworkBody,
    c.reasonsTitle, c.reasonsLead, ...c.reasons.flatMap((r) => [r.title, r.body]), c.canCantTitle, c.cant, c.can, c.trackedTitle, c.trackedBody, c.liveTitle, c.liveBody, c.back];
}

/** The networks shown in the "right now" box, in the order customers know them; any other network follows. */
export function speedNetworks(names: string[]): string[] {
  const order = ["MTN", "Telecel", "AirtelTigo"];
  return [...order.filter((n) => names.includes(n)), ...names.filter((n) => !order.includes(n)).sort()];
}
