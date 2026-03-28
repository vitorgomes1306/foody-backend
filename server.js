import express from 'express';

const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;

app.get('/test', (req, res) => {
  res.send('Backend do Foody está rodando!');
});

// importar rotas
import register from './routes/register.js';

app.use('/register', register);

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port}`);
});