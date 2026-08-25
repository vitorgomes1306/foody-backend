import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout.trim())
      const details = stderr.trim() || stdout.trim()
      reject(new Error(`Comando de impressão finalizou com código ${code}${details ? `: ${details}` : ''}`))
    })
  })
}

const ESC = 0x1b
const GS = 0x1d
const ascii = (value) => Buffer.from(String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x0A\x0D\x20-\x7E]/g, '?'), 'ascii')

function escPosDocument(text, { doubleHeight = config.bodyDoubleHeight } = {}) {
  const rows = String(text).split(/\r?\n/)
  const chunks = [Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x4d, 0x00]), Buffer.from([ESC, 0x61, 0x00])]
  rows.forEach((row, index) => {
    if (index === 0) {
      chunks.push(Buffer.from([ESC, 0x61, 0x01, ESC, 0x45, 0x01, GS, 0x21, 0x11]), ascii(`${row.trim()}\n`), Buffer.from([GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00]))
      return
    }
    if (index === 1) {
      chunks.push(Buffer.from([ESC, 0x61, 0x01, ESC, 0x45, 0x01]), ascii(`${row.trim()}\n`), Buffer.from([ESC, 0x45, 0x00, ESC, 0x61, 0x00]))
      return
    }
    chunks.push(Buffer.from([GS, 0x21, doubleHeight ? 0x01 : 0x00]), ascii(`${row}\n`))
  })
  chunks.push(Buffer.from([GS, 0x21, 0x00, ESC, 0x64, 0x04]))
  if (config.autoCut) chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00]))
  return Buffer.concat(chunks)
}

export async function printText(text, options = {}) {
  if (config.printMode === 'preview') {
    console.log(`\n${'='.repeat(config.paperWidth)}\n${text}\n${'='.repeat(config.paperWidth)}\n`)
    return
  }

  const filePath = path.join(os.tmpdir(), `chefito-${process.pid}-${Date.now()}.txt`)
  await fs.writeFile(filePath, escPosDocument(text, options))
  try {
    if (process.platform === 'win32') {
      const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'windows-raw-print.ps1')
      await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PrinterName', config.printerName, '-FilePath', filePath])
    } else {
      await run('lp', ['-d', config.printerName, '-o', 'raw', filePath])
    }
  } finally {
    await fs.unlink(filePath).catch(() => {})
  }
}
