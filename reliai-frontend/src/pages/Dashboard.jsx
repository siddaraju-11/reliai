import { useEffect, useState } from "react";
import API from "../services/api";

import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import StatCard from "../components/StatCard";
import PipelineChart from "../components/PipelineChart";

function Dashboard() {
  // ====================================================
  // DASHBOARD STATE
  // ====================================================

  const [dashboard, setDashboard] = useState({
    total: 0,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    cancelled: 0,

    pipelines: {
      total: 0,
      idle: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
    },

    builds: {
      total: 0,
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
      successRate: 0,
      averageDuration: 0,
    },

    recentBuilds: [],
    recentPipelines: [],
  });

  const [loading, setLoading] = useState(true);

  // ====================================================
  // FETCH DASHBOARD
  // ====================================================

  const fetchDashboard = async () => {
    try {
      const response =
        await API.get("/dashboard");

      if (response.data?.success) {
        setDashboard(
          response.data.dashboard
        );
      }
    } catch (error) {
      console.error(
        "Failed to load dashboard:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  // ====================================================
  // INITIAL LOAD + POLLING
  // ====================================================

  useEffect(() => {
    fetchDashboard();

    const interval = setInterval(() => {
      fetchDashboard();
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // ====================================================
  // HELPERS
  // ====================================================

  const normalizeStatus = (status) => {
    return String(status || "")
      .trim()
      .toUpperCase();
  };

  const getStatusColor = (status) => {
    const normalized =
      normalizeStatus(status);

    switch (normalized) {
      case "SUCCESS":
        return "#16a34a";

      case "FAILED":
        return "#dc2626";

      case "RUNNING":
        return "#2563eb";

      case "CANCELLED":
        return "#7c3aed";

      case "PENDING":
      case "IDLE":
        return "#f59e0b";

      default:
        return "#64748b";
    }
  };

  const formatDuration = (seconds) => {
    const value = Number(seconds || 0);

    if (value <= 0) {
      return "0s";
    }

    if (value < 60) {
      return `${value.toFixed(1)}s`;
    }

    const minutes = Math.floor(
      value / 60
    );

    const remainingSeconds =
      Math.round(value % 60);

    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (date) => {
    if (!date) {
      return "-";
    }

    return new Date(
      date
    ).toLocaleString();
  };

  // ====================================================
  // SAFE DATA
  // ====================================================

  const pipelineStats =
    dashboard.pipelines || {
      total: 0,
      idle: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
    };

  const buildStats =
    dashboard.builds || {
      total: 0,
      pending: 0,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
      successRate: 0,
      averageDuration: 0,
    };

  const recentPipelines =
    dashboard.recentPipelines || [];

  const recentBuilds =
    dashboard.recentBuilds || [];

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
              padding: "40px",
              fontSize: "18px",
              color: "#475569",
            }}
          >
            Loading dashboard...
          </div>
        </div>
      </div>
    );
  }

  // ====================================================
  // UI
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
          minWidth: 0,
        }}
      >
        <Navbar />

        {/* ============================================ */}
        {/* PIPELINE STATISTICS */}
        {/* ============================================ */}

        <div
          style={{
            padding: "30px 30px 10px",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#1e293b",
            }}
          >
            Pipeline Overview
          </h2>
        </div>

        <div
          style={{
            padding: "20px 30px 30px",
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(200px,1fr))",
            gap: "20px",
          }}
        >
          <StatCard
            title="Total Pipelines"
            value={pipelineStats.total}
            color="#2563eb"
          />

          <StatCard
            title="Idle"
            value={pipelineStats.idle}
            color="#f59e0b"
          />

          <StatCard
            title="Running"
            value={pipelineStats.running}
            color="#3b82f6"
          />

          <StatCard
            title="Successful"
            value={pipelineStats.success}
            color="#16a34a"
          />

          <StatCard
            title="Failed"
            value={pipelineStats.failed}
            color="#dc2626"
          />

          <StatCard
            title="Cancelled"
            value={pipelineStats.cancelled}
            color="#7c3aed"
          />
        </div>

        {/* ============================================ */}
        {/* BUILD STATISTICS */}
        {/* ============================================ */}

        <div
          style={{
            padding: "0 30px 10px",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#1e293b",
            }}
          >
            Build Statistics
          </h2>
        </div>

        <div
          style={{
            padding: "20px 30px 30px",
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(200px,1fr))",
            gap: "20px",
          }}
        >
          <StatCard
            title="Total Builds"
            value={buildStats.total}
            color="#2563eb"
          />

          <StatCard
            title="Successful Builds"
            value={buildStats.success}
            color="#16a34a"
          />

          <StatCard
            title="Failed Builds"
            value={buildStats.failed}
            color="#dc2626"
          />

          <StatCard
            title="Cancelled Builds"
            value={buildStats.cancelled}
            color="#7c3aed"
          />

          <StatCard
            title="Running Builds"
            value={buildStats.running}
            color="#3b82f6"
          />

          <StatCard
            title="Pending Builds"
            value={buildStats.pending}
            color="#f59e0b"
          />

          <StatCard
            title="Success Rate"
            value={`${buildStats.successRate}%`}
            color="#059669"
          />

          <StatCard
            title="Average Duration"
            value={formatDuration(
              buildStats.averageDuration
            )}
            color="#9333ea"
          />
        </div>

        {/* ============================================ */}
        {/* PIPELINE CHART */}
        {/* ============================================ */}

        <PipelineChart
          dashboard={{
            total: pipelineStats.total,
            pending: pipelineStats.idle,
            running: pipelineStats.running,
            success: pipelineStats.success,
            failed: pipelineStats.failed,
            cancelled:
              pipelineStats.cancelled,
          }}
        />

        {/* ============================================ */}
        {/* RECENT PIPELINE ACTIVITY */}
        {/* ============================================ */}

        <div
          style={{
            background: "white",
            margin: "30px",
            padding: "25px",
            borderRadius: "12px",
            boxShadow:
              "0 5px 15px rgba(0,0,0,0.08)",
            overflowX: "auto",
          }}
        >
          <h2
            style={{
              marginBottom: "20px",
              color: "#1e293b",
            }}
          >
            Recent Pipeline Activity
          </h2>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "700px",
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
                    padding: "12px",
                    textAlign: "left",
                  }}
                >
                  Pipeline
                </th>

                <th>Status</th>

                <th>Branch</th>

                <th>Repository</th>

                <th>Last Run</th>
              </tr>
            </thead>

            <tbody>
              {recentPipelines.length >
              0 ? (
                recentPipelines.map(
                  (pipeline) => (
                    <tr
                      key={pipeline._id}
                      style={{
                        borderBottom:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <td
                        style={{
                          padding: "12px",
                          fontWeight: "600",
                        }}
                      >
                        {pipeline.name}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          fontWeight: "bold",
                          color:
                            getStatusColor(
                              pipeline.status
                            ),
                        }}
                      >
                        {normalizeStatus(
                          pipeline.status
                        )}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {pipeline.branch ||
                          "-"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {pipeline.repository ||
                          "-"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {formatDate(
                          pipeline.lastRunAt
                        )}
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    style={{
                      textAlign: "center",
                      padding: "25px",
                    }}
                  >
                    No pipelines found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ============================================ */}
        {/* RECENT BUILDS */}
        {/* ============================================ */}

        <div
          style={{
            background: "white",
            margin: "30px",
            padding: "25px",
            borderRadius: "12px",
            boxShadow:
              "0 5px 15px rgba(0,0,0,0.08)",
            overflowX: "auto",
          }}
        >
          <h2
            style={{
              marginBottom: "20px",
              color: "#1e293b",
            }}
          >
            Recent Builds
          </h2>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "850px",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#1e293b",
                  color: "white",
                }}
              >
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                  }}
                >
                  Build
                </th>

                <th>Pipeline</th>

                <th>Status</th>

                <th>Stage</th>

                <th>Branch</th>

                <th>Duration</th>

                <th>Created</th>
              </tr>
            </thead>

            <tbody>
              {recentBuilds.length > 0 ? (
                recentBuilds.map(
                  (build) => (
                    <tr
                      key={build._id}
                      style={{
                        borderBottom:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <td
                        style={{
                          padding: "12px",
                          fontWeight: "600",
                        }}
                      >
                        #{build.buildNumber}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {build.pipeline
                          ?.name ||
                          "Unknown Pipeline"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          fontWeight: "bold",
                          color:
                            getStatusColor(
                              build.status
                            ),
                        }}
                      >
                        {build.status}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {build.stage || "-"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {build.branch ||
                          "-"}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {formatDuration(
                          build.duration
                        )}
                      </td>

                      <td
                        style={{
                          padding: "12px",
                        }}
                      >
                        {formatDate(
                          build.createdAt
                        )}
                      </td>
                    </tr>
                  )
                )
              ) : (
                <tr>
                  <td
                    colSpan="7"
                    style={{
                      textAlign: "center",
                      padding: "25px",
                    }}
                  >
                    No builds found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;