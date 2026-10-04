import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

import API from "../services/api";
import socket, { connectSocket } from "../services/socket";

function PipelineLogs() {
  const { id } = useParams();

  const [build, setBuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(
    socket.connected
  );

  const logContainerRef = useRef(null);

  // ======================================================
  // FETCH BUILD DETAILS
  // ======================================================

  const fetchBuild = async ({
    showLoading = false,
  } = {}) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const token =
        localStorage.getItem("token");

      const res = await API.get(
        `/build/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setBuild(res.data.build);
    } catch (error) {
      console.error(
        "[PIPELINE LOGS] Unable to load build:",
        error
      );

      if (showLoading) {
        alert("Unable to load build logs.");
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // ======================================================
  // INITIAL BUILD FETCH
  // ======================================================

  useEffect(() => {
    fetchBuild({
      showLoading: true,
    });
  }, [id]);

  // ======================================================
  // SOCKET.IO REAL-TIME LISTENERS
  // ======================================================

  useEffect(() => {
    // Make sure Socket.IO is connected.
    connectSocket();

    // --------------------------------------------------
    // Helper
    // --------------------------------------------------

    const isCurrentBuild = (data) => {
      if (!data?.buildId) {
        return false;
      }

      return (
        String(data.buildId) ===
        String(id)
      );
    };

    // --------------------------------------------------
    // Socket Connected
    // --------------------------------------------------

    const handleConnect = () => {
      console.log(
        "[PIPELINE LOGS] Socket connected:",
        socket.id
      );

      setSocketConnected(true);
    };

    // --------------------------------------------------
    // Socket Disconnected
    // --------------------------------------------------

    const handleDisconnect = (
      reason
    ) => {
      console.log(
        "[PIPELINE LOGS] Socket disconnected:",
        reason
      );

      setSocketConnected(false);
    };

    // --------------------------------------------------
    // Build Started
    // --------------------------------------------------

    const handleBuildStarted = (
      data
    ) => {
      if (!isCurrentBuild(data)) {
        return;
      }

      console.log(
        "[REALTIME] build:started",
        data
      );

      setBuild((previousBuild) => {
        if (!previousBuild) {
          return previousBuild;
        }

        return {
          ...previousBuild,

          status:
            data.status ||
            "Running",

          stage:
            data.stage ||
            "QUEUED",

          startedAt:
            previousBuild.startedAt ||
            data.timestamp,

          finishedAt:
            null,

          duration:
            null,

          error:
            null,
        };
      });
    };

    // --------------------------------------------------
    // Build Stage Changed
    // --------------------------------------------------

    const handleBuildStage = (
      data
    ) => {
      if (!isCurrentBuild(data)) {
        return;
      }

      console.log(
        "[REALTIME] build:stage",
        data
      );

      setBuild((previousBuild) => {
        if (!previousBuild) {
          return previousBuild;
        }

        return {
          ...previousBuild,

          status:
            data.status ||
            previousBuild.status,

          stage:
            data.stage ||
            previousBuild.stage,

          duration:
            data.duration ??
            previousBuild.duration,

          error:
            data.error ??
            previousBuild.error,
        };
      });
    };

    // --------------------------------------------------
    // New Build Log
    // --------------------------------------------------

    const handleBuildLog = (
      data
    ) => {
      if (!isCurrentBuild(data)) {
        return;
      }

      if (!data.chunk) {
        return;
      }

      console.log(
        "[REALTIME] build:log",
        data
      );

      setBuild((previousBuild) => {
        if (!previousBuild) {
          return previousBuild;
        }

        const oldLogs =
          previousBuild.logs || "";

        const incomingLog =
          String(data.chunk);

        /*
         * Basic duplicate protection.
         *
         * If the backend has already persisted the
         * exact chunk and our initial API request
         * contained it, don't append it again.
         */

        if (
          oldLogs.endsWith(
            incomingLog
          )
        ) {
          return previousBuild;
        }

        const updatedLogs =
          oldLogs
            ? `${oldLogs}\n${incomingLog}`
            : incomingLog;

        return {
          ...previousBuild,

          logs:
            updatedLogs,

          stage:
            data.stage ||
            previousBuild.stage,
        };
      });
    };

    // --------------------------------------------------
    // Build Completed
    // --------------------------------------------------

    const handleBuildCompleted = async (
      data
    ) => {
      if (!isCurrentBuild(data)) {
        return;
      }

      console.log(
        "[REALTIME] build:completed",
        data
      );

      /*
       * Refetch from MongoDB.
       *
       * This gives us the authoritative final:
       * - logs
       * - duration
       * - finishedAt
       * - testResult
       * - AI analysis
       * - auto-fix information
       */

      await fetchBuild();
    };

    // --------------------------------------------------
    // Build Failed
    // --------------------------------------------------

    const handleBuildFailed = async (
      data
    ) => {
      if (!isCurrentBuild(data)) {
        return;
      }

      console.log(
        "[REALTIME] build:failed",
        data
      );

      await fetchBuild();
    };

    // --------------------------------------------------
    // Build Cancelled
    // --------------------------------------------------

    const handleBuildCancelled = async (
      data
    ) => {
      if (!isCurrentBuild(data)) {
        return;
      }

      console.log(
        "[REALTIME] build:cancelled",
        data
      );

      await fetchBuild();
    };

    // ==================================================
    // REGISTER SOCKET LISTENERS
    // ==================================================

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.on(
      "build:started",
      handleBuildStarted
    );

    socket.on(
      "build:stage",
      handleBuildStage
    );

    socket.on(
      "build:log",
      handleBuildLog
    );

    socket.on(
      "build:completed",
      handleBuildCompleted
    );

    socket.on(
      "build:failed",
      handleBuildFailed
    );

    socket.on(
      "build:cancelled",
      handleBuildCancelled
    );

    // Socket may already have connected before
    // this page mounted.
    setSocketConnected(
      socket.connected
    );

    // ==================================================
    // CLEANUP
    // ==================================================

    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.off(
        "build:started",
        handleBuildStarted
      );

      socket.off(
        "build:stage",
        handleBuildStage
      );

      socket.off(
        "build:log",
        handleBuildLog
      );

      socket.off(
        "build:completed",
        handleBuildCompleted
      );

      socket.off(
        "build:failed",
        handleBuildFailed
      );

      socket.off(
        "build:cancelled",
        handleBuildCancelled
      );

      /*
       * IMPORTANT:
       *
       * Do NOT call socket.disconnect() here.
       *
       * Socket.IO is shared by the entire ReliAI
       * frontend application.
       */
    };
  }, [id]);

  // ======================================================
  // AUTO-SCROLL LIVE TERMINAL
  // ======================================================

  useEffect(() => {
    if (!logContainerRef.current) {
      return;
    }

    logContainerRef.current.scrollTop =
      logContainerRef.current.scrollHeight;
  }, [build?.logs]);

  // ======================================================
  // COPY LOGS
  // ======================================================

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(
        build?.logs || ""
      );

      alert(
        "Logs copied successfully."
      );
    } catch (error) {
      console.error(
        "[COPY LOGS ERROR]",
        error
      );

      alert(
        "Unable to copy logs."
      );
    }
  };

  // ======================================================
  // DOWNLOAD LOGS
  // ======================================================

  const downloadLogs = () => {
    const blob =
      new Blob(
        [
          build?.logs ||
            "",
        ],
        {
          type:
            "text/plain",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href =
      url;

    link.download =
      `Build-${build?.buildNumber || "Logs"}-Logs.txt`;

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    URL.revokeObjectURL(
      url
    );
  };

  // ======================================================
  // STATUS COLOR
  // ======================================================

  const getStatusColor = (
    status
  ) => {
    switch (status) {
      case "Success":
        return "#16a34a";

      case "Failed":
        return "#dc2626";

      case "Running":
        return "#f59e0b";

      case "Cancelled":
        return "#64748b";

      default:
        return "#64748b";
    }
  };

  // ======================================================
  // STAGE COLOR
  // ======================================================

  const getStageColor = (
    stage
  ) => {
    switch (stage) {
      case "SUCCESS":
        return "#16a34a";

      case "FAILED":
        return "#dc2626";

      case "CANCELLED":
        return "#64748b";

      case "BUILDING":
      case "TESTING":
      case "ANALYZING":
      case "AUTO_FIXING":
      case "REBUILDING":
      case "RETESTING":
        return "#2563eb";

      case "QUEUED":
        return "#f59e0b";

      default:
        return "#64748b";
    }
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <div
        style={{
          padding:
            "40px",

          fontSize:
            "20px",
        }}
      >
        Loading Build Logs...
      </div>
    );
  }

  // ======================================================
  // BUILD NOT FOUND
  // ======================================================

  if (!build) {
    return (
      <div
        style={{
          padding:
            "40px",

          fontSize:
            "20px",
        }}
      >
        Build not found.
      </div>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <div
      style={{
        display:
          "flex",

        minHeight:
          "100vh",

        background:
          "#f1f5f9",
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
            padding:
              "30px",
          }}
        >
          {/* ========================================== */}
          {/* HEADER */}
          {/* ========================================== */}

          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "space-between",

              gap:
                "15px",

              flexWrap:
                "wrap",

              marginBottom:
                "25px",
            }}
          >
            <h1
              style={{
                margin:
                  0,

                color:
                  "#1e293b",
              }}
            >
              📄 Pipeline Build Logs
            </h1>

            {/* ====================================== */}
            {/* SOCKET STATUS */}
            {/* ====================================== */}

            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap:
                  "8px",

                background:
                  socketConnected
                    ? "#dcfce7"
                    : "#fee2e2",

                color:
                  socketConnected
                    ? "#166534"
                    : "#991b1b",

                border:
                  socketConnected
                    ? "1px solid #86efac"
                    : "1px solid #fecaca",

                padding:
                  "8px 13px",

                borderRadius:
                  "999px",

                fontWeight:
                  "bold",

                fontSize:
                  "14px",
              }}
            >
              <span>
                {socketConnected
                  ? "●"
                  : "○"}
              </span>

              {socketConnected
                ? "Live Connected"
                : "Realtime Disconnected"}
            </div>
          </div>

          <div
            style={{
              background:
                "white",

              padding:
                "25px",

              borderRadius:
                "12px",

              boxShadow:
                "0 3px 10px rgba(0,0,0,.08)",
            }}
          >
            {/* ====================================== */}
            {/* BUILD TITLE */}
            {/* ====================================== */}

            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                gap:
                  "15px",

                flexWrap:
                  "wrap",
              }}
            >
              <h2
                style={{
                  margin:
                    0,
                }}
              >
                🚀 Build #
                {build.buildNumber}
              </h2>

              <div
                style={{
                  display:
                    "flex",

                  gap:
                    "10px",

                  flexWrap:
                    "wrap",
                }}
              >
                {/* STATUS */}

                <span
                  style={{
                    background:
                      `${getStatusColor(
                        build.status
                      )}15`,

                    color:
                      getStatusColor(
                        build.status
                      ),

                    border:
                      `1px solid ${getStatusColor(
                        build.status
                      )}`,

                    padding:
                      "6px 12px",

                    borderRadius:
                      "999px",

                    fontWeight:
                      "bold",

                    fontSize:
                      "14px",
                  }}
                >
                  {build.status}
                </span>

                {/* STAGE */}

                {build.stage && (
                  <span
                    style={{
                      background:
                        `${getStageColor(
                          build.stage
                        )}15`,

                      color:
                        getStageColor(
                          build.stage
                        ),

                      border:
                        `1px solid ${getStageColor(
                          build.stage
                        )}`,

                      padding:
                        "6px 12px",

                      borderRadius:
                        "999px",

                      fontWeight:
                        "bold",

                      fontSize:
                        "14px",
                    }}
                  >
                    {build.stage}
                  </span>
                )}
              </div>
            </div>

            <hr
              style={{
                margin:
                  "20px 0",
              }}
            />

            {/* ====================================== */}
            {/* BUILD INFORMATION */}
            {/* ====================================== */}

            <p>
              <strong>
                Pipeline:
              </strong>{" "}
              {build.pipeline?.name ||
                "N/A"}
            </p>

            <p>
              <strong>
                Description:
              </strong>{" "}
              {build.pipeline?.description ||
                "-"}
            </p>

            <p>
              <strong>
                Repository:
              </strong>{" "}
              {build.pipeline?.repository ? (
                <a
                  href={
                    build.pipeline
                      .repository
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {
                    build.pipeline
                      .repository
                  }
                </a>
              ) : (
                "-"
              )}
            </p>

            <p>
              <strong>
                Branch:
              </strong>{" "}
              {build.branch ||
                "-"}
            </p>

            <p>
              <strong>
                Commit ID:
              </strong>{" "}
              {build.commitId ||
                "-"}
            </p>

            <p>
              <strong>
                Status:
              </strong>{" "}
              <span
                style={{
                  color:
                    getStatusColor(
                      build.status
                    ),

                  fontWeight:
                    "bold",
                }}
              >
                {build.status}
              </span>
            </p>

            <p>
              <strong>
                Current Stage:
              </strong>{" "}
              <span
                style={{
                  color:
                    getStageColor(
                      build.stage
                    ),

                  fontWeight:
                    "bold",
                }}
              >
                {build.stage ||
                  "-"}
              </span>
            </p>

            <p>
              <strong>
                Duration:
              </strong>{" "}
              {build.duration !==
                null &&
              build.duration !==
                undefined
                ? `${build.duration} sec`
                : build.status ===
                    "Running"
                  ? "Running..."
                  : "-"}
            </p>

            <p>
              <strong>
                Started:
              </strong>{" "}
              {build.startedAt
                ? new Date(
                    build.startedAt
                  ).toLocaleString()
                : "-"}
            </p>

            <p>
              <strong>
                Finished:
              </strong>{" "}
              {build.finishedAt
                ? new Date(
                    build.finishedAt
                  ).toLocaleString()
                : build.status ===
                    "Running"
                  ? "Running..."
                  : "-"}
            </p>

            {/* ====================================== */}
            {/* LIVE BUILD LOGS */}
            {/* ====================================== */}

            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "space-between",

                gap:
                  "15px",

                flexWrap:
                  "wrap",

                marginTop:
                  "35px",
              }}
            >
              <h2
                style={{
                  margin:
                    0,
                }}
              >
                💻 Build Logs
              </h2>

              {build.status ===
                "Running" && (
                <span
                  style={{
                    color:
                      "#2563eb",

                    fontWeight:
                      "bold",

                    fontSize:
                      "14px",
                  }}
                >
                  ● LIVE
                </span>
              )}
            </div>

            {/* ====================================== */}
            {/* TERMINAL */}
            {/* ====================================== */}

            <div
              ref={
                logContainerRef
              }
              style={{
                background:
                  "#111827",

                color:
                  "#22c55e",

                padding:
                  "20px",

                borderRadius:
                  "10px",

                marginTop:
                  "15px",

                whiteSpace:
                  "pre-wrap",

                fontFamily:
                  "Consolas, Monaco, monospace",

                fontSize:
                  "14px",

                lineHeight:
                  "1.6",

                minHeight:
                  "280px",

                maxHeight:
                  "520px",

                overflowY:
                  "auto",

                overflowX:
                  "auto",

                border:
                  "1px solid #1f2937",
              }}
            >
              {build.logs ||
                (build.status ===
                "Running"
                  ? "Waiting for build output..."
                  : "No logs available.")}
            </div>

            {/* ====================================== */}
            {/* BUTTONS */}
            {/* ====================================== */}

            <div
              style={{
                display:
                  "flex",

                gap:
                  "15px",

                marginTop:
                  "25px",

                flexWrap:
                  "wrap",
              }}
            >
              <button
                onClick={
                  copyLogs
                }
                style={{
                  background:
                    "#2563eb",

                  color:
                    "white",

                  border:
                    "none",

                  padding:
                    "12px 20px",

                  borderRadius:
                    "8px",

                  cursor:
                    "pointer",
                }}
              >
                📋 Copy Logs
              </button>

              <button
                onClick={
                  downloadLogs
                }
                style={{
                  background:
                    "#16a34a",

                  color:
                    "white",

                  border:
                    "none",

                  padding:
                    "12px 20px",

                  borderRadius:
                    "8px",

                  cursor:
                    "pointer",
                }}
              >
                ⬇ Download Logs
              </button>

              <button
                onClick={() =>
                  fetchBuild()
                }
                style={{
                  background:
                    "#475569",

                  color:
                    "white",

                  border:
                    "none",

                  padding:
                    "12px 20px",

                  borderRadius:
                    "8px",

                  cursor:
                    "pointer",
                }}
              >
                ↻ Refresh
              </button>
            </div>

            {/* ====================================== */}
            {/* AI ANALYSIS */}
            {/* ====================================== */}

            <div
              style={{
                marginTop:
                  "40px",

                padding:
                  "20px",

                borderRadius:
                  "10px",

                background:
                  "#eff6ff",

                border:
                  "1px solid #bfdbfe",
              }}
            >
              <h2>
                🤖 AI Failure Analysis
              </h2>

              {/* FAILED */}

              {build.status ===
              "Failed" ? (
                <>
                  <p>
                    ReliAI detected
                    that this build
                    failed.
                  </p>

                  {build.error && (
                    <p>
                      <strong>
                        Error:
                      </strong>{" "}
                      {build.error}
                    </p>
                  )}

                  <p>
                    ReliAI can analyze
                    the failure logs,
                    identify the likely
                    root cause, and
                    prepare a possible
                    fix.
                  </p>

                  <button
                    style={{
                      marginTop:
                        "15px",

                      background:
                        "#2563eb",

                      color:
                        "white",

                      border:
                        "none",

                      padding:
                        "12px 20px",

                      borderRadius:
                        "8px",

                      cursor:
                        "pointer",
                    }}
                  >
                    🔍 Analyze Logs
                  </button>
                </>
              ) : build.status ===
                "Running" ? (
                <p
                  style={{
                    color:
                      "#2563eb",

                    fontWeight:
                      "bold",
                  }}
                >
                  ⏳ Build is currently
                  running. Live logs are
                  being monitored.
                </p>
              ) : build.status ===
                "Cancelled" ? (
                <p
                  style={{
                    color:
                      "#64748b",

                    fontWeight:
                      "bold",
                  }}
                >
                  Build was cancelled.
                  Failure analysis was
                  not performed.
                </p>
              ) : (
                <p
                  style={{
                    color:
                      "#16a34a",

                    fontWeight:
                      "bold",
                  }}
                >
                  ✅ Build completed
                  successfully. No
                  issues detected.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PipelineLogs;