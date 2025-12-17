const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Вказуємо Replit, що наші файли (сайт) лежать у папці public
app.use(express.static("public"));

app.get("/", (req, res) => {
  // ВАЖЛИВА ЗМІНА: тепер ми шукаємо файл у папці public
  res.sendFile(__dirname + "/public/index.html");
});

io.on("connection", (socket) => {
  // Pisala.oleg
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  // Golos.oleg
  socket.on("join-voice", (roomId, peerId) => {
    socket.join(roomId);
    socket.to(roomId).emit("user-connected", { socketId: socket.id, peerId: peerId });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", peerId);
    });
  });

  // Ban.oleg
  socket.on("admin-mute-user", (targetSocketId) => {
    io.to(targetSocketId).emit("you-are-muted");
  });
});

// Zapusk.oleg
const listener = server.listen(process.env.PORT || 3000, () => {
  console.log("Oleg is listening on port " + listener.address().port);
});
