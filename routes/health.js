import express from 'express'
import { PrismaClient } from '@prisma/client'

const router = express.Router()
const prisma = new PrismaClient()

router.get(['/test/database', '/api/test/database'], async (_req, res) => {
  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.status(200).json({
      ok: true,
      database: 'connected',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Falha no teste de conexão com o banco:', error)
    return res.status(503).json({
      ok: false,
      database: 'disconnected',
      error: 'Não foi possível consultar o banco de dados',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
