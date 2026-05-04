export type Network = 'MTN' | 'Telecel' | 'AirtelTigo';
export type DeliveryType = 'Instant' | 'Manual';
export type OrderStatus = 'Pending' | 'Pending Payment' | 'Paid' | 'Processing' | 'Reprocessed' | 'Delivered' | 'Failed' | 'Voided';

export const DELIVERY_LABEL = 'Fast Delivery';

export interface Bundle {
  id: string;
  network: Network;
  bundleSizeGB: number;
  priceGHS: number;
  deliveryType: DeliveryType;
  active: boolean;
  popular?: boolean;
}

export interface Order {
  id: string;
  orderId: string;
  recipientNumber: string;
  network: Network;
  productId: string;
  amountGHS: number;
  status: OrderStatus;
  bundleSizeGB: number;
  supplierReference?: string;
  deliveryNote?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export const BUNDLES: Bundle[] = [
  { id: '1', network: 'MTN', bundleSizeGB: 1, priceGHS: 5.50, deliveryType: 'Instant', active: true, popular: true },
  { id: '2', network: 'MTN', bundleSizeGB: 2, priceGHS: 10.00, deliveryType: 'Instant', active: true },
  { id: '3', network: 'MTN', bundleSizeGB: 3, priceGHS: 14.00, deliveryType: 'Instant', active: true, popular: true },
  { id: '4', network: 'MTN', bundleSizeGB: 5, priceGHS: 22.00, deliveryType: 'Instant', active: true, popular: true },
  { id: '5', network: 'MTN', bundleSizeGB: 10, priceGHS: 40.00, deliveryType: 'Manual', active: true },
  { id: '6', network: 'MTN', bundleSizeGB: 15, priceGHS: 55.00, deliveryType: 'Manual', active: true },
  { id: '7', network: 'MTN', bundleSizeGB: 20, priceGHS: 70.00, deliveryType: 'Manual', active: true },
  { id: '8', network: 'Telecel', bundleSizeGB: 1, priceGHS: 5.00, deliveryType: 'Instant', active: true },
  { id: '9', network: 'Telecel', bundleSizeGB: 2, priceGHS: 9.50, deliveryType: 'Instant', active: true, popular: true },
  { id: '10', network: 'Telecel', bundleSizeGB: 5, priceGHS: 21.00, deliveryType: 'Instant', active: true },
  { id: '11', network: 'Telecel', bundleSizeGB: 10, priceGHS: 38.00, deliveryType: 'Manual', active: true },
  { id: '12', network: 'Telecel', bundleSizeGB: 15, priceGHS: 52.00, deliveryType: 'Manual', active: true },
  { id: '13', network: 'AirtelTigo', bundleSizeGB: 1, priceGHS: 4.50, deliveryType: 'Instant', active: true },
  { id: '14', network: 'AirtelTigo', bundleSizeGB: 2, priceGHS: 8.50, deliveryType: 'Instant', active: true },
  { id: '15', network: 'AirtelTigo', bundleSizeGB: 5, priceGHS: 20.00, deliveryType: 'Instant', active: true, popular: true },
  { id: '16', network: 'AirtelTigo', bundleSizeGB: 10, priceGHS: 36.00, deliveryType: 'Manual', active: true },
  { id: '17', network: 'AirtelTigo', bundleSizeGB: 20, priceGHS: 65.00, deliveryType: 'Manual', active: true },
];

export const NETWORKS: Network[] = ['MTN', 'Telecel', 'AirtelTigo'];

// Priority order for sorting: MTN first, then Telecel, then AirtelTigo
export const NETWORK_ORDER: Record<string, number> = { MTN: 0, Telecel: 1, AirtelTigo: 2 };

export const NETWORK_COLORS: Record<Network, string> = {
  MTN: 'bg-mtn text-mtn-foreground',
  Telecel: 'bg-telecel text-telecel-foreground',
  AirtelTigo: 'bg-airteltigo text-airteltigo-foreground',
};

export const NETWORK_BORDER_COLORS: Record<Network, string> = {
  MTN: 'border-mtn',
  Telecel: 'border-telecel',
  AirtelTigo: 'border-airteltigo',
};

export const FAQ_DATA = [
  {
    question: 'Is Datasika really cheaper than buying data directly from MTN, Telecel, or AirtelTigo?',
    answer: 'Yes — Datasika prices are genuinely much cheaper than buying direct. Same bundle, same network, far lower price.',
  },
  {
    question: 'How fast is data delivered after I pay?',
    answer: 'Delivery is usually fast — most bundles arrive within a few minutes. Delivery times may vary, and in rare cases may take up to a few hours. If a bundle has not arrived after 12 hours, contact support.',
  },
  {
    question: 'How long do my bundles last?',
    answer: 'MTN bundles are valid for 90 days. Telecel and AirtelTigo bundles do not expire — your data stays on the line until you use it.',
  },
  {
    question: 'Which payment methods do you accept?',
    answer: 'MTN MoMo, Telecel Cash, AirtelTigo Money, Visa, Mastercard, and your DataSika wallet — all secured via Paystack.',
  },
  {
    question: 'Can I buy data for someone else\'s number?',
    answer: 'Yes — just enter the recipient\'s number when checking out, on any supported network.',
  },
  {
    question: 'Do I need an account to buy data?',
    answer: 'No — you can buy as a guest. Creating an account is optional but gives you wallet funding, order history, easier tracking, and better support.',
  },
  {
    question: 'What happens if my data doesn\'t arrive?',
    answer: 'If a bundle hasn\'t arrived after 12 hours, contact support at support@datasika.com or via live chat. Failed orders are automatically refunded.',
  },
  {
    question: 'How do I become a DataSika agent?',
    answer: 'Apply for free on the Become an Agent page. Once approved, activate your store subscription to get your personal store link, set your prices, and start earning when customers buy through your store.',
  },
  {
    question: 'Is Datasika safe to use?',
    answer: 'Yes — payments are processed through Paystack, the site is SSL-encrypted, and Datasika has served 50,000+ Ghanaians since launching in 2025.',
  },
];

export const SUPPORT_EMAIL = 'support@datasika.com';
export const WHATSAPP_NUMBER = '233200000000'; // kept for agent store WhatsApp (agent's own number)
export const WHATSAPP_MESSAGE = 'Hello DataSika Support, I need help with my order.';

export const generateOrderId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'DS-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const validateGhanaPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s/g, '');
  return /^0[2-5][0-9]{8}$/.test(cleaned);
};

export const formatPrice = (price: number): string => {
  return `GHS ${price.toFixed(2)}`;
};
