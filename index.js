const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files in /public
app.use(express.static("public"));

// Track each user's main bubble by their socket.id
const userMainBubbles = {};

// All bubbles in memory: bubbleName -> { x, y, name }
const bubbles = {};

// All edges: array of { sourceName, targetName }
const edges = [];

/************************************************************
 * Helper Functions
 ************************************************************/
function createOrUpdateBubble(name, x, y) {
  if (!bubbles[name]) {
    // Use provided coordinates if available; otherwise, use random ones
    const randX = x !== undefined ? x : Math.floor(Math.random() * 400) + 50;
    const randY = y !== undefined ? y : Math.floor(Math.random() * 300) + 50;
    bubbles[name] = {
      name,
      x: randX,
      y: randY,
    };
  } else {
    if (x !== undefined) bubbles[name].x = x;
    if (y !== undefined) bubbles[name].y = y;
  }
  io.emit("BUBBLE_UPDATED", bubbles[name]);
}

function connectBubbles(nameA, nameB) {
  const exists = edges.find(
    (e) =>
      (e.sourceName === nameA && e.targetName === nameB) ||
      (e.sourceName === nameB && e.targetName === nameA)
  );
  if (!exists) {
    edges.push({ sourceName: nameA, targetName: nameB });
    io.emit("EDGE_ADDED", { sourceName: nameA, targetName: nameB });
  }
}

function isConnected(nameA, nameB) {
  return edges.some(
    (e) =>
      (e.sourceName === nameA && e.targetName === nameB) ||
      (e.sourceName === nameB && e.targetName === nameA)
  );
}

/************************************************************
 * Socket.IO Logic
 ************************************************************/
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.emit("INIT_DATA", { bubbles, edges });

  // User sets their main bubble once: data = { mainName, x, y }
  socket.on("SET_MAIN_BUBBLE", (data) => {
    const { mainName, x, y } = data;
    userMainBubbles[socket.id] = mainName;
    createOrUpdateBubble(mainName, x, y);
  });

  // User adds friends (up to 10): data = { friends: ["Bob", "Charlie"] }
  socket.on("ADD_FRIENDS", (data) => {
    const { friends } = data;
    const mainName = userMainBubbles[socket.id];
    if (!mainName) {
      console.log("No main bubble set for this user; ignoring ADD_FRIENDS");
      return;
    }
    const friendList = friends.slice(0, 10);
    friendList.forEach((friendName) => {
      createOrUpdateBubble(friendName);
      connectBubbles(mainName, friendName);
      for (let otherSocketId in userMainBubbles) {
        if (otherSocketId === socket.id) continue;
        const otherMain = userMainBubbles[otherSocketId];
        if (isConnected(otherMain, friendName)) {
          connectBubbles(mainName, otherMain);
        }
      }
    });
  });

  // Optional: Real-time position updates
  socket.on("UPDATE_POSITION", (data) => {
    const { name, x, y } = data;
    if (bubbles[name]) {
      bubbles[name].x = x;
      bubbles[name].y = y;
      io.emit("BUBBLE_UPDATED", bubbles[name]);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    delete userMainBubbles[socket.id];
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Soap server running at http://localhost:${PORT}`);
});
