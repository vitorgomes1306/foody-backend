// Server do Foody

import express from 'express';

const app = express();

const port = process.env.PORT || 9800;

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});