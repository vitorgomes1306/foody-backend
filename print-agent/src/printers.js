import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let error = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { error += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || `${command} finalizou com código ${code}`)))
  })
}

export async function listPrinters() {
  if (process.platform === 'win32') {
    return run('powershell.exe', ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'])
  }
  return run('lpstat', ['-p'])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  listPrinters().then((output) => console.log(output || 'Nenhuma impressora encontrada.')).catch((error) => {
    console.error(`Não foi possível listar impressoras: ${error.message}`)
    process.exitCode = 1
  })
}
