const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { PORT } = require('./config');
const { registerHandlers } = require('./handlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));

io.on('connection', (socket) => {
  registerHandlers(io, socket);
});

server.listen(PORT, () => console.log(`Pig card game running at http://localhost:${PORT}`));
