import express from "express"
import { PrismaClient } from "@prisma/client"
import multer from "multer"
import { createClient } from "@supabase/supabase-js"
import { v4 as uuidv4 } from "uuid"
import authMiddleware from "../middlewares/auth.js"

const prisma = new PrismaClient()
const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

function extensionFromMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/webp") return "webp"
  return null
}

function normalizeRemoteImageUrl(value) {
  if (typeof value !== "string") return ""
  return value.trim().replace(/^\s*`+/, "").replace(/`+\s*$/, "").trim()
}

async function fetchImageAsFileBuffer(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" })
    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem (${response.status})`)
    }

    const contentType = response.headers.get("content-type") || ""
    const mimeType = contentType.split(";")[0].trim().toLowerCase()
    const ext = extensionFromMimeType(mimeType)
    if (!ext) {
      throw new Error("Formato de imagem não suportado (use jpeg/png/webp)")
    }

    const contentLengthHeader = response.headers.get("content-length")
    if (contentLengthHeader) {
      const size = Number.parseInt(contentLengthHeader, 10)
      if (Number.isFinite(size) && size > 15 * 1024 * 1024) {
        throw new Error("Imagem muito grande (máx 15MB)")
      }
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      throw new Error("Imagem muito grande (máx 15MB)")
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      mimetype: mimeType,
      ext,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function uploadFileToSupabase({ supabase, bucket, path, file, upsert }) {
  const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: Boolean(upsert),
  })

  if (error) {
    throw new Error(error.message || "Falha ao enviar arquivo para o Supabase Storage")
  }

  const publicUrlResult = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = publicUrlResult?.data?.publicUrl
  if (!publicUrl) {
    throw new Error("Falha ao gerar URL pública do arquivo enviado")
  }

  return { publicUrl, path }
}

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

router.put("/tenant/:tenantId/products/:id", authMiddleware, upload.single("image"), async (req, res) => {
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
    if (typeof req.body?.imageUrl === "string") data.imageUrl = normalizeRemoteImageUrl(req.body.imageUrl) || null
    if (typeof req.body?.active === "boolean") data.active = req.body.active
    if (typeof req.body?.categoryId !== "undefined") {
      const categoryId = parseIntOrNull(req.body.categoryId)
      if (!categoryId) return res.status(400).json({ error: "categoryId inválido" })
      data.categoryId = categoryId
    }

    if (!req.file) {
      const remoteImageUrl = normalizeRemoteImageUrl(req.body?.uploadImageFromUrl)
      if (remoteImageUrl) {
        let parsed
        try {
          parsed = new URL(remoteImageUrl)
        } catch {
          return res.status(400).json({ error: "URL inválida" })
        }

        if (parsed.protocol !== "https:") {
          return res.status(400).json({ error: "A URL deve usar https" })
        }

        const hostname = parsed.hostname.toLowerCase()
        if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
          return res.status(400).json({ error: "Host não permitido" })
        }

        const supabase = getSupabaseClient()
        const bucket = process.env.SUPABASE_STORAGE_BUCKET || "tenants"
        if (!supabase) {
          return res.status(500).json({ error: "Supabase não configurado para upload (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" })
        }

        const fetched = await fetchImageAsFileBuffer(remoteImageUrl)
        const path = `${tenantId}/products/${id}/${uuidv4()}.${fetched.ext}`
        const uploaded = await uploadFileToSupabase({
          supabase,
          bucket,
          path,
          file: { buffer: fetched.buffer, mimetype: fetched.mimetype },
          upsert: false,
        })

        data.imageUrl = uploaded.publicUrl
      }
    }

    if (req.file) {
      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ error: "A imagem deve ser um arquivo de imagem" })
      }

      const supabase = getSupabaseClient()
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || "tenants"
      if (!supabase) {
        return res.status(500).json({ error: "Supabase não configurado para upload (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" })
      }

      const ext = extensionFromMimeType(req.file.mimetype) || "bin"
      const path = `${tenantId}/products/${id}/${uuidv4()}.${ext}`
      const uploaded = await uploadFileToSupabase({
        supabase,
        bucket,
        path,
        file: req.file,
        upsert: false,
      })

      data.imageUrl = uploaded.publicUrl
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
