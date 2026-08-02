# Iniciar o Chefito Print Agent com o Windows

Este guia configura o **Agendador de Tarefas do Windows** para iniciar o Chefito Print Agent automaticamente depois que o usuário fizer login.

> Use o disparador **Ao fazer logon**. A impressora instalada no perfil do usuário pode não estar disponível antes do login.

## 1. Verificar os requisitos

Abra o PowerShell e confirme:

```powershell
node --version
pm2 --version
```

Se o PM2 não estiver instalado:

```powershell
npm install -g pm2
```

## 2. Iniciar e salvar o Print Agent no PM2

No PowerShell:

```powershell
cd C:\Users\user\Documents\chefito\print-agent
pm2 start src\index.js --name chefito-print-agent
pm2 save
pm2 status
```

O processo deve aparecer como `online`.

Se ele já estiver cadastrado, use:

```powershell
pm2 restart chefito-print-agent
pm2 save
```

## 3. Confirmar o caminho do PM2

Execute:

```powershell
(Get-Command pm2).Source
```

Normalmente o resultado é semelhante a:

```text
C:\Users\user\AppData\Roaming\npm\pm2.ps1
```

Confirme também que este arquivo existe:

```text
C:\Users\user\AppData\Roaming\npm\pm2.cmd
```

O Agendador usará o arquivo `pm2.cmd`.

## 4. Abrir o Agendador de Tarefas

1. Pressione `Win + R`.
2. Digite `taskschd.msc`.
3. Pressione Enter.
4. No painel direito, clique em **Criar Tarefa**.

Não use **Criar Tarefa Básica**, pois precisamos configurar atraso e recuperação em caso de falha.

## 5. Aba Geral

Configure:

- **Nome:** `Chefito Print Agent`
- **Descrição:** `Inicia o agente local de impressão automática do Chefito.`
- Selecione **Executar somente quando o usuário estiver conectado**.
- Marque **Executar com privilégios mais altos** se o driver da impressora exigir.
- Em **Configurar para**, selecione a versão atual do Windows.

## 6. Aba Disparadores

1. Clique em **Novo**.
2. Em **Iniciar a tarefa**, selecione **Ao fazer logon**.
3. Selecione **Usuário específico** e escolha o usuário `user`.
4. Marque **Atrasar a tarefa em**.
5. Escolha `30 segundos` ou `1 minuto`.
6. Confirme que **Habilitado** está marcado.
7. Clique em **OK**.

O atraso permite que o Windows termine de carregar a rede e a impressora.

## 7. Aba Ações

1. Clique em **Nova**.
2. Em **Ação**, escolha **Iniciar um programa**.
3. Em **Programa/script**, informe:

```text
C:\Windows\System32\cmd.exe
```

4. Em **Adicionar argumentos**, informe:

```text
/c "C:\Users\user\AppData\Roaming\npm\pm2.cmd resurrect"
```

5. Em **Iniciar em**, informe:

```text
C:\Users\user\Documents\chefito\print-agent
```

6. Clique em **OK**.

Não coloque aspas no campo **Iniciar em**.

## 8. Aba Condições

Para computadores que precisam imprimir durante todo o expediente:

- Desmarque **Iniciar a tarefa somente se o computador estiver usando energia elétrica**, se for notebook.
- Desmarque restrições de inatividade que possam impedir a inicialização.
- Se necessário, marque **Ativar o computador para executar esta tarefa**.

## 9. Aba Configurações

Marque:

- **Permitir que a tarefa seja executada por demanda**.
- **Executar a tarefa assim que possível depois que um início agendado for perdido**.
- **Se a tarefa falhar, reiniciar a cada:** `1 minuto`.
- Defina pelo menos `3` tentativas de reinicialização.

Em **Se a tarefa já estiver sendo executada**, selecione:

```text
Não iniciar uma nova instância
```

Clique em **OK** para salvar a tarefa.

## 10. Testar a tarefa

1. Localize `Chefito Print Agent` na Biblioteca do Agendador.
2. Clique com o botão direito.
3. Selecione **Executar**.
4. Aguarde alguns segundos.
5. Abra o PowerShell e execute:

```powershell
pm2 status
```

O resultado esperado é:

```text
chefito-print-agent | online
```

Visualize os logs:

```powershell
pm2 logs chefito-print-agent
```

Para sair da tela de logs, pressione `Ctrl + C`. Isso não encerra o agente.

## 11. Testar a impressão

No PowerShell:

```powershell
cd C:\Users\user\Documents\chefito\print-agent
npm run test:print
```

Confirme também se `.env` contém:

```text
PRINT_MODE=system
PAPER_WIDTH=48
BODY_DOUBLE_HEIGHT=true
AUTO_CUT=true
```

## 12. Testar depois de reiniciar

1. Reinicie o Windows.
2. Faça login com o usuário `user`.
3. Aguarde de 30 segundos a 1 minuto.
4. Execute:

```powershell
pm2 status
```

O agente deve aparecer como `online` sem precisar executar `npm start` manualmente.

## Solução de problemas

### PM2 não encontrado

Confira:

```powershell
(Get-Command pm2).Source
```

Se o caminho for diferente, ajuste o argumento da tarefa para apontar para o `pm2.cmd` correto.

### Processo não foi restaurado

Execute novamente:

```powershell
cd C:\Users\user\Documents\chefito\print-agent
pm2 start src\index.js --name chefito-print-agent
pm2 save
```

Depois execute novamente a tarefa pelo Agendador.

### Agente online, mas sem imprimir

Verifique:

```powershell
pm2 logs chefito-print-agent
npm run test:print
Get-Printer | Select-Object Name
```

O valor de `PRINTER_NAME` no `.env` precisa ser exatamente igual ao nome retornado pelo Windows.

### Alterou o `.env`

Depois de qualquer alteração:

```powershell
pm2 restart chefito-print-agent
pm2 save
```

### Não usar no Windows

Não execute:

```powershell
pm2 startup
```

Esse comando procura sistemas de inicialização como `systemd` e não funciona no Windows.
