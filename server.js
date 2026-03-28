import express from 'express';
import serverless from 'serverless-http';

const app = express();

app.use(express.json());

app.get('/test', (req, res) => {
  res.send('Backend do Foody está rodando!');
});

export const handler = serverless(app);