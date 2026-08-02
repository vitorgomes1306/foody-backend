import fs from 'node:fs/promises'
import { config } from './config.js'

export async function loadState() {
  try {
    const value = JSON.parse(await fs.readFile(config.statePath, 'utf8'))
    return { initialized: true, printed: new Set(Array.isArray(value.printed) ? value.printed : []) }
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`Estado local inválido; um novo será criado: ${error.message}`)
    return { initialized: false, printed: new Set() }
  }
}

export async function saveState(state) {
  const printed = [...state.printed].slice(-10000)
  await fs.writeFile(config.statePath, JSON.stringify({ printed, updatedAt: new Date().toISOString() }, null, 2))
  state.initialized = true
}
