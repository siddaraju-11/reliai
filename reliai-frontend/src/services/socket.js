import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  "http://localhost:5000";

// ======================================================
// CREATE SOCKET
// ======================================================

const socket = io(
  SOCKET_URL,
  {
    autoConnect: false,

    transports: [
      "websocket",
      "polling",
    ],
  }
);

// ======================================================
// CONNECT SOCKET
// ======================================================

export function connectSocket() {
  const token =
    localStorage.getItem("token");

  if (!token) {
    console.warn(
      "[SOCKET] No authentication token found."
    );

    return false;
  }

  // Always use the newest token.
  socket.auth = {
    token,
  };

  if (!socket.connected) {
    socket.connect();
  }

  return true;
}

// ======================================================
// DISCONNECT SOCKET
// ======================================================

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

// ======================================================
// CONNECTION EVENTS
// ======================================================

socket.on("connect", () => {
  console.log(
    "[SOCKET] Connected:",
    socket.id
  );
});

socket.on(
  "socket:ready",
  (data) => {
    console.log(
      "[SOCKET] Ready:",
      data
    );
  }
);

socket.on(
  "disconnect",
  (reason) => {
    console.log(
      "[SOCKET] Disconnected:",
      reason
    );
  }
);

socket.on(
  "connect_error",
  (error) => {
    console.error(
      "[SOCKET] Connection error:",
      error.message
    );
  }
);

export default socket;