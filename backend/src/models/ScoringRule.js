const mongoose = require('mongoose');

const scoringRuleSchema = new mongoose.Schema({
  eventType: { 
    type: String, 
    required: true, 
    unique: true,
    enum: ['email_open', 'page_view', 'form_submission', 'demo_request', 'purchase']
  },
  points: { type: Number, required: true },
  active: { type: Boolean, default: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScoringRule', scoringRuleSchema);