import express from 'express'
import { PrismaClient } from '@prisma/client'
import authMiddleware from '../middlewares/auth.js'

const prisma = new PrismaClient()
const router = express.Router()
const parseId = (value) => { const id = Number.parseInt(value, 10); return Number.isFinite(id) && id > 0 ? id : null }
const ownsTenant = async (tenantId, userId) => Boolean(await prisma.tenant.findFirst({ where: { id: tenantId, ownerId: userId }, select: { id: true } }))
const PRINT_JOB_TYPES = new Set(['customer_bill', 'payment_receipt'])

const orderForPrint = {
  id: true, dailyNumber: true, type: true, status: true, total: true, deliveryFee: true, discountAmount: true,
  paymentMethodType: true, paidAt: true, notes: true, customerName: true, customerAddress: true, createdAt: true,
  tenant: { select: { name: true, phone: true } }, table: { select: { number: true } }, waiter: { select: { name: true } },
  extras: { orderBy: { id: 'asc' }, select: { description: true, quantity: true, unitPrice: true } },
  items: { orderBy: { id: 'asc' }, select: {
    id: true, quantity: true, unitPrice: true, notes: true, variantNameApplied: true,
    product: { select: { name: true } },
    flavors: { orderBy: { id: 'asc' }, select: { nameApplied: true } },
    options: { orderBy: { id: 'asc' }, select: { quantity: true, priceAdded: true, option: { select: { name: true, group: { select: { name: true } } } } } },
  } },
}

router.post('/tenant/:tenantId/orders/:orderId/print-jobs', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const orderId = parseId(req.params.orderId)
    if (!orderId) return res.status(400).json({ error: 'Pedido inválido' })
    const type = PRINT_JOB_TYPES.has(req.body?.type) ? req.body.type : 'customer_bill'
    const waiterRequest = req.authRole === 'waiter' && req.tenantId === tenantId
    if (!waiterRequest && !(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId, ...(waiterRequest ? { waiterId: req.waiterId } : {}) }, select: { id: true, status: true } })
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })
    if (['cancelled', 'returned'].includes(order.status)) return res.status(409).json({ error: 'Não é possível imprimir um pedido cancelado' })
    if (type === 'payment_receipt' && order.status !== 'delivered') return res.status(409).json({ error: 'O recibo só pode ser impresso após o pedido ser finalizado' })
    const job = await prisma.printJob.create({ data: { tenantId, orderId, type, requestedBy: waiterRequest ? `waiter:${req.waiterId}` : `user:${req.userId}` } })
    return res.status(201).json(job)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao solicitar impressão' }) }
})

router.get('/tenant/:tenantId/print-jobs/pending', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const jobs = await prisma.printJob.findMany({ where: { tenantId, status: { in: ['pending', 'failed'] }, attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: 20, include: { order: { select: orderForPrint } } })
    return res.json(jobs)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao consultar fila de impressão' }) }
})

router.patch('/tenant/:tenantId/print-jobs/:jobId', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const jobId = parseId(req.params.jobId)
    if (!jobId) return res.status(400).json({ error: 'Impressão inválida' })
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const existing = await prisma.printJob.findFirst({ where: { id: jobId, tenantId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Impressão não encontrada' })
    const printed = req.body?.status === 'printed'
    if (!printed && req.body?.status !== 'failed') return res.status(400).json({ error: 'Status inválido' })
    const job = await prisma.printJob.update({ where: { id: jobId }, data: printed ? { status: 'printed', printedAt: new Date(), error: null } : { status: 'failed', attempts: { increment: 1 }, error: typeof req.body?.error === 'string' ? req.body.error.slice(0, 500) : 'Falha na impressão' } })
    return res.json(job)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao atualizar impressão' }) }
})

export default router
