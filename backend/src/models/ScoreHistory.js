const mongoose = require('mongoose');

const scoreHistorySchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  score: { type: Number, required: true },
  previousScore: { type: Number, required: true },
  change: { type: Number, required: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  reason: { type: String, required: true },
  timestamp: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

scoreHistorySchema.index({ leadId: 1, timestamp: -1 });

module.exports = mongoose.model('ScoreHistory', scoreHistorySchema);
