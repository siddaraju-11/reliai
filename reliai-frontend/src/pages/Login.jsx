import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import API from "../services/api";

function Login() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    remember: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await API.post("/auth/login", {
        email: formData.email,
        password: formData.password,
      });

      console.log("Login Response:", response.data);

      // Save JWT Token
      localStorage.setItem("token", response.data.token);

      // Save Complete User Object
      localStorage.setItem(
        "user",
        JSON.stringify(response.data.user)
      );

      // Save User Name for Navbar
      localStorage.setItem(
        "userName",
        response.data.user.name
      );

      alert(response.data.message || "Login Successful");

      navigate("/dashboard");
    } catch (error) {
      console.error("Login Error:", error);

      alert(
        error.response?.data?.message ||
          "Login Failed"
      );
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg,#0f172a,#1e3a8a,#312e81)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          width: "400px",
          background: "rgba(255,255,255,0.08)",
          padding: "35px",
          borderRadius: "20px",
          backdropFilter: "blur(12px)",
          boxShadow: "0 0 25px rgba(0,0,0,0.4)",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            color: "white",
            marginBottom: "10px",
          }}
        >
          Welcome Back
        </h1>

        <p
          style={{
            textAlign: "center",
            color: "#cbd5e1",
            marginBottom: "30px",
          }}
        >
          Login to ReliAI
        </p>

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "white" }}>Email</label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "white",
                borderRadius: "8px",
                padding: "10px",
                marginTop: "5px",
              }}
            >
              <FaEnvelope color="gray" />

              <input
                type="email"
                name="email"
                placeholder="Enter Email"
                value={formData.email}
                onChange={handleChange}
                required
                style={{
                  border: "none",
                  outline: "none",
                  marginLeft: "10px",
                  width: "100%",
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "white" }}>Password</label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "white",
                borderRadius: "8px",
                padding: "10px",
                marginTop: "5px",
              }}
            >
              <FaLock color="gray" />

              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter Password"
                value={formData.password}
                onChange={handleChange}
                required
                style={{
                  border: "none",
                  outline: "none",
                  marginLeft: "10px",
                  width: "100%",
                }}
              />

              <span
                style={{
                  cursor: "pointer",
                }}
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword ? (
                  <FaEyeSlash />
                ) : (
                  <FaEye />
                )}
              </span>
            </div>
          </div>

          {/* Remember Me */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "25px",
            }}
          >
            <label style={{ color: "white" }}>
              <input
                type="checkbox"
                name="remember"
                checked={formData.remember}
                onChange={handleChange}
              />{" "}
              Remember Me
            </label>

            <Link
              to="/forgot-password"
              style={{
                color: "#38bdf8",
                textDecoration: "none",
              }}
            >
              Forgot Password?
            </Link>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              background: "#06b6d4",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "18px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Login
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            color: "white",
            marginTop: "25px",
          }}
        >
          Don't have an account?{" "}
          <Link
            to="/register"
            style={{
              color: "#38bdf8",
              textDecoration: "none",
            }}
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;