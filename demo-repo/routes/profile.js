const express = require("express");
const multer = require("multer");
const { pool } = require("../db/pool");

const router = express.Router();
const upload = multer({ dest: "uploads/", limits: { fileSize: 2 * 1024 * 1024 } });

router.post("/avatar", upload.single("avatar"), async (req, res) => {
  const { userId } = req.body;
  await pool.query("UPDATE users SET avatar_path = $1 WHERE id = $2", [
    req.file.path,
    userId,
  ]);
  res.json({ ok: true, path: req.file.path });
});

module.exports = router;
