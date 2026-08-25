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

## Múltiplas impressoras (balcão, cozinha, bar, churrasqueira...)

Um único agente pode imprimir em várias impressoras conectadas ao mesmo computador, roteando por categoria do produto.

1. No painel, em **Operação > Impressoras**, cadastre as estações (ex.: Cozinha, Bar, Churrasqueira) e atribua cada categoria do cardápio à estação correspondente. Categorias sem estação continuam saindo na impressora padrão.
2. No `.env` do agente, `PRINTER_NAME` continua sendo a impressora padrão (usada para categorias sem estação, além da conta para conferência e do recibo de pagamento, que não são roteados por estação). Registre as demais impressoras em `STATION_PRINTERS`, usando a mesma chave cadastrada no painel:

```text
PRINTER_NAME=EPSON_TM20_Balcao
STATION_PRINTERS=cozinha:TM88_Cozinha,bar:Impressora_Bar,churrasqueira:Impressora_Churrasqueira
```

Rode `npm run printers` para ver o nome exato de cada impressora instalada. Se uma comanda tiver itens de mais de uma estação, o agente imprime um ticket separado em cada impressora, cada um só com os itens daquela estação.

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

O cabeçalho usa tamanho duplo. `BODY_DOUBLE_HEIGHT` controla apenas o corpo da comanda de produção (cozinha); a conta para conferência e o recibo de pagamento sempre imprimem o corpo em altura normal, para economizar papel. O corte automático é solicitado ao final.

## Regras

- Pedido original: imprime uma vez ao entrar em produção.
- Complemento: imprime apenas os novos itens quando entram em produção.
- Itens de categorias com estação cadastrada saem na impressora daquela estação (`STATION_PRINTERS`); os demais saem na `PRINTER_NAME`.
- Produtos marcados como “Produto pronto” não são impressos.
- Contas solicitadas em `/{slug}/mesa` são impressas com itens, valores e total, sem fechar o pedido.
- Conta para conferência e recibo de pagamento imprimem sempre em altura normal (não seguem `BODY_DOUBLE_HEIGHT`), para gastar menos papel.
- Na primeira execução, pedidos que já estavam em produção são apenas sincronizados. Para imprimi-los, use `PRINT_EXISTING_ON_FIRST_RUN=true` antes da primeira inicialização.
- O arquivo `.env` contém credenciais e não deve ser compartilhado ou versionado.
