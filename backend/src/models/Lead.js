const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  company: { type: String },
  currentScore: { type: Number, default: 0, min: 0 },
  status: { 
    type: String, 
    enum: ['new', 'contacted', 'qualified', 'converted', 'lost'],
    default: 'new'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

leadSchema.index({ email: 1 });
leadSchema.index({ currentScore: -1 });

module.exports = mongoose.model('Lead', leadSchema);
