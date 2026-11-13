/* The texts DY Services sends, as plain strings. Kept apart from index.ts so the wording can be tested.

   Ghana's networks drop texts that contain certain words from a sender name like ours, with no error: the text is
   accepted and never arrives. Tested on 13 Nov 2026 from "Dyservice" to an MTN line:
     arrived:  "DY Services:", "your checker", "S/N", "Serial", "PIN", "Code", "is now registered on AFA", "Order SV-..."
     blocked:  the exam names ("WASSCE", "WAEC") and "Results Checker"
   Earlier tests also showed "data", "bundle", "GB", network names and https links are dropped.
   So these texts never name the exam or a website, and never use the product's name. The buyer knows what they
   bought; the order page and the email say which checker it is and where to use it.

   Every PIN goes in the text, five to a text, the way voucher sellers do it. A very large order would flood the
   phone, so above TEXT_PINS_MOST one text says where they are instead. */

export const TEXT_PINS_EACH = 5;
export const TEXT_PINS_MOST = 50;

export interface TextOrder {
  reference: string; kind?: string; phone: string; email?: string | null;
  pins: { serial: string; pin: string }[]; afa?: { phone?: string } | null;
}

const realEmail = (email?: string | null) => Boolean(email) && !/@guest\.datayego\.com$/i.test(String(email));

/** The texts to send for one delivered order, in order. Empty when there is nothing to say. */
export function serviceTexts(o: TextOrder): string[] {
  if (o.kind === "afa") return [`DY Services: ${o.afa?.phone ?? o.phone} is now registered on AFA. Order ${o.reference}.`];
  const n = o.pins.length;
  if (n === 0) return [];
  if (n === 1) return [`DY Services: your checker. S/N ${o.pins[0].serial} PIN ${o.pins[0].pin}. Order ${o.reference}.`];
  if (n > TEXT_PINS_MOST) return [`DY Services: your ${n} checkers are saved under order ${o.reference}. ${realEmail(o.email) ? "We have emailed them to you." : "Open your order on our site to see them."}`];
  const total = Math.ceil(n / TEXT_PINS_EACH);
  const texts: string[] = [];
  for (let t = 0; t < total; t++) {
    const start = t * TEXT_PINS_EACH;
    const list = o.pins.slice(start, start + TEXT_PINS_EACH).map((p, i) => `${start + i + 1}) S/N ${p.serial} PIN ${p.pin}`).join(" ");
    texts.push(`DY Services: your ${n} checkers${total > 1 ? `, text ${t + 1} of ${total}` : ""}. ${list}. Order ${o.reference}.`);
  }
  return texts;
}
