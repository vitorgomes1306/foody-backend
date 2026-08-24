import express from "express"
import { PrismaClient } from "@prisma/client"
import authMiddleware from "../middlewares/auth.js"
import { getBusinessOpeningStatus } from "../utils/openingHours.js"
import { notifyOrderCreated, notifyOrderStatusChanged } from "../utils/orderWhatsAppNotification.js"
import { currentMenuClock, evaluateMenuSchedule } from "../utils/productMenuSchedule.js"

const prisma = new PrismaClient()
const router = express.Router()

async function assertTenantOwner({ tenantId, userId }) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, ownerId: userId },
    select: { id: true },
  })
  return Boolean(tenant)
}

function parseIntOrNull(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function decimalStringToCents(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return null

  const normalized = raw.replace(",", ".")
  const sign = normalized.startsWith("-") ? -1n : 1n
  const unsigned = normalized.startsWith("-") ? normalized.slice(1) : normalized
  const [intPartRaw, fracRaw = ""] = unsigned.split(".")
  const intPart = intPartRaw ? BigInt(intPartRaw) : 0n
  const frac2 = (fracRaw + "00").slice(0, 2)
  const fracPart = BigInt(frac2)

  return sign * (intPart * 100n + fracPart)
}

function centsToDecimalString(cents) {
  const sign = cents < 0n ? "-" : ""
  const abs = cents < 0n ? -cents : cents
  const intPart = abs / 100n
  const fracPart = abs % 100n
  return `${sign}${intPart.toString()}.${fracPart.toString().padStart(2, "0")}`
}

function applyPromotionToCents(valueCents, baseCents, promotionalCents) {
  if (promotionalCents === null || baseCents <= 0n) return valueCents
  return (valueCents * promotionalCents + baseCents / 2n) / baseCents
}

function parseOrderType(value) {
  if (value === "local" || value === "delivery" || value === "pickup") return value
  return null
}

function parseOrderStatus(value) {
  if (
    value === "pending" ||
    value === "confirmed" ||
    value === "preparing" ||
    value === "ready" ||
    value === "out_for_delivery" ||
    value === "delivered" ||
    value === "cancelled" ||
    value === "returned"
  ) {
    return value
  }
  return null
}

function parsePaymentMethodType(value) {
  if (
    value === "cash" ||
    value === "pix" ||
    value === "debit_card" ||
    value === "credit_card" ||
    value === "voucher" ||
    value === "other"
  ) {
    return value
  }
  return null
}

function parsePriceToDecimalString(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const normalized = raw.replace(",", ".")
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed.toFixed(2)
}

function isMissingOrderColumn(err, columnName) {
  if (!err || typeof err !== "object") return false
  const code = "code" in err ? err.code : null
  const msg = "message" in err && typeof err.message === "string" ? err.message : ""
  const metaColumn =
    "meta" in err && err.meta && typeof err.meta === "object" && "column" in err.meta && typeof err.meta.column === "string"
      ? err.meta.column
      : ""

  const needle = String(columnName || "").trim()
  if (!needle) return false

  if (code === "P2022" && (metaColumn === `Order.${needle}` || metaColumn.includes(needle) || msg.includes(needle))) return true
  if (msg.includes(needle) && msg.toLowerCase().includes("does not exist")) return true
  return false
}

function isMissingAnyOrderColumns(err) {
  return (
    isMissingOrderColumn(err, "statusChangedAt") ||
    isMissingOrderColumn(err, "deliveryFee") ||
    isMissingOrderColumn(err, "deliveryManId") ||
    isMissingOrderColumn(err, "deliveryCancelledAt") ||
    isMissingOrderColumn(err, "waiterId") ||
    isMissingOrderColumn(err, "paymentMethodType") ||
    isMissingOrderColumn(err, "paidAt") ||
    isMissingOrderColumn(err, "discountAmount") ||
    isMissingOrderColumn(err, "waiterCommissionPercent") ||
    isMissingOrderColumn(err, "waiterCommissionAmount") ||
    isMissingOrderColumn(err, "waiterCommissionAddedToTotal")
    || isMissingOrderColumn(err, "cancellationFee")
    || isMissingOrderColumn(err, "cancellationPaymentMethodType")
    || isMissingOrderColumn(err, "cancellationFeePaidAt")
    || isMissingOrderColumn(err, "customerSessionId")
    || isMissingOrderColumn(err, "variantId")
    || isMissingOrderColumn(err, "variantNameApplied")
    || isMissingOrderColumn(err, "dailyNumber")
  )
}

const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000

function brazilDateOnly(date = new Date()) {
  const shifted = new Date(date.getTime() - BRAZIL_OFFSET_MS)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}

async function nextDailyOrderNumber(tx, tenantId) {
  try {
    const counter = await tx.orderDailyCounter.upsert({
      where: { tenantId_date: { tenantId, date: brazilDateOnly() } },
      create: { tenantId, date: brazilDateOnly(), lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    })
    return counter.lastNumber
  } catch {
    return null
  }
}

function orderSelect({ includeStatusChangedAt, includeDelivery }) {
  return {
    id: true,
    tenantId: true,
    tenant: { select: { name: true } },
    userId: true,
    tableId: true,
    waiterId: true,
    waiter: true,
    type: true,
    status: true,
    ...(includeStatusChangedAt ? { statusChangedAt: true } : {}),
    total: true,
    cancellationFee: true,
    cancellationPaymentMethodType: true,
    cancellationFeePaidAt: true,
    ...(includeDelivery
      ? {
          deliveryFee: true,
          deliveryManId: true,
          deliveryCancelledAt: true,
          deliveryMan: true,
        }
      : {}),
    paymentMethodType: true,
    paidAt: true,
    discountAmount: true,
    waiterCommissionPercent: true,
    waiterCommissionAmount: true,
    waiterCommissionAddedToTotal: true,
    notes: true,
    customerName: true,
    customerPhone: true,
    customerAddress: true,
    dailyNumber: true,
    createdAt: true,
    updatedAt: true,
    table: true,
    items: {
      select: {
        id: true,
        orderId: true,
        productId: true,
        fractionProductId: true,
        variantId: true,
        variantNameApplied: true,
        quantity: true,
        unitPrice: true,
        notes: true,
        kitchenStatus: true,
        addedAt: true,
        product: true,
        fractionProduct: true,
        variant: true,
        flavors: { orderBy: { id: "asc" }, include: { flavor: true } },
        options: {
          select: {
            id: true,
            orderItemId: true,
            optionId: true,
            quantity: true,
            priceAdded: true,
            option: { include: { group: { select: { id: true, name: true } } } },
          },
        },
      },
    },
    extras: { orderBy: { id: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, createdAt: true } },
  }
}

function calculateItemsTotalCentsFromOrder(order) {
  const items = Array.isArray(order?.items) ? order.items : []
  let totalCents = 0n
  for (const it of items) {
    const qty = typeof it?.quantity === "number" ? it.quantity : 0
    if (!qty || qty < 1) continue
    const unitCents = decimalStringToCents(it?.unitPrice?.toString?.() ?? String(it?.unitPrice ?? ""))
    if (unitCents === null) continue
    const opts = Array.isArray(it?.options) ? it.options : []
    let optsCentsPerUnit = 0n
    for (const opt of opts) {
      const optQty = typeof opt?.quantity === "number" ? opt.quantity : 1
      const addCents = decimalStringToCents(opt?.priceAdded?.toString?.() ?? String(opt?.priceAdded ?? "0"))
      if (addCents === null) continue
      optsCentsPerUnit += addCents * BigInt(optQty || 1)
    }
    totalCents += (unitCents + optsCentsPerUnit) * BigInt(qty)
  }
  return totalCents
}

function isMissingTenantColumn(err, columnName) {
  if (!err || typeof err !== "object") return false
  const code = "code" in err ? err.code : null
  const msg = "message" in err && typeof err.message === "string" ? err.message : ""
  const metaColumn =
    "meta" in err && err.meta && typeof err.meta === "object" && "column" in err.meta && typeof err.meta.column === "string"
      ? err.meta.column
      : ""

  const needle = String(columnName || "").trim()
  if (!needle) return false

  if (code === "P2022" && (metaColumn === `Tenant.${needle}` || metaColumn.includes(needle) || msg.includes(needle))) return true
  if (msg.includes(needle) && msg.toLowerCase().includes("does not exist")) return true
  return false
}

async function resolveTenantIdFromSlug(slug) {
  const normalized = typeof slug === "string" ? slug.trim().toLowerCase() : ""
  if (!normalized) return null
  const tenant = await prisma.tenant.findFirst({
    where: { slug: normalized, active: true },
    select: { id: true },
  })
  return tenant?.id ?? null
}

async function buildOrderCreateData({ tenantId, body, enforceMenuSchedule = false }) {
  const type = parseOrderType(body?.type)
  if (!type) return { ok: false, status: 400, error: "type inválido" }

  const itemsInput = Array.isArray(body?.items) ? body.items : []
  if (!itemsInput.length) return { ok: false, status: 400, error: "items é obrigatório" }

  const tableNumber = parseIntOrNull(body?.tableNumber)
  const waiterId = parseIntOrNull(body?.waiterId)
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null
  const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : null
  const customerPhone = typeof body?.customerPhone === "string" ? body.customerPhone.trim() : null
  const customerAddress = typeof body?.customerAddress === "string" ? body.customerAddress.trim() : null
  const paymentMethodType = parsePaymentMethodType(body?.paymentMethodType)
  const customerSessionId = typeof body?.customerSessionId === "string" && /^[a-zA-Z0-9-]{20,80}$/.test(body.customerSessionId) ? body.customerSessionId : null

  if (waiterId) {
    const waiter = await prisma.waiter.findFirst({ where: { id: waiterId, tenantId, active: true }, select: { id: true } })
    if (!waiter) return { ok: false, status: 400, error: "Garçom inválido ou inativo" }
  }

  const productIds = []
  const optionIds = []
  const flavorIds = []
  const variantIds = []

  for (const item of itemsInput) {
    const productId = parseIntOrNull(item?.productId)
    const quantity = parseIntOrNull(item?.quantity)
    if (!productId) return { ok: false, status: 400, error: "productId inválido" }
    if (!quantity || quantity < 1) return { ok: false, status: 400, error: "quantity inválido" }

    productIds.push(productId)
    const variantId = parseIntOrNull(item?.variantId)
    if (variantId) variantIds.push(variantId)
    const fractionProductId = parseIntOrNull(item?.fractionProductId)
    if (fractionProductId) productIds.push(fractionProductId)
    for (const selectedFlavor of Array.isArray(item?.flavors) ? item.flavors : []) {
      const flavorId = parseIntOrNull(selectedFlavor?.flavorId)
      if (!flavorId) return { ok: false, status: 400, error: "flavorId inválido" }
      flavorIds.push(flavorId)
    }

    const options = Array.isArray(item?.options) ? item.options : []
    for (const opt of options) {
      const optionId = parseIntOrNull(opt?.optionId)
      if (!optionId) return { ok: false, status: 400, error: "optionId inválido" }
      optionIds.push(optionId)
    }
  }

  const [products, options, flavors, variants, tenant] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, active: true },
      select: { id: true, name: true, price: true, menuSchedule: true, allowFraction: true, skipKds: true, usesFlavors: true, maxFlavors: true, variants: { where: { active: true }, select: { id: true } } },
    }),
    optionIds.length
      ? prisma.option.findMany({
          where: { id: { in: optionIds } },
          select: {
            id: true,
            priceModifier: true,
            group: { select: { productId: true } },
          },
        })
      : Promise.resolve([]),
    flavorIds.length
      ? prisma.productFlavor.findMany({ where: { id: { in: flavorIds }, active: true }, select: { id: true, productId: true, name: true, price: true } })
      : Promise.resolve([]),
    variantIds.length
      ? prisma.productVariant.findMany({ where: { id: { in: variantIds }, active: true }, include: { flavorPrices: { where: { active: true } } } })
      : Promise.resolve([]),
    (async () => {
      try {
        return await prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true, deliveryFee: true, settings: true } })
      } catch (err) {
        if (!isMissingTenantColumn(err, "settings") && !isMissingTenantColumn(err, "deliveryFee")) throw err
        try {
          return await prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true, deliveryFee: true } })
        } catch {
          return null
        }
      }
    })(),
  ])

  const productById = new Map(products.map((p) => [p.id, p]))
  const optionById = new Map(options.map((o) => [o.id, o]))
  const flavorById = new Map(flavors.map((flavor) => [flavor.id, flavor]))
  const variantById = new Map(variants.map((variant) => [variant.id, variant]))

  const itemsToCreate = []
  let totalCents = 0n
  let allItemsReady = true
  const menuClock = enforceMenuSchedule ? currentMenuClock() : null

  for (const item of itemsInput) {
    const productId = parseIntOrNull(item?.productId)
    const quantity = parseIntOrNull(item?.quantity)
    const itemNotes = typeof item?.notes === "string" ? item.notes.trim() : null

    const product = productId ? productById.get(productId) : null
    if (!product) return { ok: false, status: 400, error: "Produto inválido ou inativo" }
    const productAvailability = enforceMenuSchedule ? evaluateMenuSchedule(product.menuSchedule, menuClock) : { available: true, promotionalPrice: null }
    if (!productAvailability.available) return { ok: false, status: 409, error: `${product.name} não está disponível neste dia ou horário` }
    const variantId = parseIntOrNull(item?.variantId)
    const variant = variantId ? variantById.get(variantId) : null
    if (product.variants?.length && !variantId) return { ok: false, status: 400, error: "Escolha o tamanho do produto" }
    if (variantId && (!variant || variant.productId !== productId)) return { ok: false, status: 400, error: "Tamanho inválido para o produto" }

    const fractionProductId = parseIntOrNull(item?.fractionProductId)
    const fractionProduct = fractionProductId ? productById.get(fractionProductId) : null
    if (fractionProductId && (!product.allowFraction || !fractionProduct?.allowFraction)) {
      return { ok: false, status: 400, error: "Produto não permite pedido fracionado" }
    }
    const fractionAvailability = fractionProduct && enforceMenuSchedule ? evaluateMenuSchedule(fractionProduct.menuSchedule, menuClock) : { available: true, promotionalPrice: null }
    if (fractionProduct && !fractionAvailability.available) return { ok: false, status: 409, error: `${fractionProduct.name} não está disponível neste dia ou horário` }
    const primaryPriceCents = decimalStringToCents(product.price?.toString?.() ?? String(product.price))
    const fractionPriceCents = fractionProduct ? decimalStringToCents(fractionProduct.price?.toString?.() ?? String(fractionProduct.price)) : null
    if (primaryPriceCents === null || (fractionProduct && fractionPriceCents === null)) return { ok: false, status: 500, error: "Preço do produto inválido" }
    const primaryPromotionalCents = decimalStringToCents(productAvailability.promotionalPrice)
    const fractionPromotionalCents = decimalStringToCents(fractionAvailability.promotionalPrice)
    const effectivePrimaryPriceCents = applyPromotionToCents(primaryPriceCents, primaryPriceCents, primaryPromotionalCents)
    const effectiveFractionPriceCents = fractionPriceCents === null ? null : applyPromotionToCents(fractionPriceCents, fractionPriceCents, fractionPromotionalCents)
    // Produto fracionado é um único item: metade do valor de cada sabor.
    // O +1 faz arredondamento para o centavo superior quando a soma é ímpar.
    const selectedFlavorInputs = Array.isArray(item?.flavors) ? item.flavors : []
    const selectedFlavorIds = [...new Set(selectedFlavorInputs.map((selected) => parseIntOrNull(selected?.flavorId)).filter(Boolean))]
    if (product.usesFlavors && (selectedFlavorIds.length < 1 || selectedFlavorIds.length > product.maxFlavors)) {
      return { ok: false, status: 400, error: `Escolha entre 1 e ${product.maxFlavors} sabores para ${productId}` }
    }
    if (!product.usesFlavors && selectedFlavorIds.length) return { ok: false, status: 400, error: "Este produto não utiliza sabores" }
    const selectedFlavors = selectedFlavorIds.map((id) => flavorById.get(id))
    if (selectedFlavors.some((flavor) => !flavor || flavor.productId !== productId)) return { ok: false, status: 400, error: "Sabor inválido para o produto" }
    const variantPriceCents = variant ? decimalStringToCents(variant.price?.toString?.() ?? String(variant.price)) : null
    if (variant && variantPriceCents === null) return { ok: false, status: 500, error: "Preço da variação inválido" }
    let unitPriceCents = variant
      ? applyPromotionToCents(variantPriceCents, primaryPriceCents, primaryPromotionalCents)
      : effectiveFractionPriceCents !== null
        ? (effectivePrimaryPriceCents + effectiveFractionPriceCents + 1n) / 2n
        : effectivePrimaryPriceCents
    if (unitPriceCents === null) return { ok: false, status: 500, error: "Preço da variação inválido" }
    const flavorsToCreate = []
    if (selectedFlavors.length) {
      const flavorPrices = selectedFlavors.map((flavor) => {
        const variantPrice = variant?.flavorPrices?.find((item) => item.flavorId === flavor.id)
        const flavorPrice = decimalStringToCents((variantPrice?.price ?? flavor.price)?.toString?.() ?? String(variantPrice?.price ?? flavor.price))
        return flavorPrice === null ? null : applyPromotionToCents(flavorPrice, primaryPriceCents, primaryPromotionalCents)
      })
      if (flavorPrices.some((price) => price === null)) return { ok: false, status: 500, error: "Preço do sabor inválido" }
      unitPriceCents = (flavorPrices.reduce((sum, price) => sum + price, 0n) + BigInt(selectedFlavors.length - 1)) / BigInt(selectedFlavors.length)
      const fraction = (1 / selectedFlavors.length).toFixed(4)
      for (let index = 0; index < selectedFlavors.length; index += 1) {
        flavorsToCreate.push({ flavorId: selectedFlavors[index].id, nameApplied: selectedFlavors[index].name, priceApplied: centsToDecimalString(flavorPrices[index]), fraction })
      }
    }

    const optionsInput = Array.isArray(item?.options) ? item.options : []
    const optionsToCreate = []
    let optionsPerUnitCents = 0n

    for (const opt of optionsInput) {
      const optionId = parseIntOrNull(opt?.optionId)
      const optQty = parseIntOrNull(opt?.quantity) ?? 1
      if (!optionId) return { ok: false, status: 400, error: "optionId inválido" }
      if (optQty < 1) return { ok: false, status: 400, error: "quantity de opção inválido" }

      const option = optionById.get(optionId)
      if (!option) return { ok: false, status: 400, error: "Opção inválida" }
      if (option.group?.productId !== productId) return { ok: false, status: 400, error: "Opção não pertence ao produto" }

      const priceAddedCents = decimalStringToCents(option.priceModifier?.toString?.() ?? String(option.priceModifier))
      if (priceAddedCents === null) return { ok: false, status: 500, error: "Preço da opção inválido" }

      optionsPerUnitCents += priceAddedCents * BigInt(optQty)

      optionsToCreate.push({
        optionId,
        quantity: optQty,
        priceAdded: centsToDecimalString(priceAddedCents),
      })
    }

    const itemTotalCents = (unitPriceCents + optionsPerUnitCents) * BigInt(quantity)
    totalCents += itemTotalCents

    itemsToCreate.push({
      productId,
      fractionProductId: fractionProductId || null,
      variantId: variantId || null,
      variantNameApplied: variant?.name || null,
      quantity,
      unitPrice: centsToDecimalString(unitPriceCents),
      notes: itemNotes || null,
      options: optionsToCreate.length ? { create: optionsToCreate } : undefined,
      flavors: flavorsToCreate.length ? { create: flavorsToCreate } : undefined,
    })
    if (!product.skipKds || (fractionProduct && !fractionProduct.skipKds)) allItemsReady = false
  }

  const deliveryFeeCents = type === "delivery" ? decimalStringToCents(tenant?.deliveryFee?.toString?.() ?? String(tenant?.deliveryFee ?? "0")) : 0n
  const deliveryFee = centsToDecimalString(deliveryFeeCents)
  const total = centsToDecimalString(totalCents + deliveryFeeCents)
  const acceptOrdersAutomatically = Boolean(tenant?.settings?.acceptOrdersAutomatically)
  const initialStatus = allItemsReady ? "ready" : acceptOrdersAutomatically ? "preparing" : "pending"

  return {
    ok: true,
    data: {
      type,
      total,
      deliveryFee,
      initialStatus,
      notes: notes || null,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      paymentMethodType,
      customerSessionId,
      tableNumber: typeof tableNumber === "number" ? tableNumber : null,
      waiterId: waiterId || null,
      itemsToCreate,
      allItemsReady,
    },
  }
}

router.post("/public/tenant/:slug/orders", async (req, res) => {
  try {
    const { slug } = req.params
    const tenantId = await resolveTenantIdFromSlug(slug)
    if (!tenantId) return res.status(404).json({ error: "Tenant não encontrado" })
    if (!['delivery', 'pickup'].includes(req.body?.type)) return res.status(400).json({ error: "Escolha Delivery ou Retirada" })
    if (!['cash', 'pix', 'debit_card', 'credit_card'].includes(req.body?.paymentMethodType)) return res.status(400).json({ error: "Escolha uma forma de pagamento válida" })
    if (!req.body?.customerSessionId) return res.status(400).json({ error: "Sessão do cliente não informada" })
    if (!String(req.body?.customerName || '').trim() || !String(req.body?.customerPhone || '').trim()) return res.status(400).json({ error: "Nome e telefone são obrigatórios" })
    if (req.body.type === 'delivery' && !String(req.body?.customerAddress || '').trim()) return res.status(400).json({ error: "Endereço é obrigatório para Delivery" })

    const openingHours = await prisma.tenantOpeningHour.findMany({ where: { tenantId } })
    const openingStatus = getBusinessOpeningStatus(openingHours)
    if (!openingStatus.isOpen) {
      return res.status(409).json({
        error: "A loja está fechada no momento e não está aceitando pedidos",
        openingStatus,
      })
    }

    const built = await buildOrderCreateData({ tenantId, body: req.body, enforceMenuSchedule: true })
    if (!built.ok) return res.status(built.status).json({ error: built.error })

    const order = await prisma.$transaction(async (tx) => {
      const tableId =
        built.data.tableNumber && built.data.type === "local"
          ? (
              await tx.table.upsert({
                where: { tenantId_number: { tenantId, number: built.data.tableNumber } },
                update: {},
                create: { tenantId, number: built.data.tableNumber },
                select: { id: true },
              })
            ).id
          : null

      const dailyNumber = await nextDailyOrderNumber(tx, tenantId)

      const createArgs = {
        data: {
          tenantId,
          tableId,
          waiterId: built.data.waiterId,
          type: built.data.type,
          status: built.data.initialStatus,
          statusChangedAt: new Date(),
          total: built.data.total,
          deliveryFee: built.data.deliveryFee,
          notes: built.data.notes,
          customerName: built.data.customerName,
          customerPhone: built.data.customerPhone,
          customerAddress: built.data.customerAddress,
          paymentMethodType: built.data.paymentMethodType,
          customerSessionId: built.data.customerSessionId,
          dailyNumber,
          items: { create: built.data.itemsToCreate },
        },
      }

      try {
        return await tx.order.create({ ...createArgs, select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }) })
      } catch (err) {
        if (!isMissingAnyOrderColumns(err)) throw err
        const fallbackCreateArgs = {
          ...createArgs,
          data: { ...createArgs.data },
        }
        delete fallbackCreateArgs.data.deliveryFee
        delete fallbackCreateArgs.data.statusChangedAt
        delete fallbackCreateArgs.data.waiterId
        delete fallbackCreateArgs.data.paymentMethodType
        delete fallbackCreateArgs.data.customerSessionId
        delete fallbackCreateArgs.data.dailyNumber
        return await tx.order.create({ ...fallbackCreateArgs, select: orderSelect({ includeStatusChangedAt: false, includeDelivery: false }) })
      }
    })

    void notifyOrderCreated(prisma, order)
    return res.status(201).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/public/tenant/:slug/orders/history", async (req, res) => {
  try {
    const tenantId = await resolveTenantIdFromSlug(req.params.slug)
    if (!tenantId) return res.status(404).json({ error: "Tenant não encontrado" })
    const customerSessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : ''
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(customerSessionId)) return res.status(400).json({ error: "Sessão do cliente inválida" })
    const orders = await prisma.order.findMany({
      where: { tenantId, customerSessionId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: {
        id: true, type: true, status: true, total: true, deliveryFee: true, paymentMethodType: true,
        customerName: true, customerAddress: true, notes: true, createdAt: true,
        items: { select: { id: true, quantity: true, unitPrice: true, notes: true, product: { select: { name: true } }, flavors: { select: { nameApplied: true, fraction: true } }, options: { select: { quantity: true, priceAdded: true, option: { select: { name: true } } } } } },
      },
    })
    return res.json(orders)
  } catch (error) {
    console.error('Erro ao carregar histórico público:', error)
    return res.status(500).json({ error: 'Erro ao carregar histórico de pedidos' })
  }
})

router.get("/tenant/:tenantId/orders", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = (req.authRole === "waiter" && req.tenantId === tenantId) || await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const status = typeof req.query.status === "string" ? parseOrderStatus(req.query.status) : null
    if (typeof req.query.status === "string" && !status) return res.status(400).json({ error: "status inválido" })

    const type = typeof req.query.type === "string" ? parseOrderType(req.query.type) : null
    if (typeof req.query.type === "string" && !type) return res.status(400).json({ error: "type inválido" })

    const accessWhere = { tenantId, ...(req.authRole === "waiter" ? { waiterId: req.waiterId } : {}) }
    let orders
    try {
      orders = await prisma.order.findMany({
        where: { ...accessWhere, ...(status ? { status } : {}), ...(type ? { type } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }),
      })
    } catch (err) {
      if (!isMissingAnyOrderColumns(err)) throw err
      orders = await prisma.order.findMany({
        where: { ...accessWhere, ...(status ? { status } : {}), ...(type ? { type } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: orderSelect({ includeStatusChangedAt: false, includeDelivery: false }),
      })
    }

    return res.status(200).json(orders)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/tenant/:tenantId/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = (req.authRole === "waiter" && req.tenantId === tenantId) || await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    let order
    try {
      order = await prisma.order.findFirst({
        where: { tenantId, id, ...(req.authRole === "waiter" ? { waiterId: req.waiterId } : {}) },
        select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }),
      })
    } catch (err) {
      if (!isMissingAnyOrderColumns(err)) throw err
      order = await prisma.order.findFirst({
        where: { tenantId, id, ...(req.authRole === "waiter" ? { waiterId: req.waiterId } : {}) },
        select: orderSelect({ includeStatusChangedAt: false, includeDelivery: false }),
      })
    }

    if (!order) return res.status(404).json({ error: "Pedido não encontrado" })
    return res.status(200).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.post("/tenant/:tenantId/orders/:id/items", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = (req.authRole === "waiter" && req.tenantId === tenantId) || await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.order.findFirst({
      where: { tenantId, id, ...(req.authRole === "waiter" ? { waiterId: req.waiterId } : {}) },
      select: { id: true, type: true, status: true, total: true, paidAt: true },
    })
    if (!existing) return res.status(404).json({ error: "Pedido não encontrado" })
    if (existing.paidAt || ["delivered", "cancelled", "returned"].includes(existing.status)) {
      return res.status(409).json({ error: "Não é possível adicionar produtos a um pedido finalizado" })
    }

    const built = await buildOrderCreateData({ tenantId, body: { type: existing.type, items: req.body?.items } })
    if (!built.ok) return res.status(built.status).json({ error: built.error })

    const currentTotalCents = decimalStringToCents(existing.total?.toString?.() ?? String(existing.total ?? "0")) ?? 0n
    const addedTotalCents = built.data.itemsToCreate.reduce((sum, item) => {
      const unitPrice = decimalStringToCents(item.unitPrice) ?? 0n
      const optionPrice = (item.options?.create || []).reduce((optionSum, option) => {
        return optionSum + (decimalStringToCents(option.priceAdded) ?? 0n) * BigInt(option.quantity || 1)
      }, 0n)
      return sum + (unitPrice + optionPrice) * BigInt(item.quantity)
    }, 0n)
    let hasKdsAddition = false
    await prisma.$transaction(async (tx) => {
      for (const item of built.data.itemsToCreate) {
        const product = await tx.product.findUnique({ where: { id: item.productId }, select: { skipKds: true } })
        const fractionProduct = item.fractionProductId ? await tx.product.findUnique({ where: { id: item.fractionProductId }, select: { skipKds: true } }) : null
        const isReady = Boolean(product?.skipKds && (!fractionProduct || fractionProduct.skipKds))
        if (!isReady) hasKdsAddition = true
        await tx.orderItem.create({
          data: {
            ...item,
            orderId: id,
            kitchenStatus: isReady ? "ready" : ["preparing", "ready"].includes(existing.status) || built.data.initialStatus === "preparing" ? "preparing" : "pending",
            addedAt: new Date(),
          },
        })
      }
      await tx.order.update({
        where: { id },
        data: {
          total: centsToDecimalString(currentTotalCents + addedTotalCents),
          ...(hasKdsAddition && existing.status === "ready" ? { status: "preparing", statusChangedAt: new Date() } : {}),
        },
      })
    })

    const order = await prisma.order.findFirst({
      where: { tenantId, id },
      select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }),
    })
    return res.status(201).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.patch("/tenant/:tenantId/orders/:id/items/kitchen-status", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    const status = parseOrderStatus(req.body?.status)
    const itemIds = (Array.isArray(req.body?.itemIds) ? req.body.itemIds : []).map(parseIntOrNull).filter(Boolean)
    if (!id || !itemIds.length) return res.status(400).json({ error: "Pedido e itens são obrigatórios" })
    if (!status || !["preparing", "ready"].includes(status)) return res.status(400).json({ error: "Status de cozinha inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })
    const order = await prisma.order.findFirst({ where: { tenantId, id }, select: { id: true } })
    if (!order) return res.status(404).json({ error: "Pedido não encontrado" })

    await prisma.orderItem.updateMany({
      where: { orderId: id, id: { in: itemIds }, kitchenStatus: { not: null } },
      data: { kitchenStatus: status },
    })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.post("/tenant/:tenantId/orders", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = (req.authRole === "waiter" && req.tenantId === tenantId) || await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const built = await buildOrderCreateData({ tenantId, body: req.authRole === "waiter" ? { ...req.body, waiterId: req.waiterId } : req.body })
    if (!built.ok) return res.status(built.status).json({ error: built.error })

    const order = await prisma.$transaction(async (tx) => {
      const tableId =
        built.data.tableNumber && built.data.type === "local"
          ? (
              await tx.table.upsert({
                where: { tenantId_number: { tenantId, number: built.data.tableNumber } },
                update: {},
                create: { tenantId, number: built.data.tableNumber },
                select: { id: true },
              })
            ).id
          : null

      const dailyNumber = await nextDailyOrderNumber(tx, tenantId)

      const createArgs = {
        data: {
          tenantId,
          tableId,
          waiterId: built.data.waiterId,
          type: built.data.type,
          status: built.data.initialStatus,
          statusChangedAt: new Date(),
          total: built.data.total,
          deliveryFee: built.data.deliveryFee,
          notes: built.data.notes,
          customerName: built.data.customerName,
          customerPhone: built.data.customerPhone,
          customerAddress: built.data.customerAddress,
          dailyNumber,
          items: { create: built.data.itemsToCreate },
        },
      }

      try {
        return await tx.order.create({ ...createArgs, select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }) })
      } catch (err) {
        if (!isMissingAnyOrderColumns(err)) throw err
        const fallbackCreateArgs = {
          ...createArgs,
          data: { ...createArgs.data },
        }
        delete fallbackCreateArgs.data.deliveryFee
        delete fallbackCreateArgs.data.statusChangedAt
        delete fallbackCreateArgs.data.waiterId
        delete fallbackCreateArgs.data.dailyNumber
        return await tx.order.create({ ...fallbackCreateArgs, select: orderSelect({ includeStatusChangedAt: false, includeDelivery: false }) })
      }
    })

    return res.status(201).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.patch("/tenant/:tenantId/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const isWaiterRequest = req.authRole === "waiter" && req.tenantId === tenantId
    const allowed = isWaiterRequest || await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    let existing
    try {
      existing = await prisma.order.findFirst({
        where: { tenantId, id, ...(isWaiterRequest ? { waiterId: req.waiterId } : {}) },
        select: { id: true, status: true, type: true, total: true, deliveryFee: true, waiterId: true, paymentMethodType: true, paidAt: true },
      })
    } catch (err) {
      if (!isMissingAnyOrderColumns(err)) throw err
      existing = await prisma.order.findFirst({ where: { tenantId, id, ...(isWaiterRequest ? { waiterId: req.waiterId } : {}) }, select: { id: true, status: true, type: true } })
    }
    if (!existing) return res.status(404).json({ error: "Pedido não encontrado" })

    if (isWaiterRequest) {
      const allowedFields = new Set(["status", "paymentMethodType", "extras", "waiterCommissionPercent", "waiterCommissionAddedToTotal"])
      const hasForbiddenField = Object.keys(req.body || {}).some((key) => !allowedFields.has(key))
      const isOwnCancellation = req.body?.status === "cancelled" && Object.keys(req.body || {}).every((key) => key === "status")
      if (hasForbiddenField || (!isOwnCancellation && (req.body?.status !== "delivered" || typeof req.body?.paymentMethodType !== "string"))) {
        return res.status(403).json({ error: "O garçom só pode fechar e receber pedidos próprios" })
      }
      if (!isOwnCancellation && existing.status !== "ready") return res.status(409).json({ error: "O pedido precisa estar pronto para fechar a conta" })
    }

    if (req.body?.cancelDelivery === true) {
      if (isWaiterRequest) return res.status(403).json({ error: "A entrega só pode ser cancelada pelo atendimento" })
      if (existing.status !== "out_for_delivery") return res.status(409).json({ error: "O pedido não está em entrega" })
      const order = await prisma.order.update({
        where: { id },
        data: { status: "ready", deliveryManId: null, deliveryCancelledAt: new Date(), statusChangedAt: new Date() },
        select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }),
      })
      void notifyOrderStatusChanged(prisma, order)
      return res.status(200).json(order)
    }

    const data = {}
    let extrasToCreate = null
    let extrasTotalCents = null
    if (typeof req.body?.notes === "string") data.notes = req.body.notes.trim() || null
    if (typeof req.body?.customerName === "string") data.customerName = req.body.customerName.trim() || null
    if (typeof req.body?.customerPhone === "string") data.customerPhone = req.body.customerPhone.trim() || null
    if (typeof req.body?.customerAddress === "string") data.customerAddress = req.body.customerAddress.trim() || null
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "extras")) {
      if (existing.paidAt || ["delivered", "cancelled", "returned"].includes(existing.status)) return res.status(409).json({ error: "Não é possível alterar acréscimos de um pedido finalizado" })
      if (!Array.isArray(req.body.extras) || req.body.extras.length > 50) return res.status(400).json({ error: "Acréscimos inválidos" })
      extrasToCreate = []
      extrasTotalCents = 0n
      for (const extra of req.body.extras) {
        const description = typeof extra?.description === "string" ? extra.description.trim() : ""
        const quantity = parseIntOrNull(extra?.quantity)
        const unitPrice = parsePriceToDecimalString(extra?.unitPrice)
        if (!description || description.length > 160) return res.status(400).json({ error: "Informe uma descrição válida para o acréscimo" })
        if (!quantity || quantity < 1 || quantity > 999) return res.status(400).json({ error: "Quantidade do acréscimo inválida" })
        if (unitPrice === null || Number(unitPrice) < 0) return res.status(400).json({ error: "Valor do acréscimo inválido" })
        const unitCents = decimalStringToCents(unitPrice)
        extrasTotalCents += (unitCents ?? 0n) * BigInt(quantity)
        extrasToCreate.push({ description, quantity, unitPrice })
      }
      const orderWithItems = await prisma.order.findFirst({
        where: { tenantId, id },
        select: { items: { select: { quantity: true, unitPrice: true, options: { select: { quantity: true, priceAdded: true } } } } },
      })
      const itemCents = calculateItemsTotalCentsFromOrder(orderWithItems)
      const deliveryFeeCents = decimalStringToCents(existing.deliveryFee?.toString?.() ?? String(existing.deliveryFee ?? "0")) ?? 0n
      data.total = centsToDecimalString(itemCents + deliveryFeeCents + extrasTotalCents)
    }
    if (typeof req.body?.deliveryFee !== "undefined") {
      const fee = parsePriceToDecimalString(req.body.deliveryFee)
      if (fee === null) return res.status(400).json({ error: "deliveryFee inválido" })
      data.deliveryFee = fee
    }
    if (typeof req.body?.cancellationFee !== "undefined") {
      const fee = parsePriceToDecimalString(req.body.cancellationFee)
      if (fee === null || Number(fee) < 0) return res.status(400).json({ error: "Taxa de cancelamento inválida" })
      data.cancellationFee = fee
      if (Number(fee) > 0) {
        const method = parsePaymentMethodType(req.body?.cancellationPaymentMethodType)
        if (!method) return res.status(400).json({ error: "Informe a forma de pagamento da taxa de cancelamento" })
        data.cancellationPaymentMethodType = method
        data.cancellationFeePaidAt = new Date()
      } else {
        data.cancellationPaymentMethodType = null
        data.cancellationFeePaidAt = null
      }
    }
    if (typeof req.body?.deliveryManId !== "undefined") {
      const deliveryManId = parseIntOrNull(req.body.deliveryManId)
      if (!deliveryManId) return res.status(400).json({ error: "deliveryManId inválido" })
      const driver = await prisma.deliveryMen.findFirst({ where: { id: deliveryManId, tenantId }, select: { id: true } })
      if (!driver) return res.status(400).json({ error: "Entregador inválido" })
      data.deliveryManId = deliveryManId
    }
    if (typeof req.body?.type === "string") {
      const type = parseOrderType(req.body.type)
      if (!type) return res.status(400).json({ error: "type inválido" })
      data.type = type
      if (type !== "delivery") {
        data.deliveryFee = "0.00"
        data.deliveryManId = null
      }
    }
    if (typeof req.body?.paymentMethodType === "string") {
      const paymentMethodType = parsePaymentMethodType(req.body.paymentMethodType)
      if (!paymentMethodType) return res.status(400).json({ error: "paymentMethodType inválido" })
      data.paymentMethodType = paymentMethodType
      data.paidAt = new Date()
    }
    if (typeof req.body?.discountAmount !== "undefined" || typeof req.body?.waiterCommissionPercent !== "undefined") {
      const discount = parsePriceToDecimalString(req.body?.discountAmount ?? "0")
      const commissionPercent = parsePriceToDecimalString(req.body?.waiterCommissionPercent ?? "0")
      if (discount === null || Number(discount) < 0) return res.status(400).json({ error: "Desconto inválido" })
      if (commissionPercent === null || Number(commissionPercent) < 0 || Number(commissionPercent) > 100) return res.status(400).json({ error: "Comissão deve estar entre 0 e 100%" })
      const originalCents = decimalStringToCents(data.total?.toString?.() ?? existing.total?.toString?.() ?? String(existing.total ?? "0")) ?? 0n
      const discountCents = decimalStringToCents(discount) ?? 0n
      if (discountCents > originalCents) return res.status(400).json({ error: "Desconto não pode ser maior que o pedido" })
      const finalCents = originalCents - discountCents
      const commissionBasisPoints = BigInt(Math.round(Number(commissionPercent) * 100))
      const commissionCents = (finalCents * commissionBasisPoints + 5000n) / 10000n
      const addCommissionToTotal = req.body?.waiterCommissionAddedToTotal === true
      data.discountAmount = discount
      data.waiterCommissionPercent = commissionPercent
      data.waiterCommissionAmount = centsToDecimalString(commissionCents)
      data.waiterCommissionAddedToTotal = addCommissionToTotal
      data.total = centsToDecimalString(finalCents + (addCommissionToTotal ? commissionCents : 0n))
    }
    if (typeof req.body?.status === "string") {
      const status = parseOrderStatus(req.body.status)
      if (!status) return res.status(400).json({ error: "status inválido" })
      if (status === "delivered") {
        const unfinishedAdditions = await prisma.orderItem.count({
          where: { orderId: id, kitchenStatus: { in: ["pending", "confirmed", "preparing"] } },
        })
        if (unfinishedAdditions > 0) {
          return res.status(409).json({ error: "Ainda existem complementos aguardando preparo na cozinha" })
        }
      }
      if (status === "cancelled") {
        if (["delivered", "cancelled", "returned"].includes(existing.status)) {
          return res.status(409).json({ error: "Este pedido já foi finalizado e não pode ser cancelado" })
        }
        if (existing.status === "out_for_delivery") {
          return res.status(409).json({ error: "Cancele primeiro a entrega e depois cancele o pedido" })
        }
        data.deliveryManId = null
      }
      const resolvedType = typeof data.type === "string" ? data.type : existing.type
      if (status === "out_for_delivery" && resolvedType !== "delivery") {
        return res.status(400).json({ error: "Pedido não é do tipo delivery" })
      }
      data.status = status
      if (existing.status !== status) data.statusChangedAt = new Date()
    }

    if (typeof data.type === "string" && data.type === "delivery" && existing.type !== "delivery") {
      const resolvedAddress = typeof data.customerAddress === "string" ? data.customerAddress : null
      if (!resolvedAddress) {
        const existingAddress = await prisma.order.findFirst({ where: { tenantId, id }, select: { customerAddress: true } })
        if (!existingAddress?.customerAddress) return res.status(400).json({ error: "customerAddress é obrigatório para delivery" })
      }
      if (typeof data.deliveryFee === "undefined") {
        const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { deliveryFee: true } })
        const feeStr = tenant?.deliveryFee?.toString?.() ?? String(tenant?.deliveryFee ?? "0")
        const fee = parsePriceToDecimalString(feeStr) ?? "0.00"
        data.deliveryFee = fee
      }
    }

    if (typeof data.deliveryFee !== "undefined") {
      const orderWithItems = await prisma.order.findFirst({
        where: { tenantId, id },
        select: {
          id: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              options: { select: { quantity: true, priceAdded: true } },
            },
          },
        },
      })
      if (orderWithItems) {
        const itemsCents = calculateItemsTotalCentsFromOrder(orderWithItems)
        const feeCents = decimalStringToCents(data.deliveryFee)
        if (feeCents !== null) data.total = centsToDecimalString(itemsCents + feeCents)
      }
    }

    let order
    try {
      if (extrasToCreate !== null) {
        order = await prisma.$transaction(async (tx) => {
          await tx.orderExtra.deleteMany({ where: { orderId: id } })
          if (extrasToCreate.length) await tx.orderExtra.createMany({ data: extrasToCreate.map((extra) => ({ ...extra, orderId: id })) })
          return tx.order.update({ where: { id }, data, select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }) })
        })
      } else {
        order = await prisma.order.update({ where: { id }, data, select: orderSelect({ includeStatusChangedAt: true, includeDelivery: true }) })
      }
    } catch (err) {
      if (!isMissingAnyOrderColumns(err)) throw err
      const fallbackData = { ...data }
      delete fallbackData.statusChangedAt
      delete fallbackData.deliveryFee
      delete fallbackData.cancellationFee
      delete fallbackData.cancellationPaymentMethodType
      delete fallbackData.cancellationFeePaidAt
      delete fallbackData.deliveryManId
      delete fallbackData.waiterId
      delete fallbackData.paymentMethodType
      delete fallbackData.paidAt
      delete fallbackData.discountAmount
      delete fallbackData.waiterCommissionPercent
      delete fallbackData.waiterCommissionAmount
      delete fallbackData.waiterCommissionAddedToTotal
      order = await prisma.order.update({ where: { id }, data: fallbackData, select: orderSelect({ includeStatusChangedAt: false, includeDelivery: false }) })
      if (typeof data.statusChangedAt !== "undefined") order.statusChangedAt = new Date()
    }

    if (existing.status !== order.status) void notifyOrderStatusChanged(prisma, order)
    return res.status(200).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.delete("/tenant/:tenantId/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.order.findFirst({ where: { tenantId, id }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: "Pedido não encontrado" })

    await prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId: id }, select: { id: true } })
      const itemIds = items.map((i) => i.id)
      if (itemIds.length) {
        await tx.orderItemOption.deleteMany({ where: { orderItemId: { in: itemIds } } })
        await tx.orderItem.deleteMany({ where: { id: { in: itemIds } } })
      }
      await tx.order.delete({ where: { id } })
    })

    return res.status(204).json({})
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

export default router
