import { config, validateConfig } from './config.js'
import { printText } from './printer.js'

validateConfig()
await printText([
  'CHEFITO - TESTE DE IMPRESSAO',
  '='.repeat(config.paperWidth),
  'Impressora configurada com sucesso.',
  `Data: ${new Date().toLocaleString('pt-BR')}`,
  '', '', '',
].join('\n'))
console.log('Teste enviado com sucesso.')
