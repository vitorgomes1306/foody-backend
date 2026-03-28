import express from 'express';

const app = express();

import registerRoutes from './routes/register.js';

app.use(express.json());
app.use('/api', registerRoutes);

const port = process.env.PORT || 3000;

app.get('/test', (req, res) => {
  res.send('Backend do Foody está rodando!');
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port}`);
});