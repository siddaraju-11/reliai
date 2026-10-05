const WebhookDelivery = require("../models/WebhookDelivery");

const {
  GitHubWebhookError,
  verifyGitHubSignature,
  parseWebhookPayload,
  processGitHubEvent,
} = require("../services/githubWebhookService");

// ======================================================
// HELPERS
// ======================================================

const normalizeHeader = (value) => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const isDuplicateKeyError = (error) => {
  return Boolean(
    error &&
      (
        error.code === 11000 ||
        error.code === 11001
      )
  );
};

// ======================================================
// GITHUB WEBHOOK
// POST /api/webhook/github
// ======================================================

exports.handleGitHubWebhook = async (req, res) => {
  let deliveryRecord = null;

  try {
    const signature = normalizeHeader(
      req.get("x-hub-signature-256")
    );

    const event = normalizeHeader(
      req.get("x-github-event")
    );

    const deliveryId = normalizeHeader(
      req.get("x-github-delivery")
    );

    // ==================================================
    // VERIFY SIGNATURE FIRST
    // ==================================================

    verifyGitHubSignature({
      rawBody: req.body,
      signature,
    });

    // ==================================================
    // REQUIRE DELIVERY ID
    // ==================================================

    if (!deliveryId) {
      throw new GitHubWebhookError(
        "GitHub delivery ID is missing.",
        "MISSING_DELIVERY_ID",
        400
      );
    }

    // ==================================================
    // PARSE VERIFIED PAYLOAD
    // ==================================================

    const payload = parseWebhookPayload(
      req.body
    );

    const repository =
      payload?.repository?.full_name ||
      null;

    const ref =
      typeof payload?.ref === "string"
        ? payload.ref
        : null;

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
      deliveryId
    );

    console.log(
      "[WEBHOOK] Event:",
      event || "unknown"
    );

    console.log(
      "[WEBHOOK] Repository:",
      repository || "N/A"
    );

    console.log(
      "[WEBHOOK] Ref:",
      ref || "N/A"
    );

    // ==================================================
    // CLAIM DELIVERY
    //
    // The unique MongoDB index makes this atomic.
    // If two copies arrive simultaneously, only one
    // insert can succeed.
    // ==================================================

    try {
      deliveryRecord =
        await WebhookDelivery.create({
          provider: "GITHUB",
          deliveryId,
          event: event || null,
          repository,
          ref,
          status: "PROCESSING",
        });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existing =
        await WebhookDelivery.findOne({
          provider: "GITHUB",
          deliveryId,
        }).lean();

      console.log(
        "[WEBHOOK] Duplicate delivery ignored:",
        deliveryId
      );

      return res.status(200).json({
        success: true,
        accepted: true,
        duplicate: true,
        ignored: true,
        deliveryId,
        event: event || null,
        previousStatus:
          existing?.status || null,
        message:
          "GitHub webhook delivery was already received.",
      });
    }

    // ==================================================
    // PROCESS EVENT ONCE
    // ==================================================

    const result =
      await processGitHubEvent({
        event,
        payload,
      });

    // ==================================================
    // MARK DELIVERY PROCESSED
    // ==================================================

    await WebhookDelivery.updateOne(
      {
        _id: deliveryRecord._id,
      },
      {
        $set: {
          status: "PROCESSED",
          result,
          error: null,
          processedAt: new Date(),
        },
      }
    );

    return res.status(202).json({
      success: true,
      duplicate: false,
      deliveryId,
      event: event || null,
      ...result,
    });
  } catch (error) {
    console.error(
      "[WEBHOOK] GitHub webhook error:",
      error
    );

    // ==================================================
    // MARK CLAIMED DELIVERY FAILED
    // ==================================================

    if (deliveryRecord?._id) {
      try {
        await WebhookDelivery.updateOne(
          {
            _id: deliveryRecord._id,
          },
          {
            $set: {
              status: "FAILED",
              error:
                error.message ||
                "Webhook processing failed.",
              processedAt: new Date(),
            },
          }
        );
      } catch (updateError) {
        console.error(
          "[WEBHOOK] Failed to update delivery record:",
          updateError
        );
      }
    }

    if (
      error instanceof GitHubWebhookError
    ) {
      return res
        .status(
          error.statusCode || 400
        )
        .json({
          success: false,
          message: error.message,
          code: error.code,
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