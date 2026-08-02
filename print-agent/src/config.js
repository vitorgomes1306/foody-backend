import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (typeof process.env[key] === 'undefined') process.env[key] = value
  }
}

const number = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  root,
  statePath: path.join(root, '.print-state.json'),
  apiUrl: String(process.env.API_URL || '').replace(/\/+$/, ''),
  tenantId: String(process.env.TENANT_ID || '').trim(),
  email: String(process.env.EMAIL || '').trim(),
  password: String(process.env.PASSWORD || ''),
  printerName: String(process.env.PRINTER_NAME || '').trim(),
  printMode: String(process.env.PRINT_MODE || 'preview').toLowerCase(),
  pollIntervalMs: Math.max(2000, number(process.env.POLL_INTERVAL_MS, 5000)),
  printExistingOnFirstRun: String(process.env.PRINT_EXISTING_ON_FIRST_RUN || '').toLowerCase() === 'true',
  paperWidth: Math.min(64, Math.max(32, number(process.env.PAPER_WIDTH, 42))),
  bodyDoubleHeight: String(process.env.BODY_DOUBLE_HEIGHT ?? 'true').toLowerCase() === 'true',
  autoCut: String(process.env.AUTO_CUT ?? 'true').toLowerCase() === 'true',
}

export function validateConfig() {
  const missing = ['apiUrl', 'tenantId', 'email', 'password'].filter((key) => !config[key])
  if (config.printMode === 'system' && !config.printerName) missing.push('printerName')
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(', ')}. Execute npm run setup.`)
  if (!['preview', 'system'].includes(config.printMode)) throw new Error('PRINT_MODE deve ser preview ou system')
}
