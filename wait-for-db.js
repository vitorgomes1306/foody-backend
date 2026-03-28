import pkg from 'pg';
const { Client } = pkg;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  while (true) {
    try {
      await client.connect();
      await client.end();
      console.log("✅ Banco pronto!");
      break;
    } catch (err) {
      console.log("⏳ Aguardando banco...");
      await sleep(3000);
    }
  }
}

await waitForDb();