import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { stdin as input, stdout as output } from 'node:process'

const rl = readline.createInterface({ input, output })
const ask = async (label, fallback = '') => {
  const answer = (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim()
  return answer || fallback
}

try {
  const values = {
    API_URL: await ask('URL do backend', 'https://foody-backend-production-9f47.up.railway.app'),
    TENANT_ID: await ask('ID da empresa (tenant)'),
    EMAIL: await ask('E-mail do administrador'),
    PASSWORD: await ask('Senha do administrador'),
    PRINTER_NAME: await ask('Nome exato da impressora'),
    PRINT_MODE: await ask('Modo de impressão (preview/system)', 'preview'),
    POLL_INTERVAL_MS: await ask('Intervalo em milissegundos', '5000'),
    PRINT_EXISTING_ON_FIRST_RUN: 'false',
    PAPER_WIDTH: await ask('Largura em caracteres', '48'),
    BODY_DOUBLE_HEIGHT: await ask('Aumentar altura da letra do corpo (true/false)', 'true'),
    AUTO_CUT: await ask('Usar corte automático (true/false)', 'true'),
  }
  const content = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, '')}`).join('\n') + '\n'
  await fs.writeFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'), content)
  console.log('Configuração salva em .env. Use npm start para iniciar.')
} finally {
  rl.close()
}
