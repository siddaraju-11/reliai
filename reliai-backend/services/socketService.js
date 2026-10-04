const jwt = require("jsonwebtoken");
const User = require("../models/User");

let io = null;

// ======================================================
// NORMALIZE TOKEN
// ======================================================

function normalizeToken(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  const token = value.trim();

  if (
    token.toLowerCase().startsWith("bearer ")
  ) {
    return token.slice(7).trim();
  }

  return token;
}

// ======================================================
// INITIALIZE SOCKET.IO
// ======================================================

function initializeSocket(socketServer) {
  io = socketServer;

  console.log(
    "[SOCKET] Socket.IO service initialized."
  );

  // ====================================================
  // SOCKET AUTHENTICATION
  // ====================================================

  io.use(async (socket, next) => {
    try {
      const token = normalizeToken(
        socket.handshake.auth?.token
      );

      if (!token) {
        return next(
          new Error(
            "Socket authentication required."
          )
        );
      }

      if (!process.env.JWT_SECRET) {
        console.error(
          "[SOCKET AUTH] JWT_SECRET is missing."
        );

        return next(
          new Error(
            "Socket authentication unavailable."
          )
        );
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      if (!decoded?.id) {
        return next(
          new Error(
            "Invalid authentication token."
          )
        );
      }

      const user = await User.findById(
        decoded.id
      ).select("_id isActive");

      if (!user) {
        return next(
          new Error(
            "Authenticated user not found."
          )
        );
      }

      if (user.isActive === false) {
        return next(
          new Error(
            "User account is inactive."
          )
        );
      }

      // IMPORTANT:
      // User ID comes from verified JWT.
      // Never trust a client supplied user ID.

      socket.userId =
        user._id.toString();

      next();
    } catch (error) {
      console.error(
        "[SOCKET AUTH] Authentication failed:",
        error.message
      );

      return next(
        new Error(
          "Socket authentication failed."
        )
      );
    }
  });

  // ====================================================
  // CONNECTION
  // ====================================================

  io.on("connection", (socket) => {
    const userId =
      socket.userId;

    const userRoom =
      `user:${userId}`;

    // Automatically join authenticated user room.
    socket.join(userRoom);

    console.log(
      "[SOCKET] Authenticated client connected:",
      socket.id
    );

    console.log(
      `[SOCKET] ${socket.id} joined ${userRoom}`
    );

    // ==================================================
    // CLIENT READY
    // ==================================================

    socket.emit("socket:ready", {
      connected: true,
      userId,
      socketId: socket.id,
      timestamp:
        new Date().toISOString(),
    });

    // ==================================================
    // PING / PONG TEST
    // ==================================================

    socket.on(
      "socket:ping",
      (payload = {}) => {
        socket.emit("socket:pong", {
          ...payload,

          timestamp:
            new Date().toISOString(),
        });
      }
    );

    // ==================================================
    // DISCONNECT
    // ==================================================

    socket.on(
      "disconnect",
      (reason) => {
        console.log(
          "[SOCKET] Client disconnected:",
          socket.id,
          reason
        );
      }
    );
  });

  return io;
}

// ======================================================
// GET SOCKET SERVER
// ======================================================

function getIO() {
  return io;
}

// ======================================================
// IS INITIALIZED
// ======================================================

function isSocketReady() {
  return Boolean(io);
}

// ======================================================
// SAFE EMIT
// ======================================================

function safeEmit(
  room,
  event,
  payload
) {
  if (!io) {
    return false;
  }

  if (
    !event ||
    typeof event !== "string"
  ) {
    return false;
  }

  try {
    if (room) {
      io.to(room).emit(
        event,
        payload
      );
    } else {
      io.emit(
        event,
        payload
      );
    }

    return true;
  } catch (error) {
    console.error(
      "[SOCKET] Emit failed:",
      error.message
    );

    return false;
  }
}

// ======================================================
// EMIT TO AUTHENTICATED USER
// ======================================================

function emitToUser(
  userId,
  event,
  payload
) {
  if (!userId) {
    return false;
  }

  return safeEmit(
    `user:${String(userId)}`,
    event,
    payload
  );
}

// ======================================================
// PIPELINE ROOM EMIT
// ======================================================
//
// Kept for backend compatibility.
//
// IMPORTANT:
// The frontend is NOT allowed to arbitrarily
// join pipeline rooms anymore.
//
// For the current ReliAI architecture,
// user rooms are the secure default.
// ======================================================

function emitToPipeline(
  pipelineId,
  event,
  payload
) {
  if (!pipelineId) {
    return false;
  }

  return safeEmit(
    `pipeline:${String(pipelineId)}`,
    event,
    payload
  );
}

// ======================================================
// BUILD ROOM EMIT
// ======================================================
//
// Kept for backend compatibility.
//
// The frontend does not directly join arbitrary
// build rooms. Build events will primarily be
// delivered through authenticated user rooms.
// ======================================================

function emitToBuild(
  buildId,
  event,
  payload
) {
  if (!buildId) {
    return false;
  }

  return safeEmit(
    `build:${String(buildId)}`,
    event,
    payload
  );
}

// ======================================================
// BUILD EVENT PAYLOAD
// ======================================================

function createBuildEventPayload({
  buildId,
  pipelineId,
  buildNumber,
  status,
  stage,
  message,
  error,
  duration,
  logs,
  extra = {},
}) {
  return {
    buildId:
      buildId
        ? String(buildId)
        : null,

    pipelineId:
      pipelineId
        ? String(pipelineId)
        : null,

    buildNumber:
      buildNumber ?? null,

    status:
      status || null,

    stage:
      stage || null,

    message:
      message || null,

    error:
      error || null,

    duration:
      duration ?? null,

    logs:
      logs || null,

    timestamp:
      new Date().toISOString(),

    ...extra,
  };
}

// ======================================================
// EMIT BUILD EVENT TO USER
// ======================================================

function emitBuildEvent({
  userId,
  event,
  buildId,
  pipelineId,
  buildNumber,
  status,
  stage,
  message,
  error,
  duration,
  logs,
  extra,
}) {
  if (!userId || !event) {
    return false;
  }

  const payload =
    createBuildEventPayload({
      buildId,
      pipelineId,
      buildNumber,
      status,
      stage,
      message,
      error,
      duration,
      logs,
      extra,
    });

  return emitToUser(
    userId,
    event,
    payload
  );
}

// ======================================================
// LIVE LOG EVENT
// ======================================================

function emitBuildLog({
  userId,
  buildId,
  pipelineId,
  buildNumber,
  stage,
  logChunk,
}) {
  if (
    !userId ||
    !buildId ||
    logChunk === null ||
    logChunk === undefined
  ) {
    return false;
  }

  const chunk =
    typeof logChunk === "string"
      ? logChunk
      : String(logChunk);

  if (!chunk) {
    return false;
  }

  return emitToUser(
    userId,
    "build:log",
    {
      buildId:
        String(buildId),

      pipelineId:
        pipelineId
          ? String(pipelineId)
          : null,

      buildNumber:
        buildNumber ?? null,

      stage:
        stage || null,

      chunk,

      timestamp:
        new Date().toISOString(),
    }
  );
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  initializeSocket,

  getIO,

  isSocketReady,

  safeEmit,

  emitToUser,

  emitToPipeline,

  emitToBuild,

  createBuildEventPayload,

  emitBuildEvent,

  emitBuildLog,
};