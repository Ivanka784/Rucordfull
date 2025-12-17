const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- СТВОРЕННЯ ПАПОК І ФАЙЛІВ ---
const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(publicDir, 'uploads');
const USERS_FILE = './users.json';

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Створюємо файл бази даних, якщо його немає
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

// --- НАЛАШТУВАННЯ ЗАВАНТАЖЕННЯ ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

app.use(express.static(publicDir));

// --- ФУНКЦІЇ ДЛЯ РОБОТИ З ФАЙЛОМ ЮЗЕРІВ ---
function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE);
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveUser(username, userData) {
    const users = getUsers();
    users[username] = userData;
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// --- МАРШРУТИ ---

// Головна сторінка
app.get("/", (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.send("Створіть файл index.html у папці public!");
});

// Реєстрація
app.post('/register', upload.single('avatar'), (req, res) => {
    const { username, password } = req.body;
    
    // Очищаємо пробіли
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    const users = getUsers();
    if (users[cleanUser]) {
        return res.json({ success: false, msg: "Користувач вже існує!" });
    }

    const avatarPath = req.file ? `/uploads/${req.file.filename}` : 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
    
    saveUser(cleanUser, { password: cleanPass, avatar: avatarPath });
    console.log(`[REGISTER] Новий юзер: ${cleanUser}`);
    
    res.json({ success: true, msg: "Успішно! Тепер увійдіть." });
});

let voiceUsers = {}; 

io.on("connection", (socket) => {
  socket.emit("voice-list-update", voiceUsers);

  // --- ЛОГІКА ВХОДУ (LOGIN) ---
  socket.on("login", (data) => {
      const cleanUser = data.username.trim();
      const cleanPass = data.password.trim();

      console.log(`[LOGIN TRY] Спроба входу: ${cleanUser}`);

      const users = getUsers(); // Читаємо з файлу
      const user = users[cleanUser];

      if (!user) {
          console.log(`[LOGIN FAIL] Юзера ${cleanUser} не знайдено.`);
          socket.emit("auth-fail", "Такого користувача не існує.");
      } else if (user.password !== cleanPass) {
          console.log(`[LOGIN FAIL] Невірний пароль для ${cleanUser}.`);
          socket.emit("auth-fail", "Невірний пароль.");
      } else {
          console.log(`[LOGIN SUCCESS] ${cleanUser} увійшов!`);
          socket.username = cleanUser;
          socket.avatar = user.avatar;
          socket.emit("auth-success", { username: cleanUser, avatar: user.avatar });
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
  console.log("Server is running on port 3000");
});
