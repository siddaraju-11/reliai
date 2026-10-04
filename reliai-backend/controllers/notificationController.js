const Notification = require("../models/Notification");

// ======================================================
// GET NOTIFICATIONS
// ======================================================

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({
      user: userId,
    })
      .populate("pipeline", "name status branch repository")
      .sort({ createdAt: -1 })
      .lean();

    const unreadCount = notifications.reduce(
      (count, notification) =>
        notification.isRead ? count : count + 1,
      0
    );

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Get notifications error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to load notifications.",
    });
  }
};

// ======================================================
// GET UNREAD NOTIFICATION COUNT
// ======================================================

exports.getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Get unread count error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to load unread notification count.",
    });
  }
};

// ======================================================
// MARK ONE NOTIFICATION AS READ
// ======================================================

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
      },
      {
        $set: {
          isRead: true,
        },
      },
      {
        returnDocument: "after",
      }
    ).populate(
      "pipeline",
      "name status branch repository"
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Mark as read error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read.",
    });
  }
};

// ======================================================
// MARK ALL NOTIFICATIONS AS READ
// ======================================================

exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        user: req.user._id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      modifiedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Mark all as read error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read.",
    });
  }
};

// ======================================================
// DELETE NOTIFICATION
// ======================================================

exports.deleteNotification = async (req, res) => {
  try {
    const notification =
      await Notification.findOneAndDelete({
        _id: req.params.id,
        user: req.user._id,
      });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Delete notification error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete notification.",
    });
  }
};

// ======================================================
// DELETE ALL NOTIFICATIONS
// ======================================================

exports.deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      user: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "All notifications deleted successfully.",
      deletedCount: result.deletedCount || 0,
    });
  } catch (error) {
    console.error(
      "[NOTIFICATION] Delete all notifications error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete notifications.",
    });
  }
};