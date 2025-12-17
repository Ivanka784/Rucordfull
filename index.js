const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- ВАЖЛИВО: СТВОРЮЄМО ПАПКИ ЯКЩО ЇХ НЕМАЄ ---
const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(publicDir, 'uploads');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

let usersDB = {}; 
let voiceUsers = {}; 

// 1. Спочатку пробуємо знайти файли в папці public
app.use(express.static(publicDir));

// 2. ЯКЩО НЕ ЗНАЙШЛО -> ПРИМУСОВО ВІДДАЄМО INDEX.HTML
app.get("/", (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send("<h1>Помилка!</h1><p>Файл <b>index.html</b> не знайдено в папці <b>public</b>.</p>");
    }
});

app.post('/register', upload.single('avatar'), (req, res) => {
    const { username, password } = req.body;
    if (usersDB[username]) return res.json({ success: false, msg: "Юзер існує" });
    const avatarPath = req.file ? `/uploads/${req.file.filename}` : 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
    usersDB[username] = { password, avatar: avatarPath };
    res.json({ success: true, msg: "OK" });
});

io.on("connection", (socket) => {
  socket.emit("voice-list-update", voiceUsers);

  socket.on("login", (data) => {
      const user = usersDB[data.username];
      if (!user || user.password !== data.password) {
          socket.emit("auth-fail", "Помилка входу");
      } else {
          socket.username = data.username;
          socket.avatar = user.avatar;
          socket.emit("auth-success", { username: data.username, avatar: user.avatar });
      }
  });

  socket.on("chat message", (msg) => {
    io.emit("chat message", { ...msg, avatar: socket.avatar });
  });

  socket.on("join-voice", (roomId, peerId) => {
    socket.join(roomId);
    voiceUsers[socket.id] = { 
        name: socket.username || "Гість", 
        avatar: socket.avatar || "https://cdn-icons-png.flaticon.com/512/847/847969.png", 
        peerId: peerId, 
        socketId: socket.id 
    };
    socket.to(roomId).emit("user-connected", { peerId: peerId });
    io.emit("voice-list-update", voiceUsers);

    const handleLeave = () => {
        socket.to(roomId).emit("user-disconnected", peerId);
        if (voiceUsers[socket.id]) {
            delete voiceUsers[socket.id];
            io.emit("voice-list-update", voiceUsers);
        }
    };
    socket.on("disconnect", handleLeave);
    socket.on("leave-voice", handleLeave);
  });
  
  socket.on("disconnect", () => {
      if (voiceUsers[socket.id]) {
          delete voiceUsers[socket.id];
          io.emit("voice-list-update", voiceUsers);
      }
  });
  socket.on("admin-mute-user", (id) => io.to(id).emit("you-are-muted"));
});

server.listen(3000, () => {
  console.log("Server is running!");
});
