const WHATSAPP_NUMBER = '233275644195';

export type SupportContext =
  | { type: 'user'; username?: string }
  | { type: 'guest'; orderId?: string }
  | { type: 'agent'; storeName?: string }
  | { type: 'agent_activation'; storeName?: string }
  | { type: 'order'; orderId?: string; phone?: string; network?: string; bundle?: string }
  | { type: 'wallet'; username?: string; reference?: string }
  | { type: 'default' };

function buildMessage(ctx: SupportContext): string {
  switch (ctx.type) {
    case 'user':
      return ctx.username
        ? `Hi DataSika Support, my username is ${ctx.username}. I need help with `
        : 'Hi DataSika Support, I need help with my account.';
    case 'guest':
      return 'Hi DataSika Support, please I need help. My issue is:';
    case 'agent':
      return ctx.storeName
        ? `Hi DataSika Support, I'm an agent. My store name is ${ctx.storeName}. I need help with `
        : "Hi DataSika Support, I'm an agent. I need help with my store.";
    case 'agent_activation':
      return ctx.storeName
        ? `Hi DataSika Support, I'm an agent. My store name is ${ctx.storeName}. I need help with activating my store subscription.`
        : "Hi DataSika Support, I'm an agent. I need help with activating my store subscription.";
    case 'order': {
      const parts = ['Hi DataSika Support, I need help with my order.'];
      if (ctx.orderId) parts.push(`Order ID: ${ctx.orderId}.`);
      if (ctx.phone) parts.push(`Recipient: ${ctx.phone}.`);
      if (ctx.network) parts.push(`Network: ${ctx.network}.`);
      if (ctx.bundle) parts.push(`Bundle: ${ctx.bundle}.`);
      return parts.join(' ');
    }
    case 'wallet':
      return ctx.username
        ? `Hi DataSika Support, I need help with my wallet. Username: ${ctx.username}.${ctx.reference ? ` Transaction Ref: ${ctx.reference}.` : ''}`
        : `Hi DataSika Support, I need help with my wallet.${ctx.reference ? ` Transaction Ref: ${ctx.reference}.` : ''}`;
    default:
      return 'Hi DataSika Support, please I need help. My issue is: ';
  }
}

export function getWhatsAppSupportLink(ctx: SupportContext = { type: 'default' }): string {
  const message = buildMessage(ctx);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function openWhatsAppSupport(ctx: SupportContext = { type: 'default' }): void {
  window.open(getWhatsAppSupportLink(ctx), '_blank');
}
