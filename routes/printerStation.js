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

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

router.get("/tenant/:tenantId/printer-stations", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = (req.authRole === "waiter" && req.tenantId === tenantId) || await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const stations = await prisma.printerStation.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: { _count: { select: { categories: true } } },
    })

    return res.status(200).json(stations)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.post("/tenant/:tenantId/printer-stations", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
    if (!name) return res.status(400).json({ error: "Nome é obrigatório" })

    const key = normalizeKey(typeof req.body?.key === "string" && req.body.key.trim() ? req.body.key : name)
    if (!key) return res.status(400).json({ error: "Não foi possível gerar uma chave válida para o nome informado" })

    const existing = await prisma.printerStation.findFirst({ where: { tenantId, key } })
    if (existing) return res.status(409).json({ error: "Já existe uma estação com essa chave" })

    const station = await prisma.printerStation.create({ data: { tenantId, key, name } })
    return res.status(201).json(station)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.put("/tenant/:tenantId/printer-stations/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.printerStation.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: "Estação não encontrada" })

    const data = {}
    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim()
      if (!name) return res.status(400).json({ error: "Nome é obrigatório" })
      data.name = name
    }
    if (typeof req.body?.key === "string") {
      const key = normalizeKey(req.body.key)
      if (!key) return res.status(400).json({ error: "Chave inválida" })
      const clash = await prisma.printerStation.findFirst({ where: { tenantId, key, id: { not: id } } })
      if (clash) return res.status(409).json({ error: "Já existe uma estação com essa chave" })
      data.key = key
    }

    const station = await prisma.printerStation.update({ where: { id }, data })
    return res.status(200).json(station)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

router.delete("/tenant/:tenantId/printer-stations/:id", authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = parseIntOrNull(req.params.id)
    if (!id) return res.status(400).json({ error: "ID inválido" })

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId })
    if (!allowed) return res.status(403).json({ error: "Acesso negado ao tenant" })

    const existing = await prisma.printerStation.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: "Estação não encontrada" })

    await prisma.printerStation.delete({ where: { id } })
    return res.status(204).json({})
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro interno do servidor" })
  }
})

export default router
