const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const cors = require("cors");
const path = require("path");

require("dotenv").config();

const connectDB = require("./config/db");

// ======================================================
// Routes
// ======================================================

const authRoutes = require("./routes/authRoutes");
const pipelineRoutes = require("./routes/pipelineRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const buildRoutes = require("./routes/buildRoutes");
const aiRoutes = require("./routes/aiRoutes");
const githubRoutes = require("./routes/githubRoutes");
const webhookRoutes =
  require("./routes/webhookRoutes");
// ======================================================
// Services
// ======================================================

const {
  recoverAllStaleBuilds,
} = require("./services/pipelineExecutionService");

const {
  startStaleBuildRecovery,
  stopStaleBuildRecovery,
} = require("./services/staleBuildRecoveryService");

const {
  initializeSocket,
} = require("./services/socketService");

// ======================================================
// App
// ======================================================

const app = express();

// ======================================================
// HTTP Server
// ======================================================
//
// IMPORTANT:
//
// Express and Socket.IO must use the SAME HTTP server.
// Do not use app.listen() later.
//
// ======================================================

const httpServer = http.createServer(app);

// ======================================================
// Socket.IO Server
// ======================================================

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:5173",

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ],

    credentials: true,
  },
});

// Initialize our Socket.IO service
initializeSocket(io);

// ======================================================
// Middleware
// ======================================================

app.use(
  cors({
    origin:
      process.env.FRONTEND_URL ||
      "http://localhost:5173",

    credentials: true,
  })
);
// ======================================================
// GitHub Webhook
//
// IMPORTANT:
// Must be mounted BEFORE express.json().
//
// GitHub HMAC verification requires the exact raw bytes
// received from GitHub.
// ======================================================

app.use(
  "/api/webhook",
  express.raw({
    type: "application/json",
    limit: "2mb",
  }),
  webhookRoutes
);
// ======================================================
// Normal JSON requests
// ======================================================
app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// ======================================================
// Request Logger
// IMPORTANT: Must come BEFORE routes
// ======================================================

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}]`,
    req.method,
    req.originalUrl
  );

  next();
});

// ======================================================
// Static Folders
// ======================================================

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads")
  )
);

app.use(
  "/downloads",
  express.static(
    path.join(__dirname, "downloads")
  )
);

app.use(
  "/temp",
  express.static(
    path.join(__dirname, "temp")
  )
);

// ======================================================
// API Routes
// ======================================================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/pipeline",
  pipelineRoutes
);

app.use(
  "/api/dashboard",
  dashboardRoutes
);

app.use(
  "/api/notification",
  notificationRoutes
);

app.use(
  "/api/build",
  buildRoutes
);

app.use(
  "/api/ai",
  aiRoutes
);

app.use(
  "/api/github",
  githubRoutes
);

// ======================================================
// Home Route
// ======================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,

    message:
      "ReliAI Backend Server is running.",

    project:
      "ReliAI",

    version:
      "1.0.0",

    server:
      "Express + Socket.IO",

    database:
      "MongoDB",

    realtime:
      "Socket.IO",

    endpoints: {
      test:
        "GET /api/test",

      health:
        "GET /api/health",

      auth:
        "/api/auth",

      pipeline:
        "/api/pipeline",

      dashboard:
        "/api/dashboard",

      notification:
        "/api/notification",

      build:
        "/api/build",

      ai:
        "/api/ai",

      github:
        "/api/github",
    },
  });
});

// ======================================================
// Test API
// ======================================================

app.get(
  "/api/test",
  (req, res) => {
    return res.status(200).json({
      success: true,

      message:
        "Backend API is working successfully.",

      project:
        "ReliAI",

      version:
        "1.0.0",

      timestamp:
        new Date(),
    });
  }
);

// ======================================================
// Health Check
// ======================================================

app.get(
  "/api/health",
  (req, res) => {
    const memory =
      process.memoryUsage();

    return res.status(200).json({
      success: true,

      status:
        "Healthy",

      uptime:
        process.uptime(),

      memory: {
        rss:
          memory.rss,

        heapTotal:
          memory.heapTotal,

        heapUsed:
          memory.heapUsed,

        external:
          memory.external,
      },

      nodeVersion:
        process.version,

      platform:
        process.platform,

      environment:
        process.env.NODE_ENV ||
        "development",

      realtime:
        "Socket.IO",

      timestamp:
        new Date(),
    });
  }
);

// ======================================================
// 404 Handler
// MUST come AFTER routes
// ======================================================

app.use((req, res) => {
  console.log(
    "404 ROUTE:",
    req.method,
    req.originalUrl
  );

  return res.status(404).json({
    success: false,

    message:
      "API Route Not Found",

    requestedURL:
      req.originalUrl,
  });
});

// ======================================================
// Global Error Handler
// MUST be last middleware
// ======================================================

app.use(
  (err, req, res, next) => {
    console.error(
      "========================================="
    );

    console.error(
      "GLOBAL ERROR"
    );

    console.error(
      "Method:",
      req.method
    );

    console.error(
      "URL:",
      req.originalUrl
    );

    console.error(err);

    console.error(
      "========================================="
    );

    if (res.headersSent) {
      return next(err);
    }

    return res
      .status(
        err.status ||
        err.statusCode ||
        500
      )
      .json({
        success: false,

        message:
          err.message ||
          "Internal Server Error",
      });
  }
);

// ======================================================
// Server Configuration
// ======================================================

const PORT =
  Number(process.env.PORT) ||
  5000;

let server = null;

// ======================================================
// Start Server
// ======================================================

const startServer =
  async () => {
    try {
      // ==================================================
      // Connect MongoDB
      // ==================================================

      await connectDB();

      console.log(
        "========================================="
      );

      console.log(
        "MongoDB Connected Successfully"
      );

      console.log(
        "========================================="
      );

      // ==================================================
      // Initial Stale Build Recovery
      // ==================================================

      console.log(
        "Checking for stale builds..."
      );

      try {
        const recoveryResult =
          await recoverAllStaleBuilds();

        console.log(
          "Stale build recovery completed."
        );

        if (recoveryResult) {
          console.log(
            "Recovered builds:",
            recoveryResult.recovered ?? 0
          );
        }
      } catch (recoveryError) {
        console.error(
          "STALE BUILD RECOVERY FAILED:"
        );

        console.error(
          recoveryError
        );

        console.log(
          "Server will continue starting."
        );
      }

      // ==================================================
      // Start HTTP + Socket.IO Server
      // ==================================================

      server =
        httpServer.listen(
          PORT,
          () => {
            console.log(
              "========================================="
            );

            console.log(
              "ReliAI Backend Started Successfully"
            );

            console.log(
              "========================================="
            );

            console.log(
              `Server URL  : http://localhost:${PORT}`
            );

            console.log(
              `Environment : ${
                process.env.NODE_ENV ||
                "development"
              }`
            );

            console.log(
              "Realtime    : Socket.IO enabled"
            );

            console.log(
              `Started At  : ${
                new Date().toLocaleString()
              }`
            );

            console.log(
              "========================================="
            );

            // ============================================
            // Start periodic stale build recovery
            // ============================================

            try {
              startStaleBuildRecovery();

              console.log(
                "Stale build recovery service started."
              );
            } catch (error) {
              console.error(
                "Failed to start stale build recovery service:",
                error
              );
            }
          }
        );
    } catch (error) {
      console.error(
        "========================================="
      );

      console.error(
        "SERVER STARTUP FAILED"
      );

      console.error(
        "========================================="
      );

      console.error(error);

      process.exit(1);
    }
  };

// ======================================================
// Graceful Shutdown
// ======================================================

const gracefulShutdown =
  (signal) => {
    console.log(
      `\n${signal} received. Shutting down ReliAI...`
    );

    // --------------------------------------------------
    // Stop stale recovery timer
    // --------------------------------------------------

    try {
      stopStaleBuildRecovery();
    } catch (error) {
      console.error(
        "Failed to stop stale build recovery:",
        error
      );
    }

    // --------------------------------------------------
    // Stop HTTP + Socket.IO server
    // --------------------------------------------------

    if (!server) {
      process.exit(0);
      return;
    }

    server.close(() => {
      console.log(
        "HTTP/Socket.IO server closed."
      );

      process.exit(0);
    });

    // --------------------------------------------------
    // Force shutdown after 10 seconds
    // --------------------------------------------------

    setTimeout(() => {
      console.error(
        "Forced shutdown after timeout."
      );

      process.exit(1);
    }, 10000).unref();
  };

// ======================================================
// Shutdown Signals
// ======================================================

process.on(
  "SIGINT",
  () =>
    gracefulShutdown(
      "SIGINT"
    )
);

process.on(
  "SIGTERM",
  () =>
    gracefulShutdown(
      "SIGTERM"
    )
);

// ======================================================
// Unhandled Promise Rejection
// ======================================================

process.on(
  "unhandledRejection",
  (reason) => {
    console.error(
      "UNHANDLED PROMISE REJECTION:"
    );

    console.error(reason);
  }
);

// ======================================================
// Uncaught Exception
// ======================================================

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "UNCAUGHT EXCEPTION:"
    );

    console.error(error);
  }
);

// ======================================================
// Start Application
// ======================================================

startServer();

// ======================================================
// Exports
// ======================================================

module.exports = app;