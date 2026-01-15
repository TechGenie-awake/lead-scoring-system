const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { 
    type: String, 
    required: true,
    enum: ['email_open', 'page_view', 'form_submission', 'demo_request', 'purchase']
  },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  timestamp: { type: Date, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

eventSchema.index({ eventId: 1 }, { unique: true });
eventSchema.index({ leadId: 1, timestamp: -1 });
eventSchema.index({ processed: 1 });

module.exports = mongoose.model('Event', eventSchema);
