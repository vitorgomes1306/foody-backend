import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date, days) {
  return new Date(date.getTime() + Math.max(0, Number(days) || 0) * DAY_MS);
}

export async function getBillingSettings() {
  return prisma.billingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export async function getBillingAccess(userId) {
  const [user, settings, latestPaid] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, isAdmin: true, billingTrialStartedAt: true, plan: true } }),
    getBillingSettings(),
    prisma.subscription.findFirst({
      where: { userId, status: 'paid' },
      orderBy: [{ endsAt: 'desc' }, { paidAt: 'desc' }],
    }),
  ]);

  if (!user) return { allowed: false, reason: 'user_not_found', settings, subscription: null };
  if (user.isAdmin) return { allowed: true, reason: 'admin', settings, subscription: latestPaid };

  const now = new Date();
  if (latestPaid?.endsAt && latestPaid.endsAt > now) {
    return { allowed: true, reason: 'active', settings, subscription: latestPaid };
  }
  if (latestPaid?.graceEndsAt && latestPaid.graceEndsAt > now) {
    return { allowed: true, reason: 'renewal_grace', settings, subscription: latestPaid };
  }

  const trialEndsAt = addDays(user.billingTrialStartedAt, settings.initialTrialDays);
  if (!latestPaid && trialEndsAt > now) {
    return { allowed: true, reason: 'trial', settings, subscription: null, trialEndsAt };
  }

  return {
    allowed: false,
    reason: latestPaid ? 'subscription_expired' : 'trial_expired',
    settings,
    subscription: latestPaid,
    trialEndsAt,
  };
}

export function serializeBillingAccess(access) {
  const { settings, subscription, ...rest } = access;
  return {
    ...rest,
    trialEndsAt: access.trialEndsAt?.toISOString?.() || null,
    subscription: subscription ? {
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      amount: String(subscription.amount),
      paymentMethod: subscription.paymentMethod,
      startsAt: subscription.startsAt?.toISOString?.() || null,
      endsAt: subscription.endsAt?.toISOString?.() || null,
      graceEndsAt: subscription.graceEndsAt?.toISOString?.() || null,
      paidAt: subscription.paidAt?.toISOString?.() || null,
    } : null,
    settings: {
      activeProvider: settings.activeProvider,
      prices: {
        lite: String(settings.litePrice),
        basic: String(settings.basicPrice),
        master: String(settings.masterPrice),
      },
      initialTrialDays: settings.initialTrialDays,
      postExpirationGraceDays: settings.postExpirationGraceDays,
      subscriptionDays: settings.subscriptionDays,
    },
  };
}

export { prisma as billingPrisma };
