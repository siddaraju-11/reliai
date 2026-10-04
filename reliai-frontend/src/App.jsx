import { useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import {
  connectSocket,
  disconnectSocket,
} from "./services/socket";

// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import Pipelines from "./pages/Pipelines";
import CreatePipeline from "./pages/CreatePipeline";
import EditPipeline from "./pages/EditPipeline";
import BuildHistory from "./pages/BuildHistory";
import PipelineLogs from "./pages/PipelineLogs";
import Analytics from "./pages/Analytics";
import KnowledgeBase from "./pages/KnowledgeBase";

function App() {
  // ======================================================
  // AUTHENTICATED SOCKET.IO CONNECTION
  // ======================================================

  useEffect(() => {
    /*
     * connectSocket() checks localStorage for the JWT.
     *
     * If the user is already logged in:
     *   -> Socket.IO connects with the JWT.
     *
     * If the user is not logged in:
     *   -> No socket connection is created.
     */
    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <Routes>
      {/* ========================= */}
      {/* Landing Page */}
      {/* ========================= */}

      <Route
        path="/"
        element={<Landing />}
      />

      {/* ========================= */}
      {/* Authentication */}
      {/* ========================= */}

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      <Route
        path="/forgot-password"
        element={<ForgotPassword />}
      />

      {/* ========================= */}
      {/* Dashboard */}
      {/* ========================= */}

      <Route
        path="/dashboard"
        element={<Dashboard />}
      />

      {/* ========================= */}
      {/* Pipelines */}
      {/* ========================= */}

      <Route
        path="/pipelines"
        element={<Pipelines />}
      />

      <Route
        path="/create-pipeline"
        element={<CreatePipeline />}
      />

      <Route
        path="/edit-pipeline/:id"
        element={<EditPipeline />}
      />

      {/* ========================= */}
      {/* Build History */}
      {/* ========================= */}

      <Route
        path="/build-history"
        element={<BuildHistory />}
      />

      {/* ========================= */}
      {/* Pipeline Logs */}
      {/* ========================= */}

      <Route
        path="/pipeline-logs/:id"
        element={<PipelineLogs />}
      />

      {/* ========================= */}
      {/* Analytics */}
      {/* ========================= */}

      <Route
        path="/analytics"
        element={<Analytics />}
      />

      {/* ========================= */}
      {/* Knowledge Base */}
      {/* ========================= */}

      <Route
        path="/knowledge-base"
        element={<KnowledgeBase />}
      />

      {/* ========================= */}
      {/* 404 */}
      {/* ========================= */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;