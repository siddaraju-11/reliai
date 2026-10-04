import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import API from "../services/api";

function BuildHistory() {
  const navigate = useNavigate();

  // ==========================================
  // Build Data
  // ==========================================
  const [builds, setBuilds] = useState([]);

  // ==========================================
  // Filters
  // ==========================================
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [sortOrder, setSortOrder] =
    useState("newest");

  // ==========================================
  // Pagination
  // ==========================================
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalBuilds: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    nextPage: null,
    previousPage: null,
  });

  // ==========================================
  // UI State
  // ==========================================
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================
  // Debounce Search
  // Prevent API request on every key press
  // ==========================================
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 400);

    return () => clearTimeout(timer);
  }, [search]);

  // ==========================================
  // Reset To Page 1 When Filters Change
  // ==========================================
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    statusFilter,
    sortOrder,
    limit,
  ]);

  // ==========================================
  // Fetch Builds
  // ==========================================
  useEffect(() => {
    fetchBuilds();
  }, [
    page,
    limit,
    debouncedSearch,
    statusFilter,
    sortOrder,
  ]);

  const fetchBuilds = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        setError(
          "Authentication token not found. Please login again."
        );
        setBuilds([]);
        return;
      }

      // ==========================================
      // Build Query Parameters
      // ==========================================
      const params = {
        page,
        limit,
        sort: sortOrder,
      };

      if (statusFilter !== "All") {
        params.status = statusFilter;
      }

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }

      // ==========================================
      // Request Backend
      // ==========================================
      const res = await API.get("/build", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params,
      });

      const responseBuilds = Array.isArray(
        res.data?.builds
      )
        ? res.data.builds
        : [];

      setBuilds(responseBuilds);

      // ==========================================
      // Store Pagination Information
      // ==========================================
      if (res.data?.pagination) {
        setPagination(res.data.pagination);
      } else {
        setPagination({
          page: 1,
          limit,
          totalBuilds: responseBuilds.length,
          totalPages:
            responseBuilds.length > 0 ? 1 : 0,
          hasNextPage: false,
          hasPreviousPage: false,
          nextPage: null,
          previousPage: null,
        });
      }
    } catch (err) {
      console.error(
        "FETCH BUILD HISTORY ERROR:",
        err
      );

      setBuilds([]);

      setError(
        err.response?.data?.message ||
          "Failed to load build history."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // Status Color
  // ==========================================
  const statusColor = (status) => {
    switch (status) {
      case "Success":
        return "#16a34a";

      case "Failed":
        return "#dc2626";

      case "Running":
        return "#f59e0b";

      case "Pending":
        return "#3b82f6";

      case "Cancelled":
        return "#64748b";

      default:
        return "#64748b";
    }
  };

  // ==========================================
  // Status Background
  // ==========================================
  const statusBackground = (status) => {
    switch (status) {
      case "Success":
        return "#dcfce7";

      case "Failed":
        return "#fee2e2";

      case "Running":
        return "#fef3c7";

      case "Pending":
        return "#dbeafe";

      case "Cancelled":
        return "#e2e8f0";

      default:
        return "#e2e8f0";
    }
  };

  // ==========================================
  // Format Date
  // ==========================================
  const formatDate = (date) => {
    if (!date) {
      return "-";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "-";
    }

    return parsedDate.toLocaleString();
  };

  // ==========================================
  // Previous Page
  // ==========================================
  const handlePreviousPage = () => {
    if (!pagination.hasPreviousPage) {
      return;
    }

    setPage((currentPage) =>
      Math.max(1, currentPage - 1)
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // ==========================================
  // Next Page
  // ==========================================
  const handleNextPage = () => {
    if (!pagination.hasNextPage) {
      return;
    }

    setPage((currentPage) => currentPage + 1);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // ==========================================
  // Clear Filters
  // ==========================================
  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("All");
    setSortOrder("newest");
    setPage(1);
  };

  // ==========================================
  // Render
  // ==========================================
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f1f5f9",
      }}
    >
      {/* ======================================
          Sidebar
      ====================================== */}

      <Sidebar />

      <div
        style={{
          flex: 1,
          minWidth: 0,
        }}
      >
        {/* ======================================
            Navbar
        ====================================== */}

        <Navbar />

        <div
          style={{
            padding: "30px",
          }}
        >
          {/* ======================================
              Header
          ====================================== */}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "20px",
              flexWrap: "wrap",
              marginBottom: "25px",
            }}
          >
            <div>
              <h1
                style={{
                  color: "#1e293b",
                  margin: 0,
                }}
              >
                📋 Build History
              </h1>

              <p
                style={{
                  color: "#64748b",
                  marginTop: "8px",
                  marginBottom: 0,
                }}
              >
                View, search and filter pipeline
                builds.
              </p>
            </div>

            <div
              style={{
                background: "#ffffff",
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                color: "#475569",
                fontWeight: "600",
              }}
            >
              Total Builds:{" "}
              <span
                style={{
                  color: "#2563eb",
                }}
              >
                {pagination.totalBuilds}
              </span>
            </div>
          </div>

          {/* ======================================
              Search + Filters
          ====================================== */}

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              marginBottom: "25px",
              boxShadow:
                "0 4px 10px rgba(0,0,0,0.05)",
              display: "flex",
              gap: "15px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {/* Search */}

            <input
              type="text"
              placeholder="Search build number, branch or commit..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              style={{
                padding: "12px",
                minWidth: "280px",
                flex: "1 1 300px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                outline: "none",
              }}
            />

            {/* Status Filter */}

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value="All">
                All Status
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

            {/* Sort */}

            <select
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value)
              }
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value="newest">
                Newest First
              </option>

              <option value="oldest">
                Oldest First
              </option>
            </select>

            {/* Page Size */}

            <select
              value={limit}
              onChange={(e) =>
                setLimit(
                  Number(e.target.value)
                )
              }
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
              }}
            >
              <option value={10}>
                10 per page
              </option>

              <option value={20}>
                20 per page
              </option>

              <option value={50}>
                50 per page
              </option>
            </select>

            {/* Clear Filters */}

            <button
              onClick={clearFilters}
              style={{
                padding: "12px 18px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                color: "#334155",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Clear Filters
            </button>
          </div>

          {/* ======================================
              Error
          ====================================== */}

          {error && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                padding: "14px 16px",
                borderRadius: "10px",
                marginBottom: "20px",
              }}
            >
              {error}
            </div>
          )}

          {/* ======================================
              Loading
          ====================================== */}

          {loading ? (
            <div
              style={{
                background: "#ffffff",
                padding: "30px",
                borderRadius: "12px",
                textAlign: "center",
                color: "#475569",
              }}
            >
              <h3
                style={{
                  margin: 0,
                }}
              >
                Loading Build History...
              </h3>
            </div>
          ) : builds.length === 0 ? (
            /* ======================================
                No Builds
            ====================================== */

            <div
              style={{
                background: "#ffffff",
                padding: "40px",
                borderRadius: "12px",
                textAlign: "center",
                boxShadow:
                  "0 4px 10px rgba(0,0,0,0.05)",
              }}
            >
              <h3
                style={{
                  color: "#334155",
                  marginBottom: "10px",
                }}
              >
                No Builds Found
              </h3>

              <p
                style={{
                  color: "#64748b",
                  marginBottom: "20px",
                }}
              >
                No builds match the selected
                search or filters.
              </p>

              <button
                onClick={clearFilters}
                style={{
                  background: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              {/* ======================================
                  Build Cards
              ====================================== */}

              {builds.map((build) => (
                <div
                  key={build._id}
                  style={{
                    background: "#ffffff",
                    padding: "25px",
                    borderRadius: "12px",
                    marginBottom: "20px",
                    boxShadow:
                      "0 4px 10px rgba(0,0,0,0.08)",
                    border:
                      "1px solid #e2e8f0",
                  }}
                >
                  {/* Card Header */}

                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems: "center",
                      gap: "15px",
                      flexWrap: "wrap",
                      marginBottom: "20px",
                    }}
                  >
                    <h2
                      style={{
                        margin: 0,
                        color: "#1e293b",
                      }}
                    >
                      🚀 Build #
                      {build.buildNumber}
                    </h2>

                    <span
                      style={{
                        color: statusColor(
                          build.status
                        ),
                        background:
                          statusBackground(
                            build.status
                          ),
                        fontWeight: "700",
                        padding: "7px 13px",
                        borderRadius: "20px",
                        fontSize: "14px",
                      }}
                    >
                      {build.status}
                    </span>
                  </div>

                  {/* Build Information */}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(230px, 1fr))",
                      gap: "12px 25px",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Pipeline:
                      </strong>{" "}
                      {build.pipeline?.name ||
                        "Deleted Pipeline"}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Repository:
                      </strong>{" "}
                      {build.pipeline
                        ?.repository || "-"}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Branch:
                      </strong>{" "}
                      {build.branch || "-"}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Commit ID:
                      </strong>{" "}
                      {build.commitId || "-"}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Stage:
                      </strong>{" "}
                      {build.stage || "-"}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Duration:
                      </strong>{" "}
                      {build.duration !==
                        undefined &&
                      build.duration !== null
                        ? `${build.duration} sec`
                        : "-"}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Started:
                      </strong>{" "}
                      {formatDate(
                        build.startedAt
                      )}
                    </p>

                    <p
                      style={{
                        margin: 0,
                      }}
                    >
                      <strong>
                        Finished:
                      </strong>{" "}
                      {build.finishedAt
                        ? formatDate(
                            build.finishedAt
                          )
                        : build.status ===
                            "Running"
                          ? "Running..."
                          : "-"}
                    </p>
                  </div>

                  {/* Error */}

                  {build.error && (
                    <div
                      style={{
                        marginTop: "18px",
                        padding: "12px 15px",
                        borderRadius: "8px",
                        background: "#fef2f2",
                        border:
                          "1px solid #fecaca",
                        color: "#991b1b",
                        wordBreak: "break-word",
                      }}
                    >
                      <strong>Error:</strong>{" "}
                      {build.error}
                    </div>
                  )}

                  {/* Actions */}

                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      marginTop: "20px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() =>
                        navigate(
                          `/pipeline-logs/${build._id}`
                        )
                      }
                      style={{
                        background: "#2563eb",
                        color: "#ffffff",
                        border: "none",
                        padding: "10px 18px",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: "700",
                      }}
                    >
                      View Logs
                    </button>
                  </div>
                </div>
              ))}

              {/* ======================================
                  Pagination
              ====================================== */}

              <div
                style={{
                  background: "#ffffff",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  marginTop: "25px",
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  gap: "15px",
                  flexWrap: "wrap",
                  boxShadow:
                    "0 4px 10px rgba(0,0,0,0.05)",
                }}
              >
                {/* Previous */}

                <button
                  onClick={
                    handlePreviousPage
                  }
                  disabled={
                    !pagination.hasPreviousPage ||
                    loading
                  }
                  style={{
                    background:
                      pagination.hasPreviousPage
                        ? "#2563eb"
                        : "#cbd5e1",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    cursor:
                      pagination.hasPreviousPage
                        ? "pointer"
                        : "not-allowed",
                    fontWeight: "700",
                  }}
                >
                  ← Previous
                </button>

                {/* Page Information */}

                <div
                  style={{
                    textAlign: "center",
                    color: "#475569",
                    lineHeight: "1.6",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "700",
                      color: "#1e293b",
                    }}
                  >
                    Page{" "}
                    {pagination.page || page}{" "}
                    of{" "}
                    {pagination.totalPages ||
                      0}
                  </div>

                  <div
                    style={{
                      fontSize: "14px",
                    }}
                  >
                    {
                      pagination.totalBuilds
                    }{" "}
                    total build
                    {pagination.totalBuilds ===
                    1
                      ? ""
                      : "s"}
                  </div>
                </div>

                {/* Next */}

                <button
                  onClick={handleNextPage}
                  disabled={
                    !pagination.hasNextPage ||
                    loading
                  }
                  style={{
                    background:
                      pagination.hasNextPage
                        ? "#2563eb"
                        : "#cbd5e1",
                    color: "#ffffff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    cursor:
                      pagination.hasNextPage
                        ? "pointer"
                        : "not-allowed",
                    fontWeight: "700",
                  }}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default BuildHistory;