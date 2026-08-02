import express from "express"
import { PrismaClient } from "@prisma/client"
import multer from "multer"
import { v4 as uuidv4 } from "uuid"
import authMiddleware from "../middlewares/auth.js"
import { removeLocalUploads, saveLocalUpload } from "../utils/localUploads.js"

const prisma = new PrismaClient()

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

function isMissingMediaLibraryModel() {
  return !prisma || typeof prisma.mediaLibraryImage === "undefined"
}

function isMissingMediaLibraryTable(err) {
  if (!err || typeof err !== "object") return false
  const code = "code" in err ? err.code : null
  const msg = "message" in err && typeof err.message === "string" ? err.message : ""
  if (code === "P2021" && msg.includes("MediaLibraryImage")) return true
  if (msg.toLowerCase().includes("medialibraryimage") && msg.toLowerCase().includes("does not exist")) return true
  return false
}

function isMissingMediaLibraryColumn(err, columnName) {
  if (!err || typeof err !== "object") return false
  const code = "code" in err ? err.code : null
  const metaColumn =
    "meta" in err && err.meta && typeof err.meta === "object" && "column" in err.meta && typeof err.meta.column === "string"
      ? err.meta.column
      : ""
  const msg = "message" in err && typeof err.message === "string" ? err.message : ""
  const needle = String(columnName || "").trim()
  if (!needle) return false
  if (code === "P2022" && (metaColumn === `MediaLibraryImage.${needle}` || metaColumn.includes(needle) || msg.includes(needle))) return true
  if (msg.includes(needle) && msg.toLowerCase().includes("does not exist")) return true
  return false
}

function isPrismaValidationError(err) {
  return Boolean(err && typeof err === "object" && "name" in err && err.name === "PrismaClientValidationError")
}

function parseKeywords(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 50)
  if (typeof value !== "string") return []
  const raw = value.trim()
  if (!raw) return []
  return raw
    .split(/[,\n]/g)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50)
}

function extFromMimeType(mime) {
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime === "image/svg+xml") return "svg"
  return ""
}

async function uploadLocally({ buffer, mimeType }) {
  const ext = extFromMimeType(mimeType) || "bin"
  const key = `library/images/${uuidv4()}.${ext}`
  const saved = await saveLocalUpload({ relativePath: key, buffer })
  return { url: saved.publicUrl, path: saved.path }
}

router.get("/media-library/images", authMiddleware, async (req, res) => {
  try {
    if (isMissingMediaLibraryModel()) {
      return res.json([])
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
    const category = typeof req.query.category === "string" ? req.query.category.trim() : ""
    const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : ""
    const where = {}
    if (category) where.category = { equals: category, mode: "insensitive" }
    if (q || keyword) {
      const tokens = parseKeywords(q || keyword)
      where.OR = [
        ...(q
          ? [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ]
          : []),
        ...(tokens.length ? [{ keywords: { hasSome: tokens } }] : []),
      ]
    }
    let images
    try {
      images = await prisma.mediaLibraryImage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          url: true,
          title: true,
          description: true,
          category: true,
          keywords: true,
          mimeType: true,
          sizeBytes: true,
          bucket: true,
          path: true,
          uploadedById: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    } catch (err) {
      if (
        isPrismaValidationError(err) ||
        isMissingMediaLibraryColumn(err, "description") ||
        isMissingMediaLibraryColumn(err, "category") ||
        isMissingMediaLibraryColumn(err, "keywords")
      ) {
        images = await prisma.mediaLibraryImage.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            url: true,
            title: true,
            mimeType: true,
            sizeBytes: true,
            bucket: true,
            path: true,
            uploadedById: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        images = images.map((it) => ({ ...it, description: null, category: null, keywords: [] }))
      } else {
        throw err
      }
    }
    res.json(images)
  } catch (err) {
    if (isMissingMediaLibraryTable(err)) return res.json([])
    res.status(500).json({ error: "Erro ao listar imagens" })
  }
})

router.post("/media-library/images", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (isMissingMediaLibraryModel()) {
      return res.status(503).json({ error: "Prisma Client desatualizado. Rode: npm run build (prisma generate) e aplique as migrations." })
    }
    const file = req.file
    if (!file) return res.status(400).json({ error: "Arquivo obrigatório" })
    if (!file.mimetype || !String(file.mimetype).startsWith("image/")) return res.status(400).json({ error: "Arquivo deve ser uma imagem" })
    const bucket = "local"
    const { url, path } = await uploadLocally({ buffer: file.buffer, mimeType: file.mimetype })
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : ""
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : ""
    const category = typeof req.body?.category === "string" ? req.body.category.trim() : ""
    const keywords = parseKeywords(req.body?.keywords)
    let created
    try {
      created = await prisma.mediaLibraryImage.create({
        data: {
          id: uuidv4(),
          url,
          path,
          bucket,
          mimeType: file.mimetype,
          sizeBytes: typeof file.size === "number" ? file.size : null,
          title: title || null,
          description: description || null,
          category: category || null,
          keywords,
          uploadedById: typeof req.userId === "number" ? req.userId : null,
        },
      })
    } catch (err) {
      if (
        isPrismaValidationError(err) ||
        isMissingMediaLibraryColumn(err, "description") ||
        isMissingMediaLibraryColumn(err, "category") ||
        isMissingMediaLibraryColumn(err, "keywords")
      ) {
        created = await prisma.mediaLibraryImage.create({
          data: {
            id: uuidv4(),
            url,
            path,
            bucket,
            mimeType: file.mimetype,
            sizeBytes: typeof file.size === "number" ? file.size : null,
            title: title || null,
            uploadedById: typeof req.userId === "number" ? req.userId : null,
          },
        })
        created = { ...created, description: null, category: null, keywords: [] }
      } else {
        throw err
      }
    }
    res.status(201).json(created)
  } catch (err) {
    if (isMissingMediaLibraryTable(err)) {
      return res.status(500).json({ error: "Banco sem migration do MediaLibraryImage. Aplique as migrations antes de usar o banco de imagens." })
    }
    if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
      const msg = err.message
      if (msg.includes("gen_random_uuid") || msg.includes("uuid_generate_v4")) {
        return res.status(500).json({ error: "Banco sem extensão de UUID (Postgres). Habilite pgcrypto/uuid-ossp ou aplique migrations corretamente." })
      }
    }
    res.status(500).json({ error: "Erro ao enviar imagem" })
  }
})

router.patch("/media-library/images/:id", authMiddleware, async (req, res) => {
  try {
    if (isMissingMediaLibraryModel()) {
      return res.status(503).json({ error: "Prisma Client desatualizado. Rode: npm run build (prisma generate) e aplique as migrations." })
    }
    const { id } = req.params
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : null
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : null
    const category = typeof req.body?.category === "string" ? req.body.category.trim() : null
    const keywords = typeof req.body?.keywords !== "undefined" ? parseKeywords(req.body.keywords) : null
    const data = {}
    if (typeof req.body?.title !== "undefined") data.title = title || null
    if (typeof req.body?.description !== "undefined") data.description = description || null
    if (typeof req.body?.category !== "undefined") data.category = category || null
    if (keywords !== null) data.keywords = keywords
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" })
    const updated = await prisma.mediaLibraryImage.update({
      where: { id },
      data,
    })
    res.json(updated)
  } catch (err) {
    if (isMissingMediaLibraryTable(err)) {
      return res.status(500).json({ error: "Banco sem migration do MediaLibraryImage. Aplique as migrations antes de usar o banco de imagens." })
    }
    res.status(500).json({ error: "Erro ao atualizar imagem" })
  }
})

router.delete("/media-library/images/:id", authMiddleware, async (req, res) => {
  try {
    if (isMissingMediaLibraryModel()) {
      return res.status(503).json({ error: "Prisma Client desatualizado. Rode: npm run build (prisma generate) e aplique as migrations." })
    }
    const { id } = req.params
    const img = await prisma.mediaLibraryImage.findUnique({ where: { id } })
    if (!img) return res.status(404).json({ error: "Imagem não encontrada" })
    if (img.bucket === "local") await removeLocalUploads([img.path])
    await prisma.mediaLibraryImage.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    if (isMissingMediaLibraryTable(err)) {
      return res.status(500).json({ error: "Banco sem migration do MediaLibraryImage. Aplique as migrations antes de usar o banco de imagens." })
    }
    res.status(500).json({ error: "Erro ao remover imagem" })
  }
})

export default router
