// Server do Foody

import express from 'express';

const app = express();

const port = process.env.PORT || 9800;

// rota de teste
app.get('/test', (req, res) => {
  res.send('Backend do Foody está rodando!');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});