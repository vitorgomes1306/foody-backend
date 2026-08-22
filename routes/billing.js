import express from 'express';
import authMiddleware from '../middlewares/auth.js';
import { addDays, billingPrisma as prisma, getBillingAccess, getBillingSettings, serializeBillingAccess } from '../utils/billing.js';
import { getBillingProvider } from '../billing/providers/index.js';
import { constructStripeEvent, stripeConfigurationStatus } from '../billing/providers/stripe.js';
import { configureSicoobWebhook, getSicoobCharge, sicoobConfigurationStatus } from '../billing/providers/sicoob.js';

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

async function activatePaidSubscription(subscriptionId, payment = {}) {
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
        providerPaymentId: payment.providerPaymentId || null,
        paymentMethod: payment.paymentMethod || null,
        startsAt,
        endsAt,
        graceEndsAt,
        paidAt: now,
      },
    });
  });
}

async function confirmSicoobCharge(txid) {
  const subscription = await prisma.subscription.findFirst({ where: { provider: 'sicoob', providerCheckoutId: txid } });
  if (!subscription) return { confirmed: false, reason: 'not_found' };
  if (subscription.status === 'paid') return { confirmed: true, subscriptionId: subscription.id };
  const charge = await getSicoobCharge(txid);
  if (String(charge?.status || '').toUpperCase() !== 'CONCLUIDA') return { confirmed: false, reason: 'pending' };
  const expectedCents = Math.round(Number(subscription.amount) * 100);
  const receivedCents = Math.round(Number(charge?.valor?.original) * 100);
  if (!Number.isFinite(receivedCents) || receivedCents !== expectedCents) throw new Error('Valor confirmado pelo Sicoob diverge da assinatura');
  const receivedPix = Array.isArray(charge?.pix) ? charge.pix[0] : null;
  await activatePaidSubscription(subscription.id, {
    providerPaymentId: receivedPix?.endToEndId || txid,
    paymentMethod: 'pix',
  });
  return { confirmed: true, subscriptionId: subscription.id };
}

router.post('/billing/webhooks/stripe', async (req, res) => {
  try {
    const signature = req.get('stripe-signature');
    if (!signature || !req.rawBody) return res.status(400).json({ error: 'Assinatura do webhook ausente' });
    const event = constructStripeEvent(req.rawBody, signature);
    if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
      await activatePaidSubscription(event.data.object?.metadata?.chefitoSubscriptionId, {
        providerPaymentId: typeof event.data.object.payment_intent === 'string' ? event.data.object.payment_intent : null,
        paymentMethod: event.data.object.payment_method_types?.[0] || null,
      });
    }
    if (event.type === 'checkout.session.async_payment_succeeded') {
      await activatePaidSubscription(event.data.object?.metadata?.chefitoSubscriptionId, {
        providerPaymentId: typeof event.data.object.payment_intent === 'string' ? event.data.object.payment_intent : null,
        paymentMethod: event.data.object.payment_method_types?.[0] || null,
      });
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

router.post(['/billing/webhooks/sicoob', '/billing/webhooks/sicoob/pix'], async (req, res) => {
  const received = Array.isArray(req.body?.pix) ? req.body.pix : [];
  await Promise.allSettled(received.filter((item) => item?.txid).map(async (item) => {
    try { await confirmSicoobCharge(item.txid); }
    catch (error) { console.error('Erro ao confirmar webhook Sicoob:', error.message); }
  }));
  return res.status(200).json({ received: true });
});

router.get('/billing/status', authMiddleware, async (req, res) => {
  const access = await getBillingAccess(req.userId);
  return res.json(serializeBillingAccess(access));
});

router.get('/billing/history', authMiddleware, async (req, res) => {
  const rows = await prisma.subscription.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: 20 });
  return res.json(rows.map((row) => ({ ...row, amount: String(row.amount) })));
});

router.post('/billing/sicoob/sync/:subscriptionId', authMiddleware, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({ where: { id: req.params.subscriptionId, userId: req.userId, provider: 'sicoob' } });
    if (!subscription?.providerCheckoutId) return res.status(404).json({ error: 'Cobrança Sicoob não encontrada' });
    const result = await confirmSicoobCharge(subscription.providerCheckoutId);
    return res.json(result);
  } catch (error) {
    console.error('Erro ao sincronizar cobrança Sicoob:', error.message);
    return res.status(502).json({ error: 'Não foi possível consultar o pagamento no Sicoob' });
  }
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
        ...(!user.billingCustomerId && checkout.customerId ? [prisma.user.update({ where: { id: user.id }, data: { billingCustomerId: checkout.customerId } })] : []),
      ]);
      return res.status(201).json({ url: checkout.url || null, pix: checkout.pix || null, checkoutId: checkout.checkoutId, subscriptionId: pending.id });
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
      { id: 'sicoob', name: 'Sicoob Pix', available: true, configuration: sicoobConfigurationStatus() },
      { id: 'stripe', name: 'Stripe', available: true, configuration: stripeConfigurationStatus() },
      { id: 'mercado_pago', name: 'Mercado Pago', available: false },
      { id: 'asaas', name: 'Asaas', available: false },
    ],
  });
});

router.post('/billing/admin/sicoob/webhook', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const configuredBase = String(process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
    const railwayBase = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '';
    const baseUrl = configuredBase || railwayBase || `${req.protocol}://${req.get('host')}`;
    const webhookBaseUrl = `${baseUrl}/api/billing/webhooks/sicoob`;
    await configureSicoobWebhook(webhookBaseUrl);
    return res.json({ message: 'Webhook Pix configurado no Sicoob', webhookBaseUrl, receivingUrl: `${webhookBaseUrl}/pix` });
  } catch (error) {
    console.error('Erro ao configurar webhook Sicoob:', error.message);
    return res.status(502).json({ error: error.message || 'Não foi possível configurar o webhook Sicoob' });
  }
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
  if (!['sicoob', 'stripe'].includes(req.body?.activeProvider)) return res.status(400).json({ error: 'Este provedor ainda não está disponível' });
  const settings = await prisma.billingSettings.update({
    where: { id: 1 },
    data: { activeProvider: req.body.activeProvider, litePrice, basicPrice, masterPrice, initialTrialDays, postExpirationGraceDays },
  });
  return res.json({ message: 'Configurações salvas', updatedAt: settings.updatedAt });
});

router.get('/billing/admin/dashboard', authMiddleware, requireAdmin, async (_req, res) => {
  const now = new Date();
  // O negócio opera no horário de Fortaleza (UTC-3).
  const localNow = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  const monthStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1, 3));
  const nextMonthStart = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth() + 1, 1, 3));
  const expiringLimit = addDays(now, 7);

  const [settings, users, paidSubscriptions, monthlyReceipts] = await Promise.all([
    getBillingSettings(),
    prisma.user.findMany({
      where: { isAdmin: false },
      select: { id: true, name: true, email: true, plan: true },
    }),
    prisma.subscription.findMany({
      where: { status: 'paid', endsAt: { not: null } },
      orderBy: [{ userId: 'asc' }, { endsAt: 'desc' }],
      select: { id: true, userId: true, plan: true, amount: true, endsAt: true },
    }),
    prisma.subscription.aggregate({
      where: { status: 'paid', paidAt: { gte: monthStart, lt: nextMonthStart } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const latestByUser = new Map();
  for (const subscription of paidSubscriptions) {
    if (!latestByUser.has(subscription.userId)) latestByUser.set(subscription.userId, subscription);
  }

  let activeSubscriptionValue = 0;
  let activeCustomers = 0;
  const expiring = [];
  for (const subscription of latestByUser.values()) {
    const customer = usersById.get(subscription.userId);
    if (!customer || !subscription.endsAt) continue;
    const graceEndsAt = addDays(subscription.endsAt, settings.postExpirationGraceDays);
    if (graceEndsAt > now) {
      activeCustomers += 1;
      activeSubscriptionValue += Number(subscription.amount);
    }
    if (subscription.endsAt > now && subscription.endsAt <= expiringLimit) {
      expiring.push({
        id: subscription.id,
        customerId: customer.id,
        customerName: customer.name,
        email: customer.email,
        plan: subscription.plan,
        amount: String(subscription.amount),
        endsAt: subscription.endsAt.toISOString(),
      });
    }
  }
  expiring.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));

  const customersByPlan = { lite: 0, basic: 0, master: 0 };
  for (const user of users) customersByPlan[user.plan] = (customersByPlan[user.plan] || 0) + 1;

  return res.json({
    month: monthStart.toISOString().slice(0, 7),
    monthlyReceipts: { total: String(monthlyReceipts._sum.amount || 0), count: monthlyReceipts._count.id },
    totalCustomers: users.length,
    activeCustomers,
    activeSubscriptionValue: activeSubscriptionValue.toFixed(2),
    customersByPlan,
    expiring,
    expiringWindowDays: 7,
  });
});

router.get('/billing/admin/customers', authMiddleware, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      createdAt: true,
      subscriptions: {
        where: { status: 'paid' },
        orderBy: { paidAt: 'desc' },
        take: 50,
        select: { id: true, plan: true, provider: true, amount: true, currency: true, paymentMethod: true, paidAt: true, startsAt: true, endsAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const result = await Promise.all(users.map(async (user) => {
    const access = await getBillingAccess(user.id);
    return {
      ...user,
      payments: user.subscriptions.map((payment) => ({ ...payment, amount: String(payment.amount) })),
      subscriptions: undefined,
      billing: serializeBillingAccess(access),
    };
  }));
  return res.json(result);
});

export default router;
