import mongoose from 'mongoose';

/**
 * Outgoing calls to partner products (Loyvexa today). Written in the same
 * request that changed the data, delivered by services/loyvexa.js with
 * retries, so a slow or offline partner never blocks an order.
 */
const integrationOutboxSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  target: { type: String, enum: ['loyvexa'], default: 'loyvexa' },
  path: { type: String, required: true },          // e.g. /api/connect/royal
  body: { type: mongoose.Schema.Types.Mixed, required: true },
  dedupeKey: { type: String },                     // same key = same message (e.g. order + status)
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  sentAt: { type: Date, index: true },
  lastError: String,
}, { timestamps: true });

integrationOutboxSchema.index({ companyId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
integrationOutboxSchema.index({ sentAt: 1, nextAttemptAt: 1 });

export default mongoose.model('IntegrationOutbox', integrationOutboxSchema);
