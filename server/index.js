const express = require("express");
const { Server } = require("socket.io");
const { createServer } = require("http");
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

async function main() {
  const port = process.env.PORT || 3000;
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    transports: ["websocket", "polling"],
    cors: {
      origin: "http://localhost",
      methods: ["GET", "POST"],
    },
    allowEIO3: true,
  });

  // Middleware
  app.use(cors());
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ status: "ok" });
  });

  let users = new Set();

  io.on("connection", (socket) => {
    logger.info(`New connection: ${socket.id}`);
    users.add(socket.id);
    io.emit("clients-total", users.size);

    socket.on("disconnect", () => {
      logger.info(`Disconnected: ${socket.id}`);
      users.delete(socket.id);
      io.emit("clients-total", users.size);
    });

    socket.on("chat", (msg, chatId) => {
      logger.info(`Chat message received: ${msg}, chatId: ${chatId}`);
      io.emit(chatId, msg);
    });

    socket.on("typing", (clientId) => {
      logger.info(`Client typing: ${clientId}`);
      io.emit("typing", clientId);
    });

    socket.on("stop typing", (clientId) => {
      logger.info(`Client stopped typing: ${clientId}`);
      io.emit("stop typing", clientId);
    });
  });

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
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception:", err);
  });
}

main().catch((err) => {
  logger.error("Error in main function:", err);
});
