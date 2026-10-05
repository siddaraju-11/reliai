const {
  GitHubWebhookError,
  verifyGitHubSignature,
  parseWebhookPayload,
  processGitHubEvent,
} = require("../services/githubWebhookService");

// ======================================================
// GITHUB WEBHOOK
// POST /api/webhook/github
// ======================================================

exports.handleGitHubWebhook = async (
  req,
  res
) => {
  try {
    const signature =
      req.get(
        "x-hub-signature-256"
      );

    const event =
      req.get(
        "x-github-event"
      );

    const deliveryId =
      req.get(
        "x-github-delivery"
      );

    // ==================================================
    // VERIFY SIGNATURE BEFORE PARSING/TRUSTING PAYLOAD
    // ==================================================

    verifyGitHubSignature({
      rawBody: req.body,
      signature,
    });

    // ==================================================
    // PARSE VERIFIED BODY
    // ==================================================

    const payload =
      parseWebhookPayload(
        req.body
      );

    console.log("");
    console.log(
      "========================================="
    );
    console.log(
      "========== GITHUB WEBHOOK =============="
    );
    console.log(
      "========================================="
    );

    console.log(
      "[WEBHOOK] Delivery:",
      deliveryId || "N/A"
    );

    console.log(
      "[WEBHOOK] Event:",
      event || "unknown"
    );

    console.log(
      "[WEBHOOK] Repository:",
      payload?.repository?.full_name ||
        "N/A"
    );

    console.log(
      "[WEBHOOK] Ref:",
      payload?.ref ||
        "N/A"
    );

    // ==================================================
    // PROCESS EVENT
    // ==================================================

    const result =
      await processGitHubEvent({
        event,
        payload,
      });

    return res.status(202).json({
      success: true,

      deliveryId:
        deliveryId || null,

      event:
        event || null,

      ...result,
    });
  } catch (error) {
    console.error(
      "[WEBHOOK] GitHub webhook error:",
      error
    );

    if (
      error instanceof
      GitHubWebhookError
    ) {
      return res
        .status(
          error.statusCode ||
            400
        )
        .json({
          success: false,
          message:
            error.message,
          code:
            error.code,
        });
    }

    return res.status(500).json({
      success: false,

      message:
        "Failed to process GitHub webhook.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};