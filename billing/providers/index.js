import { createStripeCheckout } from './stripe.js';

const providers = {
  stripe: { createCheckout: createStripeCheckout },
};

export function getBillingProvider(name) {
  const provider = providers[String(name || '').toLowerCase()];
  if (!provider) throw new Error(`Provedor de cobrança não suportado: ${name}`);
  return provider;
}
