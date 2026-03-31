import express from "express"
import { PrismaClient } from "@prisma/client"
import authMiddleware from "../middlewares/auth.js"

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

function parseOrderType(value) {
  if (value === "local" || value === "delivery") return value
  return null
}

function parseOrderStatus(value) {
  if (
    value === "pending" ||
    value === "confirmed" ||
    value === "preparing" ||
    value === "ready" ||
    value === "delivered" ||
    value === "cancelled" ||
    value === "returned"
  ) {
    return value
  }
  return null
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

async function buildOrderCreateData({ tenantId, body }) {
  const type = parseOrderType(body?.type)
  if (!type) return { ok: false, status: 400, error: "type inválido" }

  const itemsInput = Array.isArray(body?.items) ? body.items : []
  if (!itemsInput.length) return { ok: false, status: 400, error: "items é obrigatório" }

  const tableNumber = parseIntOrNull(body?.tableNumber)
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null
  const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : null
  const customerPhone = typeof body?.customerPhone === "string" ? body.customerPhone.trim() : null
  const customerAddress = typeof body?.customerAddress === "string" ? body.customerAddress.trim() : null

  const productIds = []
  const optionIds = []

  for (const item of itemsInput) {
    const productId = parseIntOrNull(item?.productId)
    const quantity = parseIntOrNull(item?.quantity)
    if (!productId) return { ok: false, status: 400, error: "productId inválido" }
    if (!quantity || quantity < 1) return { ok: false, status: 400, error: "quantity inválido" }

    productIds.push(productId)

    const options = Array.isArray(item?.options) ? item.options : []
    for (const opt of options) {
      const optionId = parseIntOrNull(opt?.optionId)
      if (!optionId) return { ok: false, status: 400, error: "optionId inválido" }
      optionIds.push(optionId)
    }
  }

  const [products, options] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, active: true },
      select: { id: true, price: true },
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
  ])

  const productById = new Map(products.map((p) => [p.id, p]))
  const optionById = new Map(options.map((o) => [o.id, o]))

  const itemsToCreate = []
  let totalCents = 0n

  for (const item of itemsInput) {
    const productId = parseIntOrNull(item?.productId)
    const quantity = parseIntOrNull(item?.quantity)
    const itemNotes = typeof item?.notes === "string" ? item.notes.trim() : null

    const product = productId ? productById.get(productId) : null
    if (!product) return { ok: false, status: 400, error: "Produto inválido ou inativo" }

    const unitPriceCents = decimalStringToCents(product.price?.toString?.() ?? String(product.price))
    if (unitPriceCents === null) return { ok: false, status: 500, error: "Preço do produto inválido" }

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
      quantity,
      unitPrice: centsToDecimalString(unitPriceCents),
      notes: itemNotes || null,
      options: optionsToCreate.length ? { create: optionsToCreate } : undefined,
    })
  }

  const total = centsToDecimalString(totalCents)

  return {
    ok: true,
    data: {
      type,
      total,
      notes: notes || null,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      tableNumber: typeof tableNumber === "number" ? tableNumber : null,
      itemsToCreate,
    },
  }
}

router.post("/public/tenant/:slug/orders", async (req, res) => {
  try {
    const { slug } = req.params
    const tenantId = await resolveTenantIdFromSlug(slug)
    if (!tenantId) return res.status(404).json({ error: "Tenant não encontrado" })

    const built = await buildOrderCreateData({ tenantId, body: req.body })
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

      return await tx.order.create({
        data: {
          tenantId,
          tableId,
          type: built.data.type,
          total: built.data.total,
          notes: built.data.notes,
          customerName: built.data.customerName,
          customerPhone: built.data.customerPhone,
          customerAddress: built.data.customerAddress,
          items: { create: built.data.itemsToCreate },
        },
        include: {
          items: { include: { options: true, product: true } },
          table: true,
        },
      })
    })

    return res.status(201).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/tenant/:tenantId/orders", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const status = typeof req.query.status === "string" ? parseOrderStatus(req.query.status) : null
    if (typeof req.query.status === "string" && !status) return res.status(400).json({ error: "status inválido" })

    const type = typeof req.query.type === "string" ? parseOrderType(req.query.type) : null
    if (typeof req.query.type === "string" && !type) return res.status(400).json({ error: "type inválido" })

    const orders = await prisma.order.findMany({
      where: { tenantId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        table: true,
        items: { include: { product: true, options: { include: { option: true } } } },
      },
    })

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

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const order = await prisma.order.findFirst({
      where: { tenantId, id },
      include: {
        table: true,
        items: { include: { product: true, options: { include: { option: true } } } },
      },
    })

    if (!order) return res.status(404).json({ error: "Pedido não encontrado" })
    return res.status(200).json(order)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.post("/tenant/:tenantId/orders", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const built = await buildOrderCreateData({ tenantId, body: req.body })
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

      return await tx.order.create({
        data: {
          tenantId,
          tableId,
          type: built.data.type,
          total: built.data.total,
          notes: built.data.notes,
          customerName: built.data.customerName,
          customerPhone: built.data.customerPhone,
          customerAddress: built.data.customerAddress,
          items: { create: built.data.itemsToCreate },
        },
        include: {
          items: { include: { options: true, product: true } },
          table: true,
        },
      })
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

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.order.findFirst({ where: { tenantId, id } })
    if (!existing) return res.status(404).json({ error: "Pedido não encontrado" })

    const data = {}
    if (typeof req.body?.notes === "string") data.notes = req.body.notes.trim() || null
    if (typeof req.body?.customerName === "string") data.customerName = req.body.customerName.trim() || null
    if (typeof req.body?.customerPhone === "string") data.customerPhone = req.body.customerPhone.trim() || null
    if (typeof req.body?.customerAddress === "string") data.customerAddress = req.body.customerAddress.trim() || null
    if (typeof req.body?.status === "string") {
      const status = parseOrderStatus(req.body.status)
      if (!status) return res.status(400).json({ error: "status inválido" })
      data.status = status
    }

    const order = await prisma.order.update({
      where: { id },
      data,
      include: {
        table: true,
        items: { include: { product: true, options: { include: { option: true } } } },
      },
    })

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

