import { Link } from "react-router-dom";
import {
  FaRobot,
  FaCloud,
  FaShieldAlt,
  FaChartLine,
} from "react-icons/fa";

function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0f172a,#1e3a8a,#312e81)",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 60px",
        }}
      >
        <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "#38bdf8" }}>
          ReliAI
        </h1>

        <div style={{ display: "flex", gap: "20px" }}>
          <Link
            to="/login"
            style={{
              textDecoration: "none",
              color: "white",
              padding: "10px 20px",
              border: "1px solid white",
              borderRadius: "8px",
            }}
          >
            Login
          </Link>

          <Link
            to="/register"
            style={{
              textDecoration: "none",
              background: "#38bdf8",
              color: "black",
              padding: "10px 20px",
              borderRadius: "8px",
              fontWeight: "bold",
            }}
          >
            Register
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div
        style={{
          textAlign: "center",
          marginTop: "70px",
          padding: "20px",
        }}
      >
        <h1
          style={{
            fontSize: "55px",
            marginBottom: "20px",
          }}
        >
          AI Driven CI/CD Reliability Platform
        </h1>

        <p
          style={{
            fontSize: "22px",
            maxWidth: "850px",
            margin: "auto",
            color: "#d1d5db",
          }}
        >
          Monitor your CI/CD pipelines, detect failures instantly,
          diagnose root causes using Artificial Intelligence,
          and recover automatically.
        </p>

        <div style={{ marginTop: "40px" }}>
          <Link
            to="/register"
            style={{
              textDecoration: "none",
              background: "#06b6d4",
              color: "white",
              padding: "15px 35px",
              fontSize: "20px",
              borderRadius: "10px",
              fontWeight: "bold",
            }}
          >
            Get Started
          </Link>
        </div>
      </div>

      {/* Feature Cards */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
          gap: "30px",
          padding: "70px",
        }}
      >
        <div
          style={{
            background: "#1e293b",
            padding: "30px",
            borderRadius: "15px",
            textAlign: "center",
          }}
        >
          <FaRobot size={50} color="#38bdf8" />
          <h2>AI Diagnosis</h2>
          <p>
            Identify the root cause of build and deployment failures
            using Artificial Intelligence.
          </p>
        </div>

        <div
          style={{
            background: "#1e293b",
            padding: "30px",
            borderRadius: "15px",
            textAlign: "center",
          }}
        >
          <FaCloud size={50} color="#38bdf8" />
          <h2>Cloud Monitoring</h2>
          <p>
            Track builds, deployments and resource usage in real time.
          </p>
        </div>

        <div
          style={{
            background: "#1e293b",
            padding: "30px",
            borderRadius: "15px",
            textAlign: "center",
          }}
        >
          <FaShieldAlt size={50} color="#38bdf8" />
          <h2>Self Healing</h2>
          <p>
            Automatically retry safe failures and reduce manual effort.
          </p>
        </div>

        <div
          style={{
            background: "#1e293b",
            padding: "30px",
            borderRadius: "15px",
            textAlign: "center",
          }}
        >
          <FaChartLine size={50} color="#38bdf8" />
          <h2>Analytics</h2>
          <p>
            View pipeline statistics, success rate,
            MTTR and reliability score.
          </p>
        </div>
      </div>

      {/* Footer */}

      <footer
        style={{
          textAlign: "center",
          padding: "30px",
          color: "#94a3b8",
        }}
      >
        © 2026 ReliAI | AI Driven CI/CD Reliability Platform
      </footer>
    </div>
  );
}

export default Landing;