/* ══════════════════════════════════════════════════════════════
   FAQ content. Every answer here describes how YieGo actually
   behaves today — if the product changes, change these too.
   `preview: true` marks the questions shown on the homepage.
   ══════════════════════════════════════════════════════════════ */

export interface FaqItem {
  q: string;
  a: string;
  preview?: boolean;
}

export interface FaqGroup {
  title: string;
  items: FaqItem[];
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "Buying data",
    items: [
      {
        q: "Which networks can I buy data for?",
        a: "MTN, Telecel and AirtelTigo. You choose the network first, then the bundle, then the number receiving the data.",
        preview: true,
      },
      {
        q: "How long does delivery take?",
        a: "Most orders are delivered within minutes of payment clearing. The order is sent to the network automatically — nobody has to process it by hand. If a network is slow, the order stays visible with its status until it completes.",
        preview: true,
      },
      {
        q: "Can I buy data for someone else?",
        a: "Yes. Enter their number as the recipient. You can buy for family, friends or customers — the data goes to the number you enter, not to your own line.",
        preview: true,
      },
      {
        q: "Do I need an account to buy?",
        a: "No. You can check out as a guest and pay by Mobile Money or card. You will get a YieGo reference to track the order. Creating an account adds the wallet, saved details and full order history.",
        preview: true,
      },
      {
        q: "Can someone else pay for my order?",
        a: "Yes. Create the order, then share the YieGo reference with another YieGo user and they can pay it for you. The recipient number and bundle are locked when the order is created, so payment cannot change what was ordered.",
      },
    ],
  },
  {
    title: "Payments and wallet",
    items: [
      {
        q: "How can I pay?",
        a: "From your YieGo wallet balance, or directly by Mobile Money or card through Paystack. Guests pay by Mobile Money or card.",
        preview: true,
      },
      {
        q: "What is the YieGo wallet?",
        a: "A balance you top up once and spend across many orders. It makes buying faster — no re-entering payment details every time — and every credit and debit appears in your wallet statement.",
      },
      {
        q: "Is my payment secure?",
        a: "Payments are processed by Paystack, and YieGo confirms every payment directly with Paystack's servers before an order moves. Your wallet balance can only be changed by our server, never from the browser or app. YieGo never sees or stores your card details or Mobile Money PIN.",
        preview: true,
      },
    ],
  },
  {
    title: "Orders and problems",
    items: [
      {
        q: "How do I track my order?",
        a: "Every order gets a YieGo reference beginning with YG-. Enter it on the Track Order page to see payment and delivery status. If you have an account, all your orders are listed under Orders.",
        preview: true,
      },
      {
        q: "What if my data does not arrive?",
        a: "Open the order and check its status first — some networks confirm a little later than others. If it still has not arrived, contact support with your YieGo reference and the team will trace it with the network.",
        preview: true,
      },
      {
        q: "Can I get a refund?",
        a: "If an order fails and the data is never delivered, contact support with your reference and the team will resolve it. Our full refund terms are on the Refunds page.",
      },
      {
        q: "I entered the wrong number — what now?",
        a: "Contact support immediately with your YieGo reference. Once a bundle has been delivered to a number by the network it cannot be reversed, so reach out as fast as possible.",
      },
    ],
  },
  {
    title: "Account and support",
    items: [
      {
        q: "How do I create an account?",
        a: "Choose Create account, enter your email and a password, and confirm your email address. You can then add your name and phone number in your account settings.",
      },
      {
        q: "How do I get help?",
        a: "The 24/7 AI assistant answers most questions instantly. For anything account-specific — a stuck order, a payment question, a dispute — contact the team on WhatsApp or by email with your YieGo reference.",
        preview: true,
      },
      {
        q: "How do I keep my account safe?",
        a: "Never share your password, one-time code, card details or Mobile Money PIN with anyone — including anyone claiming to be from YieGo. Our team and the AI assistant will never ask you for them.",
      },
    ],
  },
];

/** The handful shown on the homepage FAQ preview. */
export const FAQ_PREVIEW: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items)
  .filter((i) => i.preview)
  .slice(0, 6);
