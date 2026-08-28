import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import authMiddleware from '../middlewares/auth.js'

const prisma = new PrismaClient()
const router = express.Router()
const waiterSelect = { id: true, tenantId: true, name: true, username: true, phone: true, email: true, active: true, createdAt: true, updatedAt: true }

router.post('/public/tenant/:slug/waiter/login', async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios' })
    const tenant = await prisma.tenant.findFirst({ where: { slug: req.params.slug.trim().toLowerCase(), active: true }, select: { id: true, name: true, slug: true, logoUrl: true, settings: true } })
    if (!tenant) return res.status(404).json({ error: 'Empresa não encontrada' })
    if (tenant.settings?.waiterAppEnabled === false) return res.status(403).json({ error: 'O aplicativo do garçom não está habilitado para esta empresa' })
    const waiter = await prisma.waiter.findUnique({ where: { tenantId_username: { tenantId: tenant.id, username } } })
    if (!waiter || !waiter.active || !(await bcrypt.compare(password, waiter.password))) return res.status(401).json({ error: 'Usuário ou senha inválidos' })
    const token = jwt.sign({ waiterId: waiter.id, tenantId: tenant.id, role: 'waiter' }, process.env.JWT_SECRET, { expiresIn: '100d' })
    return res.json({ token, tenant: { ...tenant, settings: undefined }, waiter: { id: waiter.id, name: waiter.name, username: waiter.username } })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao entrar como garçom' })
  }
})

router.post('/public/tenant/:slug/waiter/session', authMiddleware, async (req, res) => {
  try {
    if (req.authRole !== 'waiter' || !req.waiterId || !req.tenantId) return res.status(403).json({ error: 'Sessão de garçom inválida' })
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.tenantId, slug: req.params.slug.trim().toLowerCase(), active: true }, select: { id: true, name: true, slug: true, logoUrl: true },
    })
    if (!tenant) return res.status(401).json({ error: 'Empresa indisponível' })
    const waiter = await prisma.waiter.findFirst({ where: { id: req.waiterId, tenantId: tenant.id, active: true } })
    if (!waiter) return res.status(401).json({ error: 'Garçom inativo ou não encontrado' })
    const token = jwt.sign({ waiterId: waiter.id, tenantId: tenant.id, role: 'waiter' }, process.env.JWT_SECRET, { expiresIn: '100d' })
    return res.json({ token, tenant, waiter: { id: waiter.id, name: waiter.name, username: waiter.username } })
  } catch (error) {
    console.error('Erro ao renovar sessão do garçom:', error)
    return res.status(500).json({ error: 'Erro ao renovar sessão do garçom' })
  }
})

async function ownsTenant(tenantId, userId) {
  return Boolean(await prisma.tenant.findFirst({ where: { id: tenantId, ownerId: userId }, select: { id: true } }))
}

async function waiterAppEnabled(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } })
  return tenant?.settings?.waiterAppEnabled !== false
}

router.get('/tenant/:tenantId/tables', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const waiterAllowed = req.authRole === 'waiter' && req.tenantId === tenantId
    if (!waiterAllowed && !(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    const tables = await prisma.table.findMany({
      where: { tenantId },
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: { status: { in: ['pending', 'confirmed', 'preparing', 'ready'] }, paidAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, total: true, customerName: true, waiter: { select: { id: true, name: true } } },
        },
      },
    })
    return res.json(tables.map((table) => ({ ...table, occupied: table.orders.length > 0, activeOrder: table.orders[0] || null, orders: undefined })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar mesas' })
  }
})

router.post('/tenant/:tenantId/tables', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    const number = Number.parseInt(req.body?.number, 10)
    const capacity = Number.parseInt(req.body?.capacity, 10)
    if (!Number.isFinite(number) || number <= 0) return res.status(400).json({ error: 'Informe um número de mesa válido' })
    if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 100) return res.status(400).json({ error: 'Informe uma capacidade entre 1 e 100 pessoas' })
    const table = await prisma.table.create({ data: { tenantId, number, capacity } })
    return res.status(201).json(table)
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Esta mesa já está cadastrada' })
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar mesa' })
  }
})

router.patch('/tenant/:tenantId/tables/:id', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = Number.parseInt(req.params.id, 10)
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Mesa inválida' })
    const number = Number.parseInt(req.body?.number, 10)
    const capacity = Number.parseInt(req.body?.capacity, 10)
    if (!Number.isFinite(number) || number <= 0) return res.status(400).json({ error: 'Informe um número de mesa válido' })
    if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 100) return res.status(400).json({ error: 'Informe uma capacidade entre 1 e 100 pessoas' })
    const result = await prisma.table.updateMany({ where: { id, tenantId }, data: { number, capacity } })
    if (!result.count) return res.status(404).json({ error: 'Mesa não encontrada' })
    return res.json(await prisma.table.findFirst({ where: { id, tenantId } }))
  } catch (error) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Esta mesa já está cadastrada' })
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar mesa' })
  }
})

router.delete('/tenant/:tenantId/tables/:id', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = Number.parseInt(req.params.id, 10)
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    const orders = await prisma.order.count({ where: { tenantId, tableId: id } })
    if (orders > 0) return res.status(409).json({ error: 'A mesa possui pedidos e não pode ser excluída' })
    const result = await prisma.table.deleteMany({ where: { id, tenantId } })
    if (!result.count) return res.status(404).json({ error: 'Mesa não encontrada' })
    return res.status(204).send()
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao excluir mesa' })
  }
})

router.get('/tenant/:tenantId/waiters', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    if (!(await waiterAppEnabled(tenantId))) return res.status(403).json({ error: 'O aplicativo do garçom não está habilitado para esta empresa' })
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
    const waiters = await prisma.waiter.findMany({ where: { tenantId, ...(typeof active === 'boolean' ? { active } : {}) }, orderBy: [{ active: 'desc' }, { name: 'asc' }], select: waiterSelect })
    return res.json(waiters)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar garçons' })
  }
})

router.post('/tenant/:tenantId/waiters', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    if (!(await waiterAppEnabled(tenantId))) return res.status(403).json({ error: 'O aplicativo do garçom não está habilitado para esta empresa' })
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' })
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!username || password.length < 6) return res.status(400).json({ error: 'Informe usuário e senha com pelo menos 6 caracteres' })
    const waiter = await prisma.waiter.create({ data: { tenantId, name, username, password: await bcrypt.hash(password, 10), phone: req.body?.phone?.trim?.() || null, email: req.body?.email?.trim?.() || null, active: req.body?.active !== false }, select: waiterSelect })
    return res.status(201).json(waiter)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar garçom' })
  }
})

router.put('/tenant/:tenantId/waiters/:id', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    if (!(await waiterAppEnabled(tenantId))) return res.status(403).json({ error: 'O aplicativo do garçom não está habilitado para esta empresa' })
    const existing = await prisma.waiter.findFirst({ where: { id, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Garçom não encontrado' })
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : existing.name
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' })
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : undefined
    const password = typeof req.body?.password === 'string' && req.body.password ? await bcrypt.hash(req.body.password, 10) : undefined
    const waiter = await prisma.waiter.update({ where: { id }, data: { name, username, password, phone: typeof req.body?.phone === 'string' ? req.body.phone.trim() || null : undefined, email: typeof req.body?.email === 'string' ? req.body.email.trim() || null : undefined, active: typeof req.body?.active === 'boolean' ? req.body.active : undefined }, select: waiterSelect })
    return res.json(waiter)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar garçom' })
  }
})

router.delete('/tenant/:tenantId/waiters/:id', authMiddleware, async (req, res) => {
  try {
    const { tenantId } = req.params
    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })
    if (!(await ownsTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado ao tenant' })
    if (!(await waiterAppEnabled(tenantId))) return res.status(403).json({ error: 'O aplicativo do garçom não está habilitado para esta empresa' })
    const result = await prisma.waiter.updateMany({ where: { id, tenantId }, data: { active: false } })
    if (!result.count) return res.status(404).json({ error: 'Garçom não encontrado' })
    return res.status(204).send()
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao desativar garçom' })
  }
})

export default router
