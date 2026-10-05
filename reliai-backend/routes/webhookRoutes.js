const express = require("express");

const {
  handleGitHubWebhook,
} = require("../controllers/webhookController");

const router = express.Router();

// ======================================================
// IMPORTANT
//
// Do NOT add:
//   express.json()
//   protect
//
// here.
//
// GitHub authenticates this endpoint using the
// X-Hub-Signature-256 HMAC signature.
// server.js provides express.raw() for this route.
// ======================================================

router.post(
  "/github",
  handleGitHubWebhook
);

module.exports = router;