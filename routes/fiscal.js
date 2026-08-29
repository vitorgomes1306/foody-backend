import express from 'express'
import { PrismaClient } from '@prisma/client'
import authMiddleware from '../middlewares/auth.js'
import { fiscalApiRequest } from '../utils/fiscalApi.js'

const prisma = new PrismaClient()
const router = express.Router()

const PAYMENT_METHODS = {
  cash: 'money',
  pix: 'pix',
  debit_card: 'debitCard',
  credit_card: 'creditCard',
  voucher: 'foodVoucher',
  other: 'other',
}

async function ownedTenant(tenantId, userId) {
  return prisma.tenant.findFirst({ where: { id: tenantId, ownerId: userId } })
}

function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

function fiscalProductErrors(product) {
  const missing = []
  if (!product.fiscalEnabled) missing.push('habilitação fiscal')
  if (digits(product.ncm).length !== 8) missing.push('NCM')
  if (!product.cfop) missing.push('CFOP')
  if (!product.fiscalUnit) missing.push('unidade fiscal')
  if (product.taxOrigin === null || product.taxOrigin === undefined) missing.push('origem ICMS')
  if (!product.icmsCsosn) missing.push('CSOSN')
  if (product.pisCst === null || product.pisCst === undefined) missing.push('CST PIS')
  if (product.cofinsCst === null || product.cofinsCst === undefined) missing.push('CST COFINS')
  return missing
}

router.get('/tenant/:tenantId/fiscal/config', authMiddleware, async (req, res) => {
  const tenant = await ownedTenant(req.params.tenantId, req.userId)
  if (!tenant) return res.status(403).json({ error: 'Acesso negado ao tenant' })
  res.json({ enabled: tenant.fiscalEnabled, issuerExternalId: tenant.fiscalIssuerExternalId })
})

router.put('/tenant/:tenantId/fiscal/config', authMiddleware, async (req, res) => {
  const tenant = await ownedTenant(req.params.tenantId, req.userId)
  if (!tenant) return res.status(403).json({ error: 'Acesso negado ao tenant' })
  const issuerExternalId = String(req.body?.issuerExternalId || '').trim()
  const enabled = req.body?.enabled === true
  if (enabled && !issuerExternalId) return res.status(400).json({ error: 'Informe o identificador fiscal do emitente' })
  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { fiscalEnabled: enabled, fiscalIssuerExternalId: issuerExternalId || null },
    select: { fiscalEnabled: true, fiscalIssuerExternalId: true },
  })
  res.json({ enabled: updated.fiscalEnabled, issuerExternalId: updated.fiscalIssuerExternalId })
})

router.put('/tenant/:tenantId/fiscal/products/:productId', authMiddleware, async (req, res) => {
  const tenant = await ownedTenant(req.params.tenantId, req.userId)
  if (!tenant) return res.status(403).json({ error: 'Acesso negado ao tenant' })
  const productId = Number.parseInt(req.params.productId, 10)
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant.id } })
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' })

  const ncm = digits(req.body?.ncm)
  const fiscalUnit = String(req.body?.fiscalUnit || 'UN').trim().toUpperCase()
  const numbers = Object.fromEntries(['cfop', 'taxOrigin', 'icmsCsosn', 'pisCst', 'cofinsCst'].map((key) => [key, Number(req.body?.[key])]))
  if (req.body?.fiscalEnabled === true && ncm.length !== 8) return res.status(400).json({ error: 'NCM deve conter 8 dígitos' })
  if (req.body?.fiscalEnabled === true && Object.values(numbers).some((value) => !Number.isInteger(value))) return res.status(400).json({ error: 'Preencha todos os códigos tributários do produto' })

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { fiscalEnabled: req.body?.fiscalEnabled === true, ncm: ncm || null, fiscalUnit, ...numbers },
  })
  res.json(updated)
})

router.post('/tenant/:tenantId/orders/:orderId/fiscal-invoice', authMiddleware, async (req, res) => {
  const tenant = await ownedTenant(req.params.tenantId, req.userId)
  if (!tenant) return res.status(403).json({ error: 'Acesso negado ao tenant' })
  if (!tenant.fiscalEnabled || !tenant.fiscalIssuerExternalId) return res.status(409).json({ error: 'Emissão fiscal não configurada para esta empresa' })

  const orderId = Number.parseInt(req.params.orderId, 10)
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: tenant.id },
    include: { items: { include: { product: true } }, extras: true },
  })
  if (!order) return res.status(404).json({ error: 'Venda não encontrada' })
  if (!order.paidAt || order.status !== 'delivered' || !order.paymentMethodType) return res.status(409).json({ error: 'A venda precisa estar paga e finalizada antes da emissão' })
  if (order.fiscalDocumentId) {
    const document = await fiscalApiRequest(`/v1/documents/${order.fiscalDocumentId}`)
    return res.json(document)
  }
  if (Number(order.deliveryFee) !== 0 || Number(order.discountAmount) !== 0 || order.extras.length) {
    return res.status(409).json({ error: 'A primeira versão fiscal aceita somente vendas sem entrega, desconto ou acréscimos' })
  }

  const invalidProducts = order.items.map((item) => ({ product: item.product, missing: fiscalProductErrors(item.product) })).filter((entry) => entry.missing.length)
  if (invalidProducts.length) {
    return res.status(409).json({
      error: 'Existem produtos sem configuração fiscal',
      products: invalidProducts.map(({ product, missing }) => ({ id: product.id, name: product.name, missing })),
    })
  }

  const amount = Number(order.total)
  const payload = {
    issue: true,
    isFinalCustomer: true,
    effectiveDate: order.paidAt.toISOString(),
    operationDate: order.paidAt.toISOString(),
    operationNature: 'Venda de mercadoria',
    additionalInformation: `Venda Chefito #${order.dailyNumber ?? order.id}`,
    payments: [{ method: PAYMENT_METHODS[order.paymentMethodType], amount }],
    items: order.items.map((item) => {
      const unitAmount = Number(item.unitPrice)
      const quantity = Number(item.quantity)
      return {
        code: String(item.product.seq || item.product.id),
        ...(digits(item.product.barcode) ? { gtinCode: digits(item.product.barcode) } : {}),
        description: item.product.name,
        ncm: digits(item.product.ncm),
        cfop: item.product.cfop,
        unit: item.product.fiscalUnit,
        quantity,
        unitAmount,
        totalAmount: Number((quantity * unitAmount).toFixed(2)),
        unitTax: item.product.fiscalUnit,
        quantityTax: quantity,
        unitTaxAmount: unitAmount,
        taxes: {
          icms: { origin: item.product.taxOrigin, csosn: item.product.icmsCsosn },
          pis: { cst: item.product.pisCst },
          cofins: { cst: item.product.cofinsCst },
        },
      }
    }),
  }

  try {
    const document = await fiscalApiRequest('/v1/documents', {
      method: 'POST',
      body: { source: 'chefito', issuerExternalId: tenant.fiscalIssuerExternalId, externalId: `order-${order.id}`, documentType: 'NFCE', payload },
    })
    await prisma.order.update({
      where: { id: order.id },
      data: { fiscalDocumentId: document.id, fiscalStatus: document.status, fiscalError: null, fiscalIssuedAt: new Date() },
    })
    res.status(202).json(document)
  } catch (error) {
    await prisma.order.update({ where: { id: order.id }, data: { fiscalStatus: 'ERROR', fiscalError: error.message } })
    res.status(error.status && error.status < 500 ? error.status : 502).json({ error: error.message, code: error.code, details: error.details })
  }
})

export default router
