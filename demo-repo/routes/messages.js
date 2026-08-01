const express = require("express");
const { pool } = require("../db/pool");

const router = express.Router();

router.get("/:roomId", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT sender, body, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 100",
    [req.params.roomId]
  );
  res.json(rows);
});

router.get("/search/:roomId", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT sender, body, created_at FROM messages WHERE room_id = $1 AND body ILIKE $2 ORDER BY created_at DESC LIMIT 50",
    [req.params.roomId, `%${req.query.q}%`]
  );
  res.json(rows);
});

module.exports = router;
