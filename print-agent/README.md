# Chefito Print Agent

Agente local que imprime automaticamente pedidos quando entram em produção. Ele também imprime novos complementos e contas solicitadas pelos garçons, mantendo `.print-state.json` para não duplicar impressões.

## Requisitos

- Node.js 18 ou superior.
- Impressora instalada no Windows, macOS ou Linux.
- Computador ligado e conectado à internet.
- Usuário administrador ativo no Chefito.

## Instalação

```bash
cd print-agent
npm run printers
npm run setup
npm start
```

Comece com `PRINT_MODE=preview`. Nesse modo, a comanda aparece no terminal sem consumir papel. Depois do teste, altere `.env` para:

```text
PRINT_MODE=system
```

Teste a impressora:

```bash
npm run test:print
```

## Execução automática

Pode ser mantido em segundo plano com PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name chefito-print-agent
pm2 save
pm2 startup
```

No Windows, execute como o mesmo usuário que possui acesso à impressora instalada. No macOS/Linux, a impressão usa `lp`; no Windows, envia ESC/POS diretamente ao spooler em modo RAW.

## Tomate MDK-082 no Windows

Este modelo usa bobina de 80 mm. Configure:

```text
PAPER_WIDTH=48
BODY_DOUBLE_HEIGHT=true
AUTO_CUT=true
PRINT_MODE=system
```

O cabeçalho usa tamanho duplo, o corpo ocupa 48 colunas com altura ampliada e o corte automático é solicitado ao final.

## Regras

- Pedido original: imprime uma vez ao entrar em produção.
- Complemento: imprime apenas os novos itens quando entram em produção.
- Produtos marcados como “Produto pronto” não são impressos.
- Contas solicitadas em `/{slug}/mesa` são impressas com itens, valores e total, sem fechar o pedido.
- Na primeira execução, pedidos que já estavam em produção são apenas sincronizados. Para imprimi-los, use `PRINT_EXISTING_ON_FIRST_RUN=true` antes da primeira inicialização.
- O arquivo `.env` contém credenciais e não deve ser compartilhado ou versionado.
