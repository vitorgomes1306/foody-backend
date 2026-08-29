import express from 'express'
import { PrismaClient } from '@prisma/client'
import authMiddleware from '../middlewares/auth.js'
import { fiscalApiRequest } from '../utils/fiscalApi.js'
import multer from 'multer'

const prisma = new PrismaClient()
const router = express.Router()
const certificateUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } })

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

function validGtin(value) {
  const code = digits(value)
  if (![8, 12, 13, 14].includes(code.length)) return null
  const body = code.slice(0, -1)
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === Number(code.at(-1)) ? code : null
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
  res.json({
    enabled: tenant.fiscalEnabled,
    issuerExternalId: tenant.fiscalIssuerExternalId,
    legalName: tenant.fiscalLegalName,
    federalTaxNumber: tenant.fiscalFederalTaxNumber,
    stateTaxNumber: tenant.fiscalStateTaxNumber,
    taxRegime: tenant.fiscalTaxRegime,
    cityCode: tenant.fiscalCityCode,
    certificateExpiresAt: tenant.fiscalCertificateExpiresAt,
    company: { name: tenant.name, email: tenant.email, phone: tenant.phone, zipCode: tenant.zipCode, street: tenant.street, number: tenant.number, complement: tenant.complement, district: tenant.district, city: tenant.city, state: tenant.state },
  })
})

router.post('/tenant/:tenantId/fiscal/onboard', authMiddleware, certificateUpload.single('certificate'), async (req, res) => {
  const tenant = await ownedTenant(req.params.tenantId, req.userId)
  if (!tenant) return res.status(403).json({ error: 'Acesso negado ao tenant' })
  if (!req.file || !/\.pfx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Envie um certificado A1 no formato .pfx' })

  const value = (key) => String(req.body?.[key] || '').trim()
  const federalTaxNumber = digits(value('federalTaxNumber'))
  const stateTaxNumber = value('stateTaxNumber')
  const legalName = value('legalName')
  const taxRegime = value('taxRegime')
  const cityCode = digits(value('cityCode'))
  const certificatePassword = value('certificatePassword')
  const csc = value('csc')
  const tokenId = value('tokenId')
  const series = value('series') || '1'
  const nextNumber = Number.parseInt(value('nextNumber'), 10)
  if (federalTaxNumber.length !== 14 || !stateTaxNumber || !legalName) return res.status(400).json({ error: 'Preencha CNPJ, inscrição estadual e razão social' })
  if (!['simplesNacional', 'presumedProfit', 'actualProfit'].includes(taxRegime)) return res.status(400).json({ error: 'Regime tributário inválido' })
  if (cityCode.length !== 7) return res.status(400).json({ error: 'Informe o código IBGE do município com 7 dígitos' })
  if (!certificatePassword || !csc || !tokenId || !Number.isInteger(nextNumber) || nextNumber < 1) return res.status(400).json({ error: 'Preencha certificado, senha, CSC, tokenId e próximo número' })
  if (!tenant.street || !tenant.district || !tenant.zipCode || !tenant.number || !tenant.city) return res.status(409).json({ error: 'Complete o endereço da empresa antes da configuração fiscal' })

  try {
    const result = await fiscalApiRequest('/v1/issuers/onboard', {
      method: 'POST',
      body: {
        externalId: tenant.id,
        company: {
          name: tenant.name,
          legalName,
          federalTaxNumber,
          stateTaxNumber,
          ...(tenant.email ? { email: tenant.email } : {}),
          ...(tenant.phone ? { phone: tenant.phone } : {}),
          address: {
            street: tenant.street,
            district: tenant.district,
            postalCode: digits(tenant.zipCode),
            number: tenant.number,
            ...(tenant.complement ? { additionalInformation: tenant.complement } : {}),
            city: { code: cityCode, name: tenant.city },
            cityName: tenant.city,
          },
        },
        taxRegime,
        certificate: { filename: req.file.originalname, base64: req.file.buffer.toString('base64'), password: certificatePassword },
        consumerInvoice: { series, nextNumber, tokenId, csc, allowOfflineContingency: req.body?.allowOfflineContingency !== 'false' },
      },
    })
    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        fiscalEnabled: true,
        fiscalIssuerExternalId: tenant.id,
        fiscalLegalName: legalName,
        fiscalFederalTaxNumber: federalTaxNumber,
        fiscalStateTaxNumber: stateTaxNumber,
        fiscalTaxRegime: taxRegime,
        fiscalCityCode: cityCode,
        fiscalCertificateExpiresAt: result?.certificate?.expirationAt ? new Date(result.certificate.expirationAt) : null,
      },
    })
    res.json({ configured: true, enabled: updated.fiscalEnabled, issuerExternalId: updated.fiscalIssuerExternalId, certificateExpiresAt: updated.fiscalCertificateExpiresAt })
  } catch (error) {
    res.status(error.status && error.status < 500 ? error.status : 502).json({ error: error.message, code: error.code, details: error.details })
  }
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
  if (req.body?.fiscalEnabled === true && (
    !Number.isInteger(numbers.cfop) || numbers.cfop < 1000 || numbers.cfop > 9999
    || !Number.isInteger(numbers.taxOrigin) || numbers.taxOrigin < 0 || numbers.taxOrigin > 8
    || !Number.isInteger(numbers.icmsCsosn) || numbers.icmsCsosn < 100
    || !Number.isInteger(numbers.pisCst) || numbers.pisCst < 0
    || !Number.isInteger(numbers.cofinsCst) || numbers.cofinsCst < 0
  )) return res.status(400).json({ error: 'Preencha códigos fiscais válidos para CFOP, origem, CSOSN, PIS e COFINS' })

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
      const gtinCode = validGtin(item.product.barcode)
      return {
        code: String(item.product.seq || item.product.id),
        ...(gtinCode ? { gtinCode } : {}),
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
