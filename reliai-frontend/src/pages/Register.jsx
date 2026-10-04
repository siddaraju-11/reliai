import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import API from "../services/api";

function Register() {
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    role: "Developer",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    try {
      const response = await API.post("/auth/register", {
        name: formData.fullName,
        email: formData.email,
        password: formData.password,
      });

      alert(response.data.message);

      navigate("/login");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Registration Failed"
      );
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(135deg,#0f172a,#1e3a8a,#312e81)",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          width: "430px",
          background: "rgba(255,255,255,0.08)",
          padding: "35px",
          borderRadius: "20px",
          backdropFilter: "blur(10px)",
          boxShadow: "0 0 20px rgba(0,0,0,0.4)",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            color: "white",
            marginBottom: "10px",
          }}
        >
          Create Account
        </h1>

        <p
          style={{
            textAlign: "center",
            color: "#cbd5e1",
            marginBottom: "30px",
          }}
        >
          Register to access ReliAI
        </p>

        <form onSubmit={handleSubmit}>
          {/* Full Name */}

          <label style={{ color: "white" }}>
            Full Name
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "white",
              padding: "10px",
              borderRadius: "8px",
              marginTop: "5px",
              marginBottom: "20px",
            }}
          >
            <FaUser color="gray" />

            <input
              type="text"
              name="fullName"
              placeholder="Enter Full Name"
              value={formData.fullName}
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

          {/* Email */}

          <label style={{ color: "white" }}>
            Email
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "white",
              padding: "10px",
              borderRadius: "8px",
              marginTop: "5px",
              marginBottom: "20px",
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

          {/* Role */}

          <label style={{ color: "white" }}>
            Role
          </label>

          <select
            name="role"
            value={formData.role}
            onChange={handleChange}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              marginTop: "5px",
              marginBottom: "20px",
              border: "none",
            }}
          >
            <option>Developer</option>
            <option>Admin</option>
            <option>Project Manager</option>
          </select>

          {/* Password */}

          <label style={{ color: "white" }}>
            Password
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "white",
              padding: "10px",
              borderRadius: "8px",
              marginTop: "5px",
              marginBottom: "20px",
            }}
          >
            <FaLock color="gray" />

            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
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
              style={{ cursor: "pointer" }}
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

          {/* Confirm Password */}

          <label style={{ color: "white" }}>
            Confirm Password
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "white",
              padding: "10px",
              borderRadius: "8px",
              marginTop: "5px",
              marginBottom: "25px",
            }}
          >
            <FaLock color="gray" />

            <input
              type={showConfirm ? "text" : "password"}
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
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
              style={{ cursor: "pointer" }}
              onClick={() =>
                setShowConfirm(!showConfirm)
              }
            >
              {showConfirm ? (
                <FaEyeSlash />
              ) : (
                <FaEye />
              )}
            </span>
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "15px",
              background: "#06b6d4",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "18px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Create Account
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            color: "white",
            marginTop: "25px",
          }}
        >
          Already have an account?{" "}
          <Link
            to="/login"
            style={{
              color: "#38bdf8",
              textDecoration: "none",
            }}
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;