const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// Conexão com o DATABASE PROXY (Porta 5432)
// Repare que a API não sabe que existem 3 shards atrás do Proxy!
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgrespassword",
  database: "ecommerce",
});

// Rota para receber as compras do e-commerce
app.post("/orders", async (req, res) => {
  const { userId, productId, amount } = req.body;

  if (!userId || !productId || !amount) {
    return res.status(400).json({ error: "Campos obrigatórios ausentes" });
  }

  try {
    // Executa a query SQL comum. O Proxy intercepta a chave user_id,
    // calcula o Hash e roteia para o Shard certo nos bastidores.
    const queryText =
      "INSERT INTO orders (user_id, product_id, amount) VALUES ($1, $2, $3) RETURNING *";
    const values = [userId, productId, amount];

    const result = await pool.query(queryText, values);

    return res.status(201).json({
      message: "Pedido realizado com sucesso!",
      order: result.rows[0],
    });
  } catch (error) {
    console.error("Erro ao inserir pedido:", error);
    return res.status(500).json({ error: "Erro interno no banco de dados" });
  }
});

// Inicia a API na porta 3000
app.listen(3000, () => {
  console.log("🚀 API do E-commerce rodando em http://localhost:3000");
});
