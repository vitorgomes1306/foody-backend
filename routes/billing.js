import express from 'express';
import authMiddleware from '../middlewares/auth.js';
import { addDays, billingPrisma as prisma, getBillingAccess, getBillingSettings, serializeBillingAccess } from '../utils/billing.js';
import { getBillingProvider } from '../billing/providers/index.js';
import { constructStripeEvent, stripeConfigurationStatus } from '../billing/providers/stripe.js';

const router = express.Router();
const VALID_PLANS = new Set(['lite', 'basic', 'master']);

function absoluteAppUrl(req) {
  const configured = String(process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  const origin = req.get('origin');
  return origin || `${req.protocol}://${req.get('host')}`;
}

async function requireAdmin(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Acesso exclusivo para administradores' });
  next();
}

async function activatePaidSubscription(checkoutSession) {
  const subscriptionId = checkoutSession?.metadata?.chefitoSubscriptionId;
  if (!subscriptionId) return;
  await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription || subscription.status === 'paid') return;
    const settings = await tx.billingSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new Error('Configuração de cobrança não encontrada');
    const latest = await tx.subscription.findFirst({
      where: { userId: subscription.userId, status: 'paid', endsAt: { gt: new Date() } },
      orderBy: { endsAt: 'desc' },
    });
    const now = new Date();
    const startsAt = latest?.endsAt && latest.endsAt > now ? latest.endsAt : now;
    const endsAt = addDays(startsAt, settings.subscriptionDays);
    const graceEndsAt = addDays(endsAt, settings.postExpirationGraceDays);
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'paid',
        providerPaymentId: typeof checkoutSession.payment_intent === 'string' ? checkoutSession.payment_intent : null,
        paymentMethod: checkoutSession.payment_method_types?.[0] || null,
        startsAt,
        endsAt,
        graceEndsAt,
        paidAt: now,
      },
    });
  });
}

router.post('/billing/webhooks/stripe', async (req, res) => {
  try {
    const signature = req.get('stripe-signature');
    if (!signature || !req.rawBody) return res.status(400).json({ error: 'Assinatura do webhook ausente' });
    const event = constructStripeEvent(req.rawBody, signature);
    if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
      await activatePaidSubscription(event.data.object);
    }
    if (event.type === 'checkout.session.async_payment_succeeded') {
      await activatePaidSubscription(event.data.object);
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const checkoutId = event.data.object.id;
      await prisma.subscription.updateMany({ where: { providerCheckoutId: checkoutId, status: 'pending' }, data: { status: 'failed' } });
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('Webhook Stripe rejeitado:', error.message);
    return res.status(400).json({ error: 'Webhook inválido' });
  }
});

router.get('/billing/status', authMiddleware, async (req, res) => {
  const access = await getBillingAccess(req.userId);
  return res.json(serializeBillingAccess(access));
});

router.get('/billing/history', authMiddleware, async (req, res) => {
  const rows = await prisma.subscription.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20 });
  return res.json(rows.map((row) => ({ ...row, amount: String(row.amount) })));
});

router.post('/billing/checkout', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const plan = VALID_PLANS.has(req.body?.plan) ? req.body.plan : user.plan;
    if (plan !== user.plan) return res.status(400).json({ error: 'O plano informado não corresponde ao plano da conta' });
    const settings = await getBillingSettings();
    const amount = settings[`${plan}Price`];
    const pending = await prisma.subscription.create({ data: { userId: user.id, plan, provider: settings.activeProvider, amount } });
    try {
      const baseUrl = absoluteAppUrl(req);
      const checkout = await getBillingProvider(settings.activeProvider).createCheckout({
        customerId: user.billingCustomerId,
        customerEmail: user.email,
        subscriptionId: pending.id,
        userId: user.id,
        plan,
        amount,
        successUrl: `${baseUrl}/subscriptions`,
        cancelUrl: `${baseUrl}/subscriptions`,
      });
      await prisma.$transaction([
        prisma.subscription.update({ where: { id: pending.id }, data: { providerCheckoutId: checkout.checkoutId } }),
        ...(user.billingCustomerId ? [] : [prisma.user.update({ where: { id: user.id }, data: { billingCustomerId: checkout.customerId } })]),
      ]);
      return res.status(201).json({ url: checkout.url, checkoutId: checkout.checkoutId });
    } catch (error) {
      await prisma.subscription.update({ where: { id: pending.id }, data: { status: 'failed' } });
      throw error;
    }
  } catch (error) {
    console.error('Erro ao criar checkout:', error);
    const setupError = /não configurada|não suportado/.test(error.message);
    return res.status(setupError ? 503 : 500).json({ error: setupError ? error.message : 'Não foi possível iniciar o pagamento' });
  }
});

router.get('/billing/admin/settings', authMiddleware, requireAdmin, async (_req, res) => {
  const settings = await getBillingSettings();
  return res.json({
    activeProvider: settings.activeProvider,
    prices: { lite: String(settings.litePrice), basic: String(settings.basicPrice), master: String(settings.masterPrice) },
    initialTrialDays: settings.initialTrialDays,
    postExpirationGraceDays: settings.postExpirationGraceDays,
    subscriptionDays: settings.subscriptionDays,
    providers: [
      { id: 'stripe', name: 'Stripe', available: true, configuration: stripeConfigurationStatus() },
      { id: 'mercado_pago', name: 'Mercado Pago', available: false },
      { id: 'asaas', name: 'Asaas', available: false },
    ],
  });
});

router.patch('/billing/admin/settings', authMiddleware, requireAdmin, async (req, res) => {
  const prices = req.body?.prices || {};
  const parsePrice = (value) => {
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 999999 ? parsed.toFixed(2) : null;
  };
  const litePrice = parsePrice(prices.lite);
  const basicPrice = parsePrice(prices.basic);
  const masterPrice = parsePrice(prices.master);
  const initialTrialDays = Number.parseInt(req.body?.initialTrialDays, 10);
  const postExpirationGraceDays = Number.parseInt(req.body?.postExpirationGraceDays, 10);
  if (!litePrice || !basicPrice || !masterPrice) return res.status(400).json({ error: 'Informe valores válidos para todos os planos' });
  if (![initialTrialDays, postExpirationGraceDays].every((value) => Number.isInteger(value) && value >= 0 && value <= 365)) {
    return res.status(400).json({ error: 'Os dias de carência devem estar entre 0 e 365' });
  }
  if (req.body?.activeProvider !== 'stripe') return res.status(400).json({ error: 'Este provedor ainda não está disponível' });
  const settings = await prisma.billingSettings.update({
    where: { id: 1 },
    data: { activeProvider: 'stripe', litePrice, basicPrice, masterPrice, initialTrialDays, postExpirationGraceDays },
  });
  return res.json({ message: 'Configurações salvas', updatedAt: settings.updatedAt });
});

router.get('/billing/admin/customers', authMiddleware, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    select: { id: true, name: true, email: true, plan: true, createdAt: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'desc' },
  });
  const result = await Promise.all(users.map(async (user) => {
    const access = await getBillingAccess(user.id);
    return { ...user, subscriptions: undefined, billing: serializeBillingAccess(access) };
  }));
  return res.json(result);
});

export default router;
