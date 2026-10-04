const express = require("express");
const router = express.Router();

const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} = require("../controllers/notificationController");

const {
  protect,
} = require("../middleware/authMiddleware");

// ======================================================
// NOTIFICATION ROUTES
// ======================================================

// Get all notifications
router.get("/", protect, getNotifications);

// Get unread notification count
router.get("/unread-count", protect, getUnreadCount);

// Mark all notifications as read
router.put("/read-all", protect, markAllAsRead);

// Delete all notifications
router.delete("/all", protect, deleteAllNotifications);

// Mark one notification as read
router.put("/:id/read", protect, markAsRead);

// Delete one notification
router.delete("/:id", protect, deleteNotification);

module.exports = router;