const mongoose = require("mongoose");

const webhookDeliverySchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      default: "GITHUB",
      uppercase: true,
      trim: true,
    },

    deliveryId: {
      type: String,
      required: true,
      trim: true,
    },

    event: {
      type: String,
      default: null,
      trim: true,
    },

    repository: {
      type: String,
      default: null,
      trim: true,
    },

    ref: {
      type: String,
      default: null,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "PROCESSING",
        "PROCESSED",
        "FAILED",
      ],
      default: "PROCESSING",
      required: true,
    },

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    error: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One GitHub delivery may only exist once.
webhookDeliverySchema.index(
  {
    provider: 1,
    deliveryId: 1,
  },
  {
    unique: true,
  }
);

// Automatically remove old delivery records after 7 days.
// They are only needed for webhook idempotency.
webhookDeliverySchema.index(
  {
    createdAt: 1,
  },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60,
  }
);

module.exports = mongoose.model(
  "WebhookDelivery",
  webhookDeliverySchema
);