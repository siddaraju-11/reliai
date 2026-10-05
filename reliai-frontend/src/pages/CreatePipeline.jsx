import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import API from "../services/api";

function CreatePipeline() {
  const navigate = useNavigate();

  // =====================================================
  // FORM STATE
  // =====================================================

  const [formData, setFormData] = useState({
    name: "",
    description: "",

    // LOCAL or GITHUB
    sourceType: "LOCAL",

    repository: "",
    branch: "main",

    // Only used for LOCAL pipelines
    projectPath: "",

    // Optional directory inside a GitHub repository.
    // Example:
    // test-project
    // apps/backend
    projectDirectory: "",

    buildCommand: "",
    testCommand: "",
  });

  const [loading, setLoading] = useState(false);

  // =====================================================
  // INPUT CHANGE
  // =====================================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // =====================================================
  // SOURCE TYPE CHANGE
  // =====================================================

  const handleSourceTypeChange = (sourceType) => {
    setFormData((previous) => ({
      ...previous,

      sourceType,

      // GitHub pipelines must never use a
      // user-controlled local filesystem path.
      projectPath:
        sourceType === "GITHUB"
          ? ""
          : previous.projectPath,

      // Local pipelines do not use a repository
      // subdirectory.
      projectDirectory:
        sourceType === "LOCAL"
          ? ""
          : previous.projectDirectory,
    }));
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    // -----------------------------------------------------
    // PIPELINE NAME
    // -----------------------------------------------------

    if (!formData.name.trim()) {
      alert("Pipeline name is required.");
      return;
    }

    // -----------------------------------------------------
    // REPOSITORY
    // -----------------------------------------------------

    if (!formData.repository.trim()) {
      alert(
        formData.sourceType === "GITHUB"
          ? "GitHub repository URL is required."
          : "Repository / project name is required."
      );

      return;
    }

    // -----------------------------------------------------
    // LOCAL PROJECT PATH
    // -----------------------------------------------------

    if (
      formData.sourceType === "LOCAL" &&
      !formData.projectPath.trim()
    ) {
      alert(
        "Project path is required for a local pipeline."
      );

      return;
    }

    // -----------------------------------------------------
    // GITHUB VALIDATION
    // -----------------------------------------------------

    if (formData.sourceType === "GITHUB") {
      const repository =
        formData.repository.trim();

      const githubRepositoryRegex =
        /^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/i;

      if (
        !githubRepositoryRegex.test(
          repository
        )
      ) {
        alert(
          "Enter a valid public GitHub repository URL."
        );

        return;
      }

      // -----------------------------------------------
      // PROJECT DIRECTORY BASIC CLIENT VALIDATION
      // -----------------------------------------------
      //
      // Backend performs the real security validation.
      // This only catches obvious mistakes early.
      // -----------------------------------------------

      const projectDirectory =
        formData.projectDirectory.trim();

      if (projectDirectory) {
        const normalizedDirectory =
          projectDirectory.replace(
            /\\/g,
            "/"
          );

        if (
          normalizedDirectory.startsWith("/") ||
          normalizedDirectory.startsWith("//") ||
          /^[A-Za-z]:\//.test(
            normalizedDirectory
          )
        ) {
          alert(
            "Project Directory must be relative to the GitHub repository."
          );

          return;
        }

        const segments =
          normalizedDirectory
            .split("/")
            .filter(Boolean);

        if (
          segments.some(
            (segment) =>
              segment === "." ||
              segment === ".."
          )
        ) {
          alert(
            "Project Directory cannot contain '.' or '..' path segments."
          );

          return;
        }
      }
    }

    // -----------------------------------------------------
    // CREATE PIPELINE
    // -----------------------------------------------------

    setLoading(true);

    try {
      // =================================================
      // COMMON PAYLOAD
      // =================================================

      const payload = {
        name:
          formData.name.trim(),

        description:
          formData.description.trim(),

        sourceType:
          formData.sourceType,

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

      // =================================================
      // LOCAL ONLY
      // =================================================

      if (
        formData.sourceType ===
        "LOCAL"
      ) {
        payload.projectPath =
          formData.projectPath.trim();
      }

      // =================================================
      // GITHUB ONLY
      // =================================================

      if (
        formData.sourceType ===
        "GITHUB"
      ) {
        payload.projectDirectory =
          formData.projectDirectory.trim();
      }

      console.log(
        "[CREATE PIPELINE] Payload:",
        payload
      );

      // =================================================
      // API REQUEST
      // =================================================

      const response =
        await API.post(
          "/pipeline/create",
          payload
        );

      alert(
        response.data.message ||
          "Pipeline created successfully."
      );

      navigate("/pipelines");
    } catch (error) {
      console.error(
        "[CREATE PIPELINE ERROR]",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to create pipeline"
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // STYLES
  // =====================================================

  const inputStyle = {
    width: "100%",
    padding: "12px",
    marginTop: "7px",
    marginBottom: "20px",
    boxSizing: "border-box",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "15px",
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    color: "#475569",
    fontSize: "16px",
    fontWeight: "500",
  };

  const helperStyle = {
    marginTop: "-12px",
    marginBottom: "20px",
    color: "#64748b",
    fontSize: "13px",
    lineHeight: "1.5",
  };

  const sourceButtonStyle = (active) => ({
    flex: 1,

    padding: "14px 16px",

    border: active
      ? "2px solid #2563eb"
      : "1px solid #cbd5e1",

    borderRadius: "8px",

    background: active
      ? "#eff6ff"
      : "white",

    color: active
      ? "#1d4ed8"
      : "#475569",

    cursor: "pointer",

    fontWeight: "600",

    fontSize: "15px",
  });

  // =====================================================
  // UI
  // =====================================================

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
          <h1
            style={{
              color: "#1e293b",
              marginBottom: "20px",
            }}
          >
            Create Pipeline
          </h1>

          <form
            onSubmit={handleSubmit}
            style={{
              background: "white",

              padding: "30px",

              borderRadius: "10px",

              maxWidth: "700px",

              boxShadow:
                "0 5px 15px rgba(0,0,0,0.1)",
            }}
          >
            {/* ===================================== */}
            {/* PIPELINE NAME                         */}
            {/* ===================================== */}

            <label style={labelStyle}>
              Pipeline Name
            </label>

            <input
              type="text"
              name="name"
              placeholder="ReliAI Backend"
              value={formData.name}
              onChange={handleChange}
              required
              style={inputStyle}
            />

            {/* ===================================== */}
            {/* DESCRIPTION                           */}
            {/* ===================================== */}

            <label style={labelStyle}>
              Description
            </label>

            <textarea
              name="description"
              placeholder="Backend deployment pipeline"
              value={formData.description}
              onChange={handleChange}
              rows="4"
              style={{
                ...inputStyle,
                resize: "vertical",
              }}
            />

            {/* ===================================== */}
            {/* SOURCE TYPE                           */}
            {/* ===================================== */}

            <label
              style={{
                ...labelStyle,
                marginBottom: "10px",
              }}
            >
              Source Type
            </label>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom: "25px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  handleSourceTypeChange(
                    "LOCAL"
                  )
                }
                style={sourceButtonStyle(
                  formData.sourceType ===
                    "LOCAL"
                )}
              >
                Local Project
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSourceTypeChange(
                    "GITHUB"
                  )
                }
                style={sourceButtonStyle(
                  formData.sourceType ===
                    "GITHUB"
                )}
              >
                GitHub Repository
              </button>
            </div>

            {/* ===================================== */}
            {/* REPOSITORY                            */}
            {/* ===================================== */}

            <label style={labelStyle}>
              {formData.sourceType ===
              "GITHUB"
                ? "GitHub Repository URL"
                : "Repository / Project Name"}
            </label>

            <input
              type="text"
              name="repository"
              placeholder={
                formData.sourceType ===
                "GITHUB"
                  ? "https://github.com/username/project"
                  : "ReliAI Backend"
              }
              value={formData.repository}
              onChange={handleChange}
              required
              style={inputStyle}
            />

            {/* ===================================== */}
            {/* LOCAL PROJECT PATH                    */}
            {/* ===================================== */}

            {formData.sourceType ===
              "LOCAL" && (
              <>
                <label style={labelStyle}>
                  Project Path
                </label>

                <input
                  type="text"
                  name="projectPath"
                  placeholder={"C:\\Users\\SIDDU\\project"}
                  value={
                    formData.projectPath
                  }
                  onChange={handleChange}
                  required
                  style={inputStyle}
                />

                <div style={helperStyle}>
                  Absolute path to the
                  project on the machine
                  running the ReliAI
                  backend.
                </div>
              </>
            )}

            {/* ===================================== */}
            {/* GITHUB PROJECT DIRECTORY              */}
            {/* ===================================== */}

            {formData.sourceType ===
              "GITHUB" && (
              <>
                <label style={labelStyle}>
                  Project Directory
                  (optional)
                </label>

                <input
                  type="text"
                  name="projectDirectory"
                  placeholder="test-project"
                  value={
                    formData.projectDirectory
                  }
                  onChange={handleChange}
                  style={inputStyle}
                />

                <div style={helperStyle}>
                  Folder inside the GitHub
                  repository that ReliAI
                  should build and test.
                  Leave blank to use the
                  repository root.
                </div>
              </>
            )}

            {/* ===================================== */}
            {/* BRANCH                                */}
            {/* ===================================== */}

            <label style={labelStyle}>
              Branch
            </label>

            <input
              type="text"
              name="branch"
              placeholder="main"
              value={formData.branch}
              onChange={handleChange}
              style={inputStyle}
            />

            {/* ===================================== */}
            {/* BUILD COMMAND                         */}
            {/* ===================================== */}

            <label style={labelStyle}>
              Build Command
            </label>

            <input
              type="text"
              name="buildCommand"
              placeholder="npm run build"
              value={
                formData.buildCommand
              }
              onChange={handleChange}
              style={inputStyle}
            />

            <div style={helperStyle}>
              Example: npm install, npm
              run build, mvn package
            </div>

            {/* ===================================== */}
            {/* TEST COMMAND                          */}
            {/* ===================================== */}

            <label style={labelStyle}>
              Test Command
            </label>

            <input
              type="text"
              name="testCommand"
              placeholder="npm test"
              value={
                formData.testCommand
              }
              onChange={handleChange}
              style={inputStyle}
            />

            <div
              style={{
                ...helperStyle,
                marginBottom: "25px",
              }}
            >
              Example: npm test, pytest,
              mvn test
            </div>

            {/* ===================================== */}
            {/* GITHUB INFO                           */}
            {/* ===================================== */}

            {formData.sourceType ===
              "GITHUB" && (
              <div
                style={{
                  background: "#eff6ff",

                  border:
                    "1px solid #bfdbfe",

                  borderRadius: "8px",

                  padding: "14px",

                  marginBottom: "25px",

                  color: "#1e40af",

                  fontSize: "14px",

                  lineHeight: "1.5",
                }}
              >
                ReliAI will automatically
                clone this repository into
                its controlled workspace.

                <br />
                <br />

                If the application is
                inside a subfolder, enter
                that folder in Project
                Directory. Otherwise leave
                it blank to build from the
                repository root.
              </div>
            )}

            {/* ===================================== */}
            {/* SUBMIT                                */}
            {/* ===================================== */}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",

                padding: "14px",

                background: loading
                  ? "#94a3b8"
                  : "#2563eb",

                color: "white",

                border: "none",

                borderRadius: "8px",

                cursor: loading
                  ? "not-allowed"
                  : "pointer",

                fontSize: "16px",

                fontWeight: "bold",
              }}
            >
              {loading
                ? "Creating..."
                : "Create Pipeline"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CreatePipeline;