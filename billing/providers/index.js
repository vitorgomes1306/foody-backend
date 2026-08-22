import { createStripeCheckout } from './stripe.js';
import { createSicoobCheckout, getSicoobCharge } from './sicoob.js';

const providers = {
  stripe: { createCheckout: createStripeCheckout },
  sicoob: { createCheckout: createSicoobCheckout, getCharge: getSicoobCharge },
};

export function getBillingProvider(name) {
  const provider = providers[String(name || '').toLowerCase()];
  if (!provider) throw new Error(`Provedor de cobrança não suportado: ${name}`);
  return provider;
}
