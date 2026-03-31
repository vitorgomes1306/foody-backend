import express from "express"
import { PrismaClient } from "@prisma/client"
import authMiddleware from "../middlewares/auth.js"

const prisma = new PrismaClient()
const router = express.Router()

// middleware para verificar se o usuário é o proprietário do tenant (food truck)
async function assertTenantOwner({ tenantId, userId }) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, ownerId: userId },
    select: { id: true },
  })
  return Boolean(tenant)
}

// middleware para converter números em null se forem inválidos
function parseIntOrNull(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

// middleware para converter preços em strings de decimal
function parsePriceToPrismaDecimalString(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return ""
}

// middleware para obter a próxima sequência do produto
async function getNextProductSeq(tenantId) {
  const rows = await prisma.$queryRaw`SELECT next_product_seq(${tenantId}::uuid) AS seq`
  const seq = Array.isArray(rows) ? rows?.[0]?.seq : null
  if (typeof seq === "number") return seq
  if (typeof seq === "bigint") return Number(seq)
  return null
}

// middleware para criar um produto com sequência
async function createProductWithSeq({ tenantId, data }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`SELECT next_product_seq(${tenantId}::uuid) AS seq`
        const seqRaw = Array.isArray(rows) ? rows?.[0]?.seq : null
        const seq = typeof seqRaw === "bigint" ? Number(seqRaw) : seqRaw
        if (typeof seq !== "number" || !Number.isFinite(seq)) {
          throw new Error("Falha ao gerar sequência do produto")
        }

        return await tx.product.create({
          data: { ...data, tenantId, seq },
        })
      })
    } catch (error) {
      if (error?.code === "P2002") {
        continue
      }
      throw error
    }
  }

  throw new Error("Falha ao gerar sequência do produto")
}

// rota para obter a próxima sequência do produto do tenant (food truck) do usuário autenticado do tenant (food truck)
router.get("/tenant/:tenantId/products/next-seq", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const seq = await getNextProductSeq(tenantId)
    if (typeof seq !== "number") {
      return res.status(500).json({ error: "Falha ao gerar sequência do produto" })
    }

    return res.status(200).json({ seq })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para obter todos os produtos do tenant (food truck) do usuário autenticado do tenant (food truck)
router.get("/tenant/:tenantId/products", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const active =
      typeof req.query.active === "string" ? (req.query.active === "true" ? true : req.query.active === "false" ? false : undefined) : undefined

    const products = await prisma.product.findMany({
      where: { tenantId, ...(typeof active === "boolean" ? { active } : {}) },
      orderBy: [{ seq: "asc" }, { id: "asc" }],
    })

    return res.status(200).json(products)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para obter um produto pelo seu número de sequência do tenant (food truck) do usuário autenticado do tenant (food truck)
router.get("/tenant/:tenantId/products/by-seq/:seq", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const seq = parseIntOrNull(req.params.seq)

    if (!seq) return res.status(400).json({ error: "seq inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const product = await prisma.product.findFirst({
      where: { tenantId, seq },
    })

    if (!product) return res.status(404).json({ error: "Produto não encontrado" })
    return res.status(200).json(product)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para obter um produto pelo seu ID do tenant (food truck) do usuário autenticado do tenant (food truck)
router.get("/tenant/:tenantId/products/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const product = await prisma.product.findFirst({
      where: { id, tenantId },
    })

    if (!product) return res.status(404).json({ error: "Produto não encontrado" })
    return res.status(200).json(product)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para criar um produto do tenant (food truck) do usuário autenticado do tenant (food truck)
router.post("/tenant/:tenantId/products", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : null
    const price = parsePriceToPrismaDecimalString(req.body?.price)
    const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : null
    const categoryId = parseIntOrNull(req.body?.categoryId)
    const active = typeof req.body?.active === "boolean" ? req.body.active : true

    if (!name || !price || !categoryId) {
      return res.status(400).json({ error: "Dados obrigatórios faltando" })
    }

    const product = await createProductWithSeq({
      tenantId,
      data: {
        name,
        description: description || null,
        price,
        imageUrl: imageUrl || null,
        categoryId,
        active,
      },
    })

    return res.status(201).json(product)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para atualizar um produto do tenant (food truck) do usuário autenticado do tenant (food truck)

router.put("/tenant/:tenantId/products/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.product.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: "Produto não encontrado" })

    const data = {}

    if (typeof req.body?.name === "string") data.name = req.body.name.trim()
    if (typeof req.body?.description === "string") data.description = req.body.description.trim() || null
    if (typeof req.body?.price !== "undefined") {
      const price = parsePriceToPrismaDecimalString(req.body.price)
      if (!price) return res.status(400).json({ error: "Preço inválido" })
      data.price = price
    }
    if (typeof req.body?.imageUrl === "string") data.imageUrl = req.body.imageUrl.trim() || null
    if (typeof req.body?.active === "boolean") data.active = req.body.active
    if (typeof req.body?.categoryId !== "undefined") {
      const categoryId = parseIntOrNull(req.body.categoryId)
      if (!categoryId) return res.status(400).json({ error: "categoryId inválido" })
      data.categoryId = categoryId
    }

    const product = await prisma.product.update({
      where: { id },
      data,
    })

    return res.status(200).json(product)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para excluir um produto do tenant (food truck) do usuário autenticado do tenant (food truck)
router.delete("/tenant/:tenantId/products/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.product.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: "Produto não encontrado" })

    await prisma.product.delete({ where: { id } })
    return res.status(204).json({})
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

export default router
