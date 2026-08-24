import express from 'express'
import { PrismaClient } from '@prisma/client'
import authMiddleware from '../middlewares/auth.js'

const prisma = new PrismaClient()
const router = express.Router()
const number = (value) => Number.parseFloat(String(value ?? 0)) || 0

async function ownsTenant(tenantId, userId) {
  return Boolean(await prisma.tenant.findFirst({ where: { id: tenantId, ownerId: userId }, select: { id: true } }))
}

function aggregate(orders) {
  const waiters = new Map()
  const products = new Map()
  const paymentMethods = new Map()
  const orderSources = new Map()
  let grossSales = 0
  let commissions = 0
  let discounts = 0

  for (const order of orders) {
    grossSales += number(order.total)
    commissions += number(order.waiterCommissionAmount)
    discounts += number(order.discountAmount)
    const paymentType = order.paymentMethodType || 'not_informed'
    const payment = paymentMethods.get(paymentType) || { type: paymentType, orders: 0, total: 0 }
    payment.orders += 1
    payment.total += number(order.total)
    paymentMethods.set(paymentType, payment)
    const sourceType = order.waiterId ? 'waiter' : order.type === 'local' ? 'counter' : 'digital_menu'
    const source = orderSources.get(sourceType) || { type: sourceType, orders: 0, total: 0 }
    source.orders += 1
    source.total += number(order.total)
    orderSources.set(sourceType, source)
    if (order.waiter) {
      const current = waiters.get(order.waiter.id) || { id: order.waiter.id, name: order.waiter.name, orders: 0, sales: 0, commission: 0 }
      current.orders += 1
      current.sales += number(order.total)
      current.commission += number(order.waiterCommissionAmount)
      waiters.set(order.waiter.id, current)
    }
    for (const item of order.items || []) {
      const current = products.get(item.productId) || { id: item.productId, name: item.product?.name || 'Produto', quantity: 0, sales: 0 }
      current.quantity += item.quantity
      const optionTotal = (item.options || []).reduce((sum, option) => sum + number(option.priceAdded) * (option.quantity || 1), 0)
      current.sales += (number(item.unitPrice) + optionTotal) * item.quantity
      products.set(item.productId, current)
    }
  }

  return {
    orderCount: orders.length,
    grossSales,
    commissions,
    discounts,
    averageTicket: orders.length ? grossSales / orders.length : 0,
    waiters: [...waiters.values()].sort((a, b) => b.sales - a.sales),
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity),
    paymentMethods: [...paymentMethods.values()].sort((a, b) => b.total - a.total),
    orderSources: [...orderSources.values()].sort((a, b) => b.orders - a.orders),
  }
}

router.get('/tenant/:tenantId/reports/sales', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    const now = new Date()
    const defaultStart = new Date(now.getTime() - 29 * 86400000)
    const start = req.query.start ? new Date(String(req.query.start)) : defaultStart
    const end = req.query.end ? new Date(String(req.query.end)) : now
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return res.status(400).json({ error: 'Período inválido' })
    if (end.getTime() - start.getTime() > 366 * 86400000) return res.status(400).json({ error: 'O período máximo é de 366 dias' })

    const select = {
      id: true, dailyNumber: true, type: true, waiterId: true, total: true, discountAmount: true, waiterCommissionAmount: true, paymentMethodType: true, createdAt: true, paidAt: true,
      waiter: { select: { id: true, name: true } },
      items: { select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true } }, options: { select: { quantity: true, priceAdded: true } } } },
    }
    const todaySelect = {
      ...select,
      customerName: true,
      customerPhone: true,
      customerAddress: true,
      deliveryFee: true,
      waiterCommissionPercent: true,
      notes: true,
      extras: { orderBy: { id: 'asc' }, select: { id: true, description: true, quantity: true, unitPrice: true } },
      table: { select: { number: true } },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          notes: true,
          addedAt: true,
          product: { select: { name: true } },
          variantNameApplied: true,
          flavors: { select: { id: true, nameApplied: true, priceApplied: true, fraction: true } },
          options: { select: { id: true, quantity: true, priceAdded: true, option: { select: { name: true } } } },
        },
      },
    }
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    const todayStart = new Date(`${localDate}T00:00:00-03:00`)
    const todayEnd = new Date(`${localDate}T23:59:59.999-03:00`)
    const completedInRange = (rangeStart, rangeEnd) => ({
      tenantId,
      status: 'delivered',
      OR: [
        { paidAt: { gte: rangeStart, lte: rangeEnd } },
        { paidAt: null, createdAt: { gte: rangeStart, lte: rangeEnd } },
      ],
    })
    const [periodOrders, todayOrders] = await Promise.all([
      prisma.order.findMany({ where: completedInRange(start, end), select, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
      prisma.order.findMany({ where: completedInRange(todayStart, todayEnd), select: todaySelect, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
    ])
    const todayOrdersWithExtras = todayOrders.map((order) => ({
      ...order,
      items: [
        ...(order.items || []),
        ...(order.extras || []).map((extra) => ({
          id: `extra-${extra.id}`,
          productId: null,
          quantity: extra.quantity,
          unitPrice: extra.unitPrice,
          product: { name: `Valor extra: ${extra.description} (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(extra.unitPrice) || 0)} por unidade)` },
          options: [],
          flavors: [],
          notes: null,
          addedAt: null,
        })),
      ],
    }))
    return res.json({ period: { start, end }, summary: aggregate(periodOrders), today: aggregate(todayOrders), todayOrders: todayOrdersWithExtras })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao gerar relatório de vendas' })
  }
})

export default router
