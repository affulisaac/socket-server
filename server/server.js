const express = require("express");
const { Server } = require("socket.io");
const { createServer } = require("http");
const { availableParallelism } = require("os");
const cluster = require("cluster");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const winston = require("winston");
const cors = require("cors");

// Initialize logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
  ],
});

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({ PORT: 3000 + i });
  }
  setupPrimary();
  return;
}

async function main() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
    transports: ["websocket", "polling"],
    cors: {
      origin: "*", // Adjust this for production
      methods: ["GET", "POST"],
    },
    adapter: createAdapter(),
  });

  // Middleware
  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ status: "ok" });
  });

  let users = new Set();

  io.on("connection", (socket) => {
    users.add(socket.id);
    io.emit("clients-total", users.size);

    socket.on("disconnect", () => {
      users.delete(socket.id);
      io.emit("clients-total", users.size);
    });

    socket.on("chat", (msg, chatId) => {
      io.emit(chatId, msg);
    });

    socket.on("typing", (clientId) => {
      io.emit("typing", clientId);
    });

    socket.on("stop typing", (clientId) => {
      io.emit("stop typing", clientId);
    });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    logger.info(`Server listening on port: ${port}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    logger.info("SIGTERM signal received: closing HTTP server");
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Application specific logging, throwing an error, or other logic here
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception:", err);
    // Application specific logging, throwing an error, or other logic here
  });
}

main().catch((err) => {
  logger.error("Error in main function:", err);
});
