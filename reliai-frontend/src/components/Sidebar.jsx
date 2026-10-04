import { NavLink, useNavigate } from "react-router-dom";
import {
  FaHome,
  FaCodeBranch,
  FaRobot,
  FaChartBar,
  FaDatabase,
  FaCog,
  FaSignOutAlt,
  FaHistory,
  FaFileAlt,
} from "react-icons/fa";

function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userName");

    navigate("/");
  };

  const menuStyle = ({ isActive }) => ({
    display: "flex",
    alignItems: "center",
    gap: "12px",
    color: "white",
    textDecoration: "none",
    padding: "12px 15px",
    borderRadius: "8px",
    background: isActive ? "#2563eb" : "transparent",
    transition: "0.3s",
    fontWeight: isActive ? "bold" : "normal",
  });

  return (
    <div
      style={{
        width: "250px",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Logo */}
      <div>
        <h2
          style={{
            textAlign: "center",
            color: "#38bdf8",
            marginBottom: "35px",
          }}
        >
          🚀 ReliAI
        </h2>

        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <NavLink to="/dashboard" style={menuStyle}>
            <FaHome />
            Dashboard
          </NavLink>

          <NavLink to="/pipelines" style={menuStyle}>
            <FaCodeBranch />
            Pipelines
          </NavLink>

          <NavLink to="/build-history" style={menuStyle}>
            <FaHistory />
            Build History
          </NavLink>

          {/* Pipeline logs belong to a specific build.
              Go to Build History first to select a build. */}
          <NavLink to="/build-history" style={menuStyle}>
            <FaFileAlt />
            Pipeline Logs
          </NavLink>

          <NavLink to="/analytics" style={menuStyle}>
            <FaChartBar />
            Analytics
          </NavLink>

          <NavLink to="/knowledge-base" style={menuStyle}>
            <FaDatabase />
            Knowledge Base
          </NavLink>

          <NavLink to="/ai-diagnosis" style={menuStyle}>
            <FaRobot />
            AI Diagnosis
          </NavLink>

          <NavLink to="/settings" style={menuStyle}>
            <FaCog />
            Settings
          </NavLink>
        </nav>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          background: "#dc2626",
          color: "white",
          border: "none",
          padding: "12px",
          borderRadius: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          fontSize: "16px",
        }}
      >
        <FaSignOutAlt />
        Logout
      </button>
    </div>
  );
}

export default Sidebar;