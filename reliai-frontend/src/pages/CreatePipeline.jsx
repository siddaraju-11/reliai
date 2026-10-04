import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import API from "../services/api";

function CreatePipeline() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    description: "",

    // LOCAL or GITHUB
    sourceType: "LOCAL",

    repository: "",
    branch: "main",

    // Only required for LOCAL pipelines
    projectPath: "",

    buildCommand: "",
    testCommand: "",
  });

  const [loading, setLoading] =
    useState(false);

  // =====================================================
  // INPUT CHANGE
  // =====================================================

  const handleChange = (e) => {
    const { name, value } =
      e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // =====================================================
  // SOURCE TYPE CHANGE
  // =====================================================

  const handleSourceTypeChange = (
    sourceType
  ) => {
    setFormData((previous) => ({
      ...previous,

      sourceType,

      // GitHub pipelines must not send
      // a user-controlled local project path.
      projectPath:
        sourceType === "GITHUB"
          ? ""
          : previous.projectPath,
    }));
  };

  // =====================================================
  // SUBMIT
  // =====================================================

  const handleSubmit = async (
    e
  ) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert(
        "Pipeline name is required."
      );

      return;
    }

    if (
      !formData.repository.trim()
    ) {
      alert(
        formData.sourceType ===
          "GITHUB"
          ? "GitHub repository URL is required."
          : "Repository / project name is required."
      );

      return;
    }

    if (
      formData.sourceType ===
        "LOCAL" &&
      !formData.projectPath.trim()
    ) {
      alert(
        "Project path is required for a local pipeline."
      );

      return;
    }

    if (
      formData.sourceType ===
      "GITHUB"
    ) {
      const repository =
        formData.repository.trim();

      if (
        !/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/i.test(
          repository
        )
      ) {
        alert(
          "Enter a valid public GitHub repository URL."
        );

        return;
      }
    }

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

      console.log(
        "[CREATE PIPELINE] Payload:",
        payload
      );

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
        error.response?.data
          ?.message ||
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

  const sourceButtonStyle = (
    active
  ) => ({
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
            onSubmit={
              handleSubmit
            }
            style={{
              background: "white",

              padding: "30px",

              borderRadius:
                "10px",

              maxWidth: "700px",

              boxShadow:
                "0 5px 15px rgba(0,0,0,0.1)",
            }}
          >
            {/* ===================================== */}
            {/* PIPELINE NAME                         */}
            {/* ===================================== */}

            <label
              style={labelStyle}
            >
              Pipeline Name
            </label>

            <input
              type="text"
              name="name"
              placeholder="ReliAI Backend"
              value={
                formData.name
              }
              onChange={
                handleChange
              }
              required
              style={inputStyle}
            />

            {/* ===================================== */}
            {/* DESCRIPTION                           */}
            {/* ===================================== */}

            <label
              style={labelStyle}
            >
              Description
            </label>

            <textarea
              name="description"
              placeholder="Backend deployment pipeline"
              value={
                formData.description
              }
              onChange={
                handleChange
              }
              rows="4"
              style={{
                ...inputStyle,

                resize:
                  "vertical",
              }}
            />

            {/* ===================================== */}
            {/* SOURCE TYPE                           */}
            {/* ===================================== */}

            <label
              style={{
                ...labelStyle,
                marginBottom:
                  "10px",
              }}
            >
              Source Type
            </label>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom:
                  "25px",
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

            <label
              style={labelStyle}
            >
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
              value={
                formData.repository
              }
              onChange={
                handleChange
              }
              required
              style={inputStyle}
            />

            {/* ===================================== */}
            {/* LOCAL PROJECT PATH                    */}
            {/* ===================================== */}

            {formData.sourceType ===
              "LOCAL" && (
              <>
                <label
                  style={
                    labelStyle
                  }
                >
                  Project Path
                </label>

                <input
                  type="text"
                  name="projectPath"
                  placeholder="C:\\Users\\SIDDU\\project"
                  value={
                    formData.projectPath
                  }
                  onChange={
                    handleChange
                  }
                  required
                  style={
                    inputStyle
                  }
                />

                <div
                  style={{
                    marginTop:
                      "-12px",

                    marginBottom:
                      "20px",

                    color:
                      "#64748b",

                    fontSize:
                      "13px",
                  }}
                >
                  Absolute path
                  to the project
                  on the machine
                  running the
                  ReliAI backend.
                </div>
              </>
            )}

            {/* ===================================== */}
            {/* BRANCH                                */}
            {/* ===================================== */}

            <label
              style={labelStyle}
            >
              Branch
            </label>

            <input
              type="text"
              name="branch"
              placeholder="main"
              value={
                formData.branch
              }
              onChange={
                handleChange
              }
              style={inputStyle}
            />

            {/* ===================================== */}
            {/* BUILD COMMAND                         */}
            {/* ===================================== */}

            <label
              style={labelStyle}
            >
              Build Command
            </label>

            <input
              type="text"
              name="buildCommand"
              placeholder="npm install"
              value={
                formData.buildCommand
              }
              onChange={
                handleChange
              }
              style={inputStyle}
            />

            <div
              style={{
                marginTop:
                  "-12px",

                marginBottom:
                  "20px",

                color:
                  "#64748b",

                fontSize:
                  "13px",
              }}
            >
              Example: npm
              install, npm run
              build, mvn package
            </div>

            {/* ===================================== */}
            {/* TEST COMMAND                          */}
            {/* ===================================== */}

            <label
              style={labelStyle}
            >
              Test Command
            </label>

            <input
              type="text"
              name="testCommand"
              placeholder="npm test"
              value={
                formData.testCommand
              }
              onChange={
                handleChange
              }
              style={inputStyle}
            />

            <div
              style={{
                marginTop:
                  "-12px",

                marginBottom:
                  "25px",

                color:
                  "#64748b",

                fontSize:
                  "13px",
              }}
            >
              Example: npm
              test, pytest,
              mvn test
            </div>

            {/* ===================================== */}
            {/* GITHUB INFO                           */}
            {/* ===================================== */}

            {formData.sourceType ===
              "GITHUB" && (
              <div
                style={{
                  background:
                    "#eff6ff",

                  border:
                    "1px solid #bfdbfe",

                  borderRadius:
                    "8px",

                  padding:
                    "14px",

                  marginBottom:
                    "25px",

                  color:
                    "#1e40af",

                  fontSize:
                    "14px",

                  lineHeight:
                    "1.5",
                }}
              >
                ReliAI will
                automatically
                clone this
                repository into
                its controlled
                workspace. You
                do not need to
                provide a local
                project path.
              </div>
            )}

            {/* ===================================== */}
            {/* SUBMIT                                */}
            {/* ===================================== */}

            <button
              type="submit"
              disabled={
                loading
              }
              style={{
                width: "100%",

                padding:
                  "14px",

                background:
                  loading
                    ? "#94a3b8"
                    : "#2563eb",

                color:
                  "white",

                border:
                  "none",

                borderRadius:
                  "8px",

                cursor:
                  loading
                    ? "not-allowed"
                    : "pointer",

                fontSize:
                  "16px",

                fontWeight:
                  "bold",
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