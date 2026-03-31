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

router.get("/tenant/:tenantId/categories", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const active =
      typeof req.query.active === "string"
        ? req.query.active === "true"
          ? true
          : req.query.active === "false"
            ? false
            : undefined
        : undefined

    const categories = await prisma.category.findMany({
      where: { tenantId, ...(typeof active === "boolean" ? { active } : {}) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    })

    return res.status(200).json(categories)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.get("/tenant/:tenantId/categories/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const category = await prisma.category.findFirst({
      where: { id, tenantId },
    })

    if (!category) return res.status(404).json({ error: "Categoria não encontrada" })
    return res.status(200).json(category)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para criar uma nova categoria do tenant (food truck) do usuário autenticado do tenant (food truck)
router.post("/tenant/:tenantId/categories", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    const active = typeof req.body?.active === "boolean" ? req.body.active : true

    if (!name) return res.status(400).json({ error: "Nome é obrigatório" })

    const category = await prisma.category.create({
      data: { tenantId, name, active },
    })

    return res.status(201).json(category)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para atualizar uma categoria do tenant (food truck) do usuário autenticado do tenant (food truck)
router.put("/tenant/:tenantId/categories/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.category.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: "Categoria não encontrada" })

    const data = {}
    if (typeof req.body?.name === "string") data.name = req.body.name.trim()
    if (typeof req.body?.active === "boolean") data.active = req.body.active

    if (typeof data.name === "string" && !data.name) {
      return res.status(400).json({ error: "Nome é obrigatório" })
    }

    const category = await prisma.category.update({
      where: { id },
      data,
    })

    return res.status(200).json(category)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

// rota para excluir uma categoria do tenant (food truck) do usuário autenticado do tenant (food truck)
router.delete("/tenant/:tenantId/categories/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.category.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: "Categoria não encontrada" })

    await prisma.category.delete({ where: { id } })
    return res.status(204).json({})
  } catch (error) {
    console.error(error)
    if (error?.code === "P2003") {
      return res.status(400).json({ error: "Não é possível excluir: existem produtos vinculados à categoria" })
    }
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

export default router

