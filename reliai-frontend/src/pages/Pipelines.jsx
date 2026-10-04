import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

import API from "../services/api";

function Pipelines() {
  const navigate = useNavigate();

  // ======================================================
  // STATE
  // ======================================================

  const [pipelines, setPipelines] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  const [runningPipelineId, setRunningPipelineId] =
    useState(null);

  const [cancellingPipelineId, setCancellingPipelineId] =
    useState(null);

  // ======================================================
  // NORMALIZE STATUS
  // ======================================================

  const normalizeStatus = (status) => {
    return String(status || "")
      .trim()
      .toUpperCase();
  };

  // ======================================================
  // INITIAL LOAD + AUTO REFRESH
  // ======================================================

  useEffect(() => {
    fetchPipelines();

    const interval = setInterval(() => {
      fetchPipelines();
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // ======================================================
  // FETCH PIPELINES
  // ======================================================

  const fetchPipelines = async () => {
    try {
      const response = await API.get("/pipeline");

      setPipelines(
        response.data?.pipelines || []
      );
    } catch (error) {
      console.error(
        "Fetch pipelines error:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  // ======================================================
  // RUN PIPELINE
  // ======================================================

  const runPipeline = async (pipelineId) => {
    if (
      runningPipelineId === pipelineId
    ) {
      return;
    }

    try {
      setRunningPipelineId(
        pipelineId
      );

      const response = await API.put(
        `/pipeline/${pipelineId}/run`
      );

      alert(
        response.data?.message ||
          "Pipeline started successfully."
      );

      // Refresh immediately
      await fetchPipelines();

      // Refresh again because the worker/build may
      // update the pipeline shortly after the request.
      setTimeout(() => {
        fetchPipelines();
      }, 1000);

      setTimeout(() => {
        fetchPipelines();
      }, 3000);
    } catch (error) {
      console.error(
        "Run pipeline error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to run pipeline."
      );

      await fetchPipelines();
    } finally {
      setRunningPipelineId(null);
    }
  };

  // ======================================================
  // CANCEL RUNNING BUILD
  // ======================================================

  const cancelPipelineBuild = async (
    pipelineId
  ) => {
    if (
      cancellingPipelineId ===
      pipelineId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Are you sure you want to cancel the running build?"
      );

    if (!confirmed) {
      return;
    }

    try {
      setCancellingPipelineId(
        pipelineId
      );

      // ==================================================
      // STEP 1:
      // GET BUILDS FOR THIS PIPELINE
      // ==================================================

      const buildResponse =
        await API.get(
          `/build/pipeline/${pipelineId}`
        );

      const builds =
        buildResponse.data?.builds ||
        [];

      console.log(
        "Pipeline builds:",
        builds
      );

      // ==================================================
      // STEP 2:
      // FIND ACTIVE BUILD
      // ==================================================

      const activeBuild =
        builds.find((build) => {
          const status =
            normalizeStatus(
              build.status
            );

          return (
            status === "RUNNING" ||
            status === "PENDING"
          );
        });

      // ==================================================
      // NO ACTIVE BUILD
      // ==================================================

      if (!activeBuild) {
        alert(
          "No running build was found for this pipeline."
        );

        await fetchPipelines();

        return;
      }

      console.log(
        "Active Build ID:",
        activeBuild._id
      );

      // ==================================================
      // STEP 3:
      // CANCEL BUILD
      // ==================================================

      const response =
        await API.post(
          `/pipeline/${pipelineId}/build/${activeBuild._id}/cancel`
        );

      alert(
        response.data?.message ||
          "Build cancelled successfully."
      );

      // ==================================================
      // STEP 4:
      // REFRESH PIPELINE
      // ==================================================

      await fetchPipelines();

      setTimeout(() => {
        fetchPipelines();
      }, 1000);

      setTimeout(() => {
        fetchPipelines();
      }, 3000);
    } catch (error) {
      console.error(
        "Cancel build error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to cancel build."
      );

      await fetchPipelines();
    } finally {
      setCancellingPipelineId(
        null
      );
    }
  };

  // ======================================================
  // DELETE PIPELINE
  // ======================================================

  const deletePipeline = async (
    pipelineId
  ) => {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this pipeline?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await API.delete(
          `/pipeline/${pipelineId}`
        );

      alert(
        response.data?.message ||
          "Pipeline deleted successfully."
      );

      await fetchPipelines();
    } catch (error) {
      console.error(
        "Delete pipeline error:",
        error
      );

      alert(
        error.response?.data?.message ||
          "Failed to delete pipeline."
      );
    }
  };

  // ======================================================
  // SEARCH + FILTER
  // ======================================================

  const filteredPipelines =
    pipelines.filter(
      (pipeline) => {
        const pipelineName =
          String(
            pipeline.name || ""
          ).toLowerCase();

        const searchValue =
          search
            .trim()
            .toLowerCase();

        const matchesSearch =
          pipelineName.includes(
            searchValue
          );

        const pipelineStatus =
          normalizeStatus(
            pipeline.status
          );

        const selectedStatus =
          normalizeStatus(
            statusFilter
          );

        const matchesStatus =
          statusFilter === "All" ||
          pipelineStatus ===
            selectedStatus;

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );

  // ======================================================
  // STATUS STYLE
  // ======================================================

  const getStatusStyle = (
    status
  ) => {
    switch (
      normalizeStatus(status)
    ) {
      case "SUCCESS":
        return {
          background: "#dcfce7",
          color: "#15803d",
        };

      case "FAILED":
        return {
          background: "#fee2e2",
          color: "#dc2626",
        };

      case "RUNNING":
        return {
          background: "#dbeafe",
          color: "#2563eb",
        };

      case "CANCELLED":
        return {
          background: "#f1f5f9",
          color: "#475569",
        };

      case "PENDING":
        return {
          background: "#fef3c7",
          color: "#d97706",
        };

      default:
        return {
          background: "#f1f5f9",
          color: "#64748b",
        };
    }
  };

  // ======================================================
  // RENDER
  // ======================================================

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
          {/* =============================================
              HEADER
          ============================================= */}

          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              marginBottom: "25px",
            }}
          >
            <h1>
              Pipeline Monitoring
            </h1>

            <button
              onClick={() =>
                navigate(
                  "/create-pipeline"
                )
              }
              style={{
                background: "#2563eb",
                color: "white",
                border: "none",
                padding: "12px 18px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              + Create Pipeline
            </button>
          </div>

          {/* =============================================
              SEARCH + FILTER
          ============================================= */}

          <div
            style={{
              display: "flex",
              gap: "20px",
              marginBottom: "25px",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              placeholder="Search pipeline..."
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              style={{
                flex: 1,
                minWidth: "250px",
                padding: "12px",
                borderRadius: "8px",
                border:
                  "1px solid #cbd5e1",
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
              style={{
                padding: "12px",
                width: "180px",
                borderRadius: "8px",
                border:
                  "1px solid #cbd5e1",
              }}
            >
              <option value="All">
                All
              </option>

              <option value="Pending">
                Pending
              </option>

              <option value="Running">
                Running
              </option>

              <option value="Success">
                Success
              </option>

              <option value="Failed">
                Failed
              </option>

              <option value="Cancelled">
                Cancelled
              </option>
            </select>
          </div>

          {/* =============================================
              PIPELINE TABLE
          ============================================= */}

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                background: "white",
                borderCollapse:
                  "collapse",
                borderRadius: "10px",
                overflow: "hidden",
                boxShadow:
                  "0 5px 15px rgba(0,0,0,.08)",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#2563eb",
                    color: "white",
                  }}
                >
                  <th
                    style={{
                      padding: "15px",
                    }}
                  >
                    Pipeline
                  </th>

                  <th>
                    Repository
                  </th>

                  <th>
                    Branch
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        textAlign:
                          "center",
                        padding: "30px",
                      }}
                    >
                      Loading...
                    </td>
                  </tr>
                ) : filteredPipelines.length >
                  0 ? (
                  filteredPipelines.map(
                    (pipeline) => {
                      // ==================================
                      // IMPORTANT:
                      // Backend returns uppercase status:
                      //
                      // RUNNING
                      // SUCCESS
                      // FAILED
                      // CANCELLED
                      //
                      // Normalize before comparing.
                      // ==================================

                      const pipelineStatus =
                        normalizeStatus(
                          pipeline.status
                        );

                      const isRunning =
                        pipelineStatus ===
                        "RUNNING";

                      const isStarting =
                        runningPipelineId ===
                        pipeline._id;

                      const isCancelling =
                        cancellingPipelineId ===
                        pipeline._id;

                      return (
                        <tr
                          key={
                            pipeline._id
                          }
                          style={{
                            borderBottom:
                              "1px solid #e5e7eb",
                          }}
                        >
                          {/* =============================
                              PIPELINE NAME
                          ============================= */}

                          <td
                            style={{
                              padding: "15px",
                            }}
                          >
                            <b>
                              {
                                pipeline.name
                              }
                            </b>
                          </td>

                          {/* =============================
                              REPOSITORY
                          ============================= */}

                          <td>
                            {pipeline.repository ||
                              "-"}
                          </td>

                          {/* =============================
                              BRANCH
                          ============================= */}

                          <td>
                            {pipeline.branch ||
                              "-"}
                          </td>

                          {/* =============================
                              STATUS
                          ============================= */}

                          <td>
                            <span
                              style={{
                                ...getStatusStyle(
                                  pipeline.status
                                ),

                                padding:
                                  "6px 12px",

                                borderRadius:
                                  "20px",

                                fontWeight:
                                  "bold",

                                fontSize:
                                  "14px",

                                display:
                                  "inline-block",
                              }}
                            >
                              {pipelineStatus ||
                                "UNKNOWN"}
                            </span>
                          </td>

                          {/* =============================
                              ACTIONS
                          ============================= */}

                          <td
                            style={{
                              padding: "10px",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {/* ===========================
                                RUN / CANCEL BUTTON
                            =========================== */}

                            {isRunning ? (
                              <button
                                onClick={() =>
                                  cancelPipelineBuild(
                                    pipeline._id
                                  )
                                }
                                disabled={
                                  isCancelling
                                }
                                style={{
                                  background:
                                    isCancelling
                                      ? "#94a3b8"
                                      : "#dc2626",

                                  color: "white",

                                  border: "none",

                                  padding:
                                    "8px 14px",

                                  borderRadius:
                                    "5px",

                                  cursor:
                                    isCancelling
                                      ? "not-allowed"
                                      : "pointer",

                                  marginRight:
                                    "8px",

                                  fontWeight:
                                    "bold",
                                }}
                              >
                                {isCancelling
                                  ? "Cancelling..."
                                  : "Cancel"}
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  runPipeline(
                                    pipeline._id
                                  )
                                }
                                disabled={
                                  isStarting
                                }
                                style={{
                                  background:
                                    isStarting
                                      ? "#94a3b8"
                                      : "#16a34a",

                                  color: "white",

                                  border: "none",

                                  padding:
                                    "8px 14px",

                                  borderRadius:
                                    "5px",

                                  cursor:
                                    isStarting
                                      ? "not-allowed"
                                      : "pointer",

                                  marginRight:
                                    "8px",

                                  fontWeight:
                                    "bold",
                                }}
                              >
                                {isStarting
                                  ? "Starting..."
                                  : "Run"}
                              </button>
                            )}

                            {/* ===========================
                                LOGS
                            =========================== */}

                            <button
                              onClick={() =>
                                navigate(
                                  `/pipeline-logs/${pipeline._id}`
                                )
                              }
                              style={{
                                background:
                                  "#7c3aed",

                                color: "white",

                                border: "none",

                                padding:
                                  "8px 15px",

                                borderRadius:
                                  "5px",

                                cursor:
                                  "pointer",

                                marginRight:
                                  "8px",
                              }}
                            >
                              Logs
                            </button>

                            {/* ===========================
                                EDIT
                            =========================== */}

                            <button
                              onClick={() =>
                                navigate(
                                  `/edit-pipeline/${pipeline._id}`
                                )
                              }
                              disabled={
                                isRunning
                              }
                              style={{
                                background:
                                  isRunning
                                    ? "#94a3b8"
                                    : "#2563eb",

                                color: "white",

                                border: "none",

                                padding:
                                  "8px 14px",

                                borderRadius:
                                  "5px",

                                cursor:
                                  isRunning
                                    ? "not-allowed"
                                    : "pointer",

                                marginRight:
                                  "8px",

                                opacity:
                                  isRunning
                                    ? 0.7
                                    : 1,
                              }}
                            >
                              Edit
                            </button>

                            {/* ===========================
                                DELETE
                            =========================== */}

                            <button
                              onClick={() =>
                                deletePipeline(
                                  pipeline._id
                                )
                              }
                              disabled={
                                isRunning
                              }
                              style={{
                                background:
                                  isRunning
                                    ? "#94a3b8"
                                    : "#dc2626",

                                color: "white",

                                border: "none",

                                padding:
                                  "8px 14px",

                                borderRadius:
                                  "5px",

                                cursor:
                                  isRunning
                                    ? "not-allowed"
                                    : "pointer",

                                opacity:
                                  isRunning
                                    ? 0.7
                                    : 1,
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      style={{
                        textAlign:
                          "center",
                        padding: "30px",
                        color: "#64748b",
                      }}
                    >
                      No pipelines found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Pipelines;
