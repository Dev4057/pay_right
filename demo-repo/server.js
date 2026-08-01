require("dotenv").config();
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { pool } = require("./db/pool");
const profileRoutes = require("./routes/profile");
const messageRoutes = require("./routes/messages");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/api/profile", profileRoutes);
app.use("/api/messages", messageRoutes);

io.on("connection", (socket) => {
  socket.on("join-room", async (roomId) => {
    socket.join(roomId);
    const { rows } = await pool.query(
      "SELECT sender, body, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 50",
      [roomId]
    );
    socket.emit("history", rows.reverse());
  });

  socket.on("message", async ({ roomId, sender, body }) => {
    await pool.query(
      "INSERT INTO messages (room_id, sender, body) VALUES ($1, $2, $3)",
      [roomId, sender, body]
    );
    io.to(roomId).emit("message", { sender, body, created_at: new Date() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`quicktalk listening on :${PORT}`));
