import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import API from "../services/api";

function EditPipeline() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [formData, setFormData] =
    useState({
      name: "",
      description: "",
      repository: "",
      branch: "",
      buildCommand: "",
      testCommand: "",
    });

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  // ====================================================
  // LOAD PIPELINE
  // ====================================================

  useEffect(() => {
    fetchPipeline();
  }, [id]);

  const fetchPipeline = async () => {
    try {
      setLoading(true);

      const res =
        await API.get(
          `/pipeline/${id}`
        );

      const pipeline =
        res.data.pipeline;

      setFormData({
        name:
          pipeline.name || "",

        description:
          pipeline.description || "",

        repository:
          pipeline.repository || "",

        branch:
          pipeline.branch || "main",

        buildCommand:
          pipeline.buildCommand ||
          "npm run build",

        testCommand:
          pipeline.testCommand ||
          "npm test",
      });
    } catch (error) {
      console.error(
        "LOAD PIPELINE ERROR:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to load pipeline"
      );
    } finally {
      setLoading(false);
    }
  };

  // ====================================================
  // HANDLE INPUT CHANGE
  // ====================================================

  const handleChange = (e) => {
    const {
      name,
      value,
    } = e.target;

    setFormData(
      (previousData) => ({
        ...previousData,
        [name]: value,
      })
    );
  };

  // ====================================================
  // UPDATE PIPELINE
  // ====================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (saving) {
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name:
          formData.name.trim(),

        description:
          formData.description.trim(),

        repository:
          formData.repository.trim(),

        branch:
          formData.branch.trim() ||
          "main",

        buildCommand:
          formData.buildCommand.trim(),

        testCommand:
          formData.testCommand.trim(),
      };

      const res =
        await API.put(
          `/pipeline/${id}`,
          payload
        );

      alert(
        res.data.message ||
          "Pipeline updated successfully."
      );

      navigate("/pipelines");
    } catch (error) {
      console.error(
        "UPDATE PIPELINE ERROR:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to update pipeline"
      );
    } finally {
      setSaving(false);
    }
  };

  // ====================================================
  // LOADING
  // ====================================================

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          background: "#f4f7fc",
        }}
      >
        <Sidebar />

        <div
          style={{
            flex: 1,
          }}
        >
          <Navbar />

          <div
            style={{
              padding: "30px",
            }}
          >
            <h2>
              Loading pipeline...
            </h2>
          </div>
        </div>
      </div>
    );
  }

  // ====================================================
  // PAGE
  // ====================================================

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f4f7fc",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
        }}
      >
        <Navbar />

        <div
          style={{
            padding: "30px",
          }}
        >
          <h1>
            Edit Pipeline
          </h1>

          <form
            onSubmit={
              handleSubmit
            }
            style={{
              background:
                "white",

              padding:
                "25px",

              borderRadius:
                "10px",

              maxWidth:
                "700px",

              marginTop:
                "20px",
            }}
          >
            {/* ========================================= */}
            {/* PIPELINE NAME */}
            {/* ========================================= */}

            <label>
              Pipeline Name
            </label>

            <input
              type="text"
              name="name"
              value={
                formData.name
              }
              onChange={
                handleChange
              }
              required
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginBottom:
                  "20px",

                boxSizing:
                  "border-box",
              }}
            />

            {/* ========================================= */}
            {/* DESCRIPTION */}
            {/* ========================================= */}

            <label>
              Description
            </label>

            <textarea
              name="description"
              value={
                formData.description
              }
              onChange={
                handleChange
              }
              rows="4"
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginBottom:
                  "20px",

                boxSizing:
                  "border-box",

                resize:
                  "vertical",
              }}
            />

            {/* ========================================= */}
            {/* REPOSITORY */}
            {/* ========================================= */}

            <label>
              Repository
            </label>

            <input
              type="text"
              name="repository"
              value={
                formData.repository
              }
              onChange={
                handleChange
              }
              required
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginBottom:
                  "20px",

                boxSizing:
                  "border-box",
              }}
            />

            {/* ========================================= */}
            {/* BRANCH */}
            {/* ========================================= */}

            <label>
              Branch
            </label>

            <input
              type="text"
              name="branch"
              value={
                formData.branch
              }
              onChange={
                handleChange
              }
              placeholder="main"
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginBottom:
                  "20px",

                boxSizing:
                  "border-box",
              }}
            />

            {/* ========================================= */}
            {/* BUILD COMMAND */}
            {/* ========================================= */}

            <label>
              Build Command
            </label>

            <input
              type="text"
              name="buildCommand"
              value={
                formData.buildCommand
              }
              onChange={
                handleChange
              }
              placeholder="npm run build"
              autoComplete="off"
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginBottom:
                  "7px",

                boxSizing:
                  "border-box",

                fontFamily:
                  "monospace",
              }}
            />

            <div
              style={{
                color:
                  "#6b7280",

                fontSize:
                  "13px",

                marginBottom:
                  "20px",
              }}
            >
              Example: npm run build
            </div>

            {/* ========================================= */}
            {/* TEST COMMAND */}
            {/* ========================================= */}

            <label>
              Test Command
            </label>

            <input
              type="text"
              name="testCommand"
              value={
                formData.testCommand
              }
              onChange={
                handleChange
              }
              placeholder="npm test"
              autoComplete="off"
              style={{
                width:
                  "100%",

                padding:
                  "12px",

                marginBottom:
                  "7px",

                boxSizing:
                  "border-box",

                fontFamily:
                  "monospace",
              }}
            />

            <div
              style={{
                color:
                  "#6b7280",

                fontSize:
                  "13px",

                marginBottom:
                  "25px",
              }}
            >
              Example: npm test
            </div>

            {/* ========================================= */}
            {/* UPDATE BUTTON */}
            {/* ========================================= */}

            <button
              type="submit"
              disabled={
                saving
              }
              style={{
                background:
                  saving
                    ? "#94a3b8"
                    : "#2563eb",

                color:
                  "white",

                border:
                  "none",

                padding:
                  "14px 25px",

                borderRadius:
                  "8px",

                cursor:
                  saving
                    ? "not-allowed"
                    : "pointer",

                fontWeight:
                  "600",
              }}
            >
              {saving
                ? "Updating..."
                : "Update Pipeline"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EditPipeline;