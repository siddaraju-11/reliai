import { useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";

function Navbar() {
  const navigate = useNavigate();

  // Get user name from localStorage
  const userName = localStorage.getItem("userName") || "User";

  // Logout Function
  const logout = () => {
    const confirmLogout = window.confirm(
      "Are you sure you want to logout?"
    );

    if (!confirmLogout) return;

    localStorage.removeItem("token");
    localStorage.removeItem("userName");

    navigate("/login");
  };

  return (
    <div
      style={{
        background: "#ffffff",
        padding: "18px 30px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left Section */}
      <div>
        <h2
          style={{
            margin: 0,
            color: "#1e293b",
            fontWeight: "700",
          }}
        >
          ReliAI Dashboard
        </h2>

        <p
          style={{
            margin: "4px 0 0",
            color: "#64748b",
            fontSize: "14px",
          }}
        >
          Smart CI/CD Pipeline Monitoring System
        </p>
      </div>

      {/* Right Section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "25px",
        }}
      >
        {/* Notification Bell */}
        <NotificationBell />

        {/* User Profile */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "#f8fafc",
            padding: "8px 15px",
            borderRadius: "30px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: "#2563eb",
              color: "#fff",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: "18px",
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>

          <div>
            <div
              style={{
                fontWeight: "600",
                color: "#1e293b",
              }}
            >
              {userName}
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              Logged In
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          style={{
            background: "#dc2626",
            color: "#fff",
            border: "none",
            padding: "10px 18px",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            transition: "0.3s",
          }}
          onMouseEnter={(e) =>
            (e.target.style.background = "#b91c1c")
          }
          onMouseLeave={(e) =>
            (e.target.style.background = "#dc2626")
          }
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default Navbar;