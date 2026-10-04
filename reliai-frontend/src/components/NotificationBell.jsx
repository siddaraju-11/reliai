import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

function NotificationBell() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);

  const [markingAll, setMarkingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // ====================================================
  // FETCH NOTIFICATIONS
  // ====================================================

  const fetchNotifications = async () => {
    try {
      const response = await API.get("/notification");

      const data = response.data || {};

      const notificationList = Array.isArray(data.notifications)
        ? data.notifications
        : [];

      setNotifications(notificationList);

      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      } else {
        const count = notificationList.filter(
          (notification) => !notification.isRead
        ).length;

        setUnreadCount(count);
      }
    } catch (error) {
      console.error(
        "Failed to fetch notifications:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  // ====================================================
  // INITIAL LOAD + TEMPORARY POLLING
  // ====================================================

  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // ====================================================
  // MARK ONE AS READ
  // ====================================================

  const markAsRead = async (id) => {
    try {
      const notification = notifications.find(
        (item) => item._id === id
      );

      if (!notification) {
        return;
      }

      if (notification.isRead) {
        return;
      }

      await API.put(`/notification/${id}/read`);

      setNotifications((previous) =>
        previous.map((item) =>
          item._id === id
            ? {
                ...item,
                isRead: true,
              }
            : item
        )
      );

      setUnreadCount((previous) =>
        Math.max(0, previous - 1)
      );
    } catch (error) {
      console.error(
        "Failed to mark notification as read:",
        error
      );
    }
  };

  // ====================================================
  // MARK ALL AS READ
  // ====================================================

  const markAllAsRead = async () => {
    if (unreadCount === 0) {
      return;
    }

    try {
      setMarkingAll(true);

      await API.put("/notification/read-all");

      setNotifications((previous) =>
        previous.map((notification) => ({
          ...notification,
          isRead: true,
        }))
      );

      setUnreadCount(0);
    } catch (error) {
      console.error(
        "Failed to mark all notifications as read:",
        error
      );
    } finally {
      setMarkingAll(false);
    }
  };

  // ====================================================
  // DELETE ONE NOTIFICATION
  // ====================================================

  const deleteNotification = async (id) => {
    try {
      const notification = notifications.find(
        (item) => item._id === id
      );

      await API.delete(`/notification/${id}`);

      setNotifications((previous) =>
        previous.filter(
          (item) => item._id !== id
        )
      );

      if (notification && !notification.isRead) {
        setUnreadCount((previous) =>
          Math.max(0, previous - 1)
        );
      }
    } catch (error) {
      console.error(
        "Failed to delete notification:",
        error
      );
    }
  };

  // ====================================================
  // DELETE ALL NOTIFICATIONS
  // ====================================================

  const deleteAllNotifications = async () => {
    if (notifications.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Delete all notifications?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingAll(true);

      await API.delete("/notification/all");

      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error(
        "Failed to delete all notifications:",
        error
      );
    } finally {
      setDeletingAll(false);
    }
  };

  // ====================================================
  // OPEN NOTIFICATION
  // ====================================================

  const openNotification = async (notification) => {
    try {
      if (!notification.isRead) {
        await markAsRead(notification._id);
      }

      const pipelineId =
        typeof notification.pipeline === "object"
          ? notification.pipeline?._id
          : notification.pipeline;

      if (!pipelineId) {
        return;
      }

      setShowDropdown(false);

      navigate(`/pipelines/${pipelineId}`);
    } catch (error) {
      console.error(
        "Failed to open notification:",
        error
      );
    }
  };

  // ====================================================
  // STATUS HELPERS
  // ====================================================

  const normalizeStatus = (status) => {
    return String(status || "")
      .trim()
      .toUpperCase();
  };

  const getStatusColor = (status) => {
    switch (normalizeStatus(status)) {
      case "SUCCESS":
        return "#16a34a";

      case "FAILED":
        return "#dc2626";

      case "RUNNING":
        return "#2563eb";

      case "PENDING":
        return "#f59e0b";

      case "CANCELLED":
        return "#7c3aed";

      default:
        return "#64748b";
    }
  };

  const getStatusBackground = (status) => {
    switch (normalizeStatus(status)) {
      case "SUCCESS":
        return "#f0fdf4";

      case "FAILED":
        return "#fef2f2";

      case "RUNNING":
        return "#eff6ff";

      case "PENDING":
        return "#fffbeb";

      case "CANCELLED":
        return "#faf5ff";

      default:
        return "#f8fafc";
    }
  };

  // ====================================================
  // TIME FORMATTER
  // ====================================================

  const formatTime = (date) => {
    if (!date) {
      return "";
    }

    const createdAt = new Date(date);

    const now = new Date();

    const difference =
      now.getTime() - createdAt.getTime();

    const seconds = Math.floor(
      difference / 1000
    );

    const minutes = Math.floor(
      seconds / 60
    );

    const hours = Math.floor(
      minutes / 60
    );

    const days = Math.floor(
      hours / 24
    );

    if (seconds < 60) {
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    if (hours < 24) {
      return `${hours}h ago`;
    }

    if (days < 7) {
      return `${days}d ago`;
    }

    return createdAt.toLocaleString();
  };

  // ====================================================
  // UI
  // ====================================================

  return (
    <div
      style={{
        position: "relative",
      }}
    >
      {/* ================================================= */}
      {/* NOTIFICATION BELL */}
      {/* ================================================= */}

      <button
        type="button"
        onClick={() =>
          setShowDropdown((previous) => !previous)
        }
        title="Notifications"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "24px",
          position: "relative",
          padding: "8px",
        }}
      >
        🔔

        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-2px",
              right: "-2px",
              background: "#dc2626",
              color: "#ffffff",
              borderRadius: "999px",
              minWidth: "20px",
              height: "20px",
              padding: "0 5px",
              fontSize: "11px",
              fontWeight: "bold",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              border: "2px solid white",
            }}
          >
            {unreadCount > 99
              ? "99+"
              : unreadCount}
          </span>
        )}
      </button>

      {/* ================================================= */}
      {/* DROPDOWN */}
      {/* ================================================= */}

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "50px",
            width: "400px",
            maxWidth: "90vw",
            background: "#ffffff",
            borderRadius: "12px",
            boxShadow:
              "0 15px 35px rgba(0,0,0,0.18)",
            zIndex: 9999,
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* ============================================= */}
          {/* HEADER */}
          {/* ============================================= */}

          <div
            style={{
              padding: "15px",
              borderBottom:
                "1px solid #e5e7eb",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: "700",
                  color: "#1e293b",
                  fontSize: "16px",
                }}
              >
                Notifications
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  marginTop: "3px",
                }}
              >
                {unreadCount === 0
                  ? "You're all caught up"
                  : `${unreadCount} unread`}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
              }}
            >
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  disabled={markingAll}
                  style={{
                    background:
                      "#eff6ff",
                    color: "#2563eb",
                    border:
                      "1px solid #bfdbfe",
                    padding:
                      "6px 9px",
                    borderRadius: "6px",
                    cursor:
                      markingAll
                        ? "not-allowed"
                        : "pointer",
                    fontSize: "11px",
                    fontWeight: "600",
                  }}
                >
                  {markingAll
                    ? "Updating..."
                    : "Mark all read"}
                </button>
              )}

              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={
                    deleteAllNotifications
                  }
                  disabled={deletingAll}
                  style={{
                    background:
                      "#fef2f2",
                    color: "#dc2626",
                    border:
                      "1px solid #fecaca",
                    padding:
                      "6px 9px",
                    borderRadius: "6px",
                    cursor:
                      deletingAll
                        ? "not-allowed"
                        : "pointer",
                    fontSize: "11px",
                    fontWeight: "600",
                  }}
                >
                  {deletingAll
                    ? "Deleting..."
                    : "Clear all"}
                </button>
              )}
            </div>
          </div>

          {/* ============================================= */}
          {/* CONTENT */}
          {/* ============================================= */}

          <div
            style={{
              maxHeight: "480px",
              overflowY: "auto",
            }}
          >
            {loading ? (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Loading notifications...
              </div>
            ) : notifications.length >
              0 ? (
              notifications.map(
                (notification) => {
                  const pipelineName =
                    typeof notification.pipeline ===
                      "object"
                      ? notification.pipeline
                          ?.name
                      : null;

                  return (
                    <div
                      key={
                        notification._id
                      }
                      style={{
                        padding: "15px",
                        borderBottom:
                          "1px solid #f1f5f9",
                        background:
                          notification.isRead
                            ? "#ffffff"
                            : "#f8fbff",
                      }}
                    >
                      {/* STATUS + TIME */}

                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            color:
                              getStatusColor(
                                notification.status
                              ),
                            background:
                              getStatusBackground(
                                notification.status
                              ),
                            padding:
                              "4px 8px",
                            borderRadius:
                              "6px",
                            fontSize:
                              "12px",
                            fontWeight:
                              "700",
                          }}
                        >
                          {
                            notification.status
                          }
                        </span>

                        <span
                          style={{
                            fontSize:
                              "11px",
                            color:
                              "#94a3b8",
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {formatTime(
                            notification.createdAt
                          )}
                        </span>
                      </div>

                      {/* PIPELINE */}

                      {pipelineName && (
                        <div
                          style={{
                            marginTop:
                              "9px",
                            fontSize:
                              "12px",
                            fontWeight:
                              "600",
                            color:
                              "#475569",
                          }}
                        >
                          Pipeline:{" "}
                          {pipelineName}
                        </div>
                      )}

                      {/* MESSAGE */}

                      <div
                        style={{
                          marginTop:
                            "7px",
                          color:
                            "#334155",
                          fontSize:
                            "14px",
                          lineHeight:
                            "1.5",
                        }}
                      >
                        {
                          notification.message
                        }
                      </div>

                      {/* ACTIONS */}

                      <div
                        style={{
                          marginTop:
                            "12px",
                          display:
                            "flex",
                          flexWrap:
                            "wrap",
                          gap: "8px",
                        }}
                      >
                        {!notification.isRead && (
                          <button
                            type="button"
                            onClick={() =>
                              markAsRead(
                                notification._id
                              )
                            }
                            style={{
                              background:
                                "#2563eb",
                              color:
                                "#ffffff",
                              border:
                                "none",
                              padding:
                                "6px 10px",
                              borderRadius:
                                "5px",
                              cursor:
                                "pointer",
                              fontSize:
                                "12px",
                            }}
                          >
                            Mark Read
                          </button>
                        )}

                        {notification.pipeline && (
                          <button
                            type="button"
                            onClick={() =>
                              openNotification(
                                notification
                              )
                            }
                            style={{
                              background:
                                "#f1f5f9",
                              color:
                                "#334155",
                              border:
                                "1px solid #cbd5e1",
                              padding:
                                "6px 10px",
                              borderRadius:
                                "5px",
                              cursor:
                                "pointer",
                              fontSize:
                                "12px",
                            }}
                          >
                            Open Pipeline
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            deleteNotification(
                              notification._id
                            )
                          }
                          style={{
                            background:
                              "#fef2f2",
                            color:
                              "#dc2626",
                            border:
                              "1px solid #fecaca",
                            padding:
                              "6px 10px",
                            borderRadius:
                              "5px",
                            cursor:
                              "pointer",
                            fontSize:
                              "12px",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                }
              )
            ) : (
              <div
                style={{
                  padding: "35px 20px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <div
                  style={{
                    fontSize: "28px",
                    marginBottom: "8px",
                  }}
                >
                  🔔
                </div>

                No notifications
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;