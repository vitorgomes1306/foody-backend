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

async function assertProductBelongsToTenant({ productId, tenantId }) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId, active: true },
    select: { id: true },
  })
  return Boolean(product)
}

function parseIntOrNull(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function parsePriceToPrismaDecimalString(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return ""
}

router.get("/tenant/:tenantId/products/:productId/option-groups", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const productId = parseIntOrNull(req.params.productId)
    if (!productId) return res.status(400).json({ error: "productId inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })
    const productOk = await assertProductBelongsToTenant({ productId, tenantId })
    if (!productOk) return res.status(404).json({ error: "Produto não encontrado" })

    const groups = await prisma.optionGroup.findMany({
      where: { productId },
      orderBy: [{ id: "asc" }],
      include: { options: true },
    })

    return res.status(200).json(groups)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/tenant/:tenantId/products/:productId/option-groups/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const productId = parseIntOrNull(req.params.productId)
    const id = parseIntOrNull(req.params.id)
    if (!productId || !id) return res.status(400).json({ error: "IDs inválidos" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })
    const productOk = await assertProductBelongsToTenant({ productId, tenantId })
    if (!productOk) return res.status(404).json({ error: "Produto não encontrado" })

    const group = await prisma.optionGroup.findFirst({
      where: { id, productId },
      include: { options: true },
    })
    if (!group) return res.status(404).json({ error: "Grupo não encontrado" })
    return res.status(200).json(group)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.post("/tenant/:tenantId/products/:productId/option-groups", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const productId = parseIntOrNull(req.params.productId)
    if (!productId) return res.status(400).json({ error: "productId inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })
    const productOk = await assertProductBelongsToTenant({ productId, tenantId })
    if (!productOk) return res.status(404).json({ error: "Produto não encontrado" })

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const required = typeof req.body?.required === "boolean" ? req.body.required : false
    const multiple = typeof req.body?.multiple === "boolean" ? req.body.multiple : false
    const min = parseIntOrNull(req.body?.min) ?? 0
    const max = parseIntOrNull(req.body?.max) ?? (multiple ? 2 : 1)

    if (!name) return res.status(400).json({ error: "Nome é obrigatório" })
    if (min < 0 || max < 1 || min > max) return res.status(400).json({ error: "Faixa inválida de min/max" })
    if (!multiple && max !== 1) return res.status(400).json({ error: "max deve ser 1 quando multiple=false" })

    const group = await prisma.optionGroup.create({
      data: { productId, name, required, multiple, min, max },
      include: { options: true },
    })
    return res.status(201).json(group)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.put("/tenant/:tenantId/products/:productId/option-groups/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const productId = parseIntOrNull(req.params.productId)
    const id = parseIntOrNull(req.params.id)
    if (!productId || !id) return res.status(400).json({ error: "IDs inválidos" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })
    const productOk = await assertProductBelongsToTenant({ productId, tenantId })
    if (!productOk) return res.status(404).json({ error: "Produto não encontrado" })

    const existing = await prisma.optionGroup.findFirst({ where: { id, productId } })
    if (!existing) return res.status(404).json({ error: "Grupo não encontrado" })

    const data = {}
    if (typeof req.body?.name === "string") data.name = req.body.name.trim()
    if (typeof req.body?.required === "boolean") data.required = req.body.required
    if (typeof req.body?.multiple === "boolean") data.multiple = req.body.multiple
    if (typeof req.body?.min !== "undefined") {
      const min = parseIntOrNull(req.body.min)
      if (min === null) return res.status(400).json({ error: "min inválido" })
      data.min = min
    }
    if (typeof req.body?.max !== "undefined") {
      const max = parseIntOrNull(req.body.max)
      if (max === null) return res.status(400).json({ error: "max inválido" })
      data.max = max
    }

    if (typeof data.multiple === "boolean") {
      if (!data.multiple && (typeof data.max === "number" ? data.max !== 1 : existing.max !== 1)) {
        return res.status(400).json({ error: "max deve ser 1 quando multiple=false" })
      }
    }
    const minVal = typeof data.min === "number" ? data.min : existing.min
    const maxVal = typeof data.max === "number" ? data.max : existing.max
    if (minVal < 0 || maxVal < 1 || minVal > maxVal) return res.status(400).json({ error: "Faixa inválida de min/max" })

    const group = await prisma.optionGroup.update({
      where: { id },
      data,
      include: { options: true },
    })
    return res.status(200).json(group)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.delete("/tenant/:tenantId/products/:productId/option-groups/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const productId = parseIntOrNull(req.params.productId)
    const id = parseIntOrNull(req.params.id)
    if (!productId || !id) return res.status(400).json({ error: "IDs inválidos" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })
    const productOk = await assertProductBelongsToTenant({ productId, tenantId })
    if (!productOk) return res.status(404).json({ error: "Produto não encontrado" })

    const existing = await prisma.optionGroup.findFirst({ where: { id, productId } })
    if (!existing) return res.status(404).json({ error: "Grupo não encontrado" })

    try {
      await prisma.$transaction(async (tx) => {
        const options = await tx.option.findMany({ where: { groupId: id }, select: { id: true } })
        const optionIds = options.map((o) => o.id)
        if (optionIds.length) {
          await tx.option.deleteMany({ where: { id: { in: optionIds } } })
        }
        await tx.optionGroup.delete({ where: { id } })
      })
    } catch (error) {
      if (error?.code === "P2003") {
        return res.status(400).json({ error: "Não é possível excluir: opções usadas em pedidos" })
      }
      throw error
    }

    return res.status(204).json({})
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/tenant/:tenantId/option-groups/:groupId/options", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const groupId = parseIntOrNull(req.params.groupId)
    if (!groupId) return res.status(400).json({ error: "groupId inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId },
      select: { id: true, product: { select: { tenantId: true } } },
    })
    if (!group || group.product.tenantId !== tenantId) return res.status(404).json({ error: "Grupo não encontrado" })

    const options = await prisma.option.findMany({
      where: { groupId },
      orderBy: [{ id: "asc" }],
    })
    return res.status(200).json(options)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/tenant/:tenantId/option-groups/:groupId/options/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const groupId = parseIntOrNull(req.params.groupId)
    const id = parseIntOrNull(req.params.id)
    if (!groupId || !id) return res.status(400).json({ error: "IDs inválidos" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId },
      select: { id: true, product: { select: { tenantId: true } } },
    })
    if (!group || group.product.tenantId !== tenantId) return res.status(404).json({ error: "Grupo não encontrado" })

    const option = await prisma.option.findFirst({
      where: { id, groupId },
    })
    if (!option) return res.status(404).json({ error: "Opção não encontrada" })
    return res.status(200).json(option)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.post("/tenant/:tenantId/option-groups/:groupId/options", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const groupId = parseIntOrNull(req.params.groupId)
    if (!groupId) return res.status(400).json({ error: "groupId inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId },
      select: { id: true, product: { select: { tenantId: true } } },
    })
    if (!group || group.product.tenantId !== tenantId) return res.status(404).json({ error: "Grupo não encontrado" })

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const priceModifier = parsePriceToPrismaDecimalString(req.body?.priceModifier)
    if (!name) return res.status(400).json({ error: "Nome é obrigatório" })
    if (!priceModifier) return res.status(400).json({ error: "priceModifier inválido" })

    const option = await prisma.option.create({
      data: { groupId, name, priceModifier },
    })
    return res.status(201).json(option)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.put("/tenant/:tenantId/option-groups/:groupId/options/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const groupId = parseIntOrNull(req.params.groupId)
    const id = parseIntOrNull(req.params.id)
    if (!groupId || !id) return res.status(400).json({ error: "IDs inválidos" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId },
      select: { id: true, product: { select: { tenantId: true } } },
    })
    if (!group || group.product.tenantId !== tenantId) return res.status(404).json({ error: "Grupo não encontrado" })

    const existing = await prisma.option.findFirst({ where: { id, groupId } })
    if (!existing) return res.status(404).json({ error: "Opção não encontrada" })

    const data = {}
    if (typeof req.body?.name === "string") data.name = req.body.name.trim()
    if (typeof req.body?.priceModifier !== "undefined") {
      const pm = parsePriceToPrismaDecimalString(req.body.priceModifier)
      if (!pm) return res.status(400).json({ error: "priceModifier inválido" })
      data.priceModifier = pm
    }

    const option = await prisma.option.update({
      where: { id },
      data,
    })
    return res.status(200).json(option)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.delete("/tenant/:tenantId/option-groups/:groupId/options/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const groupId = parseIntOrNull(req.params.groupId)
    const id = parseIntOrNull(req.params.id)
    if (!groupId || !id) return res.status(400).json({ error: "IDs inválidos" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const group = await prisma.optionGroup.findFirst({
      where: { id: groupId },
      select: { id: true, product: { select: { tenantId: true } } },
    })
    if (!group || group.product.tenantId !== tenantId) return res.status(404).json({ error: "Grupo não encontrado" })

    try {
      await prisma.option.delete({ where: { id } })
    } catch (error) {
      if (error?.code === "P2003") {
        return res.status(400).json({ error: "Não é possível excluir: opção usada em pedidos" })
      }
      throw error
    }

    return res.status(204).json({})
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

export default router

