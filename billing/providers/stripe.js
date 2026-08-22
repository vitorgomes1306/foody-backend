import Stripe from 'stripe';

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurada');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function stripeConfigurationStatus() {
  return {
    secretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    ready: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
  };
}

export async function createStripeCheckout({ customerId, customerEmail, subscriptionId, userId, plan, amount, successUrl, cancelUrl }) {
  const stripe = stripeClient();
  let stripeCustomerId = customerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({ email: customerEmail, metadata: { chefitoUserId: String(userId) } });
    stripeCustomerId = customer.id;
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: stripeCustomerId,
    payment_method_types: ['card', 'pix'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: Math.round(Number(amount) * 100),
        product_data: { name: `Chefito ${plan}`, description: 'Acesso pré-pago por 30 dias' },
      },
    }],
    metadata: { chefitoSubscriptionId: subscriptionId, chefitoUserId: String(userId), chefitoPlan: plan },
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cancelUrl}${cancelUrl.includes('?') ? '&' : '?'}checkout=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
  });
  return { checkoutId: session.id, url: session.url, customerId: stripeCustomerId };
}

export function constructStripeEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET não configurada');
  return stripeClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
