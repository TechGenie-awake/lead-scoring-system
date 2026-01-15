const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const Lead = require('./models/Lead');
const Event = require('./models/Event');
const ScoreHistory = require('./models/ScoreHistory');
const ScoringRule = require('./models/ScoringRule');
const scoringEngine = require('./services/scoringEngine');
const eventQueue = require('./services/eventQueue');
const uploadRoutes = require('./routes/upload');
const { initWebSocket, emitScoreUpdate } = require('./services/websocket');
const { validateEvent, validateLead, validateBatchEvents } = require('./middleware/validation');
const { errorHandler, notFoundHandler, asyncHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
initWebSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Upload routes (must be after body parsers)
app.use('/api/events', uploadRoutes);

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lead-scoring')
  .then(() => {
    console.log('✓ Connected to MongoDB');
    scoringEngine.initializeScoringRules();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// ============= LEAD ROUTES =============

// Get all leads with pagination
app.get('/api/leads', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, minScore, maxScore, status } = req.query;
  
  const query = {};
  if (search) {
    query.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { company: new RegExp(search, 'i') }
    ];
  }
  if (minScore) query.currentScore = { ...query.currentScore, $gte: parseInt(minScore) };
  if (maxScore) query.currentScore = { ...query.currentScore, $lte: parseInt(maxScore) };
  if (status) query.status = status;

  const leads = await Lead.find(query)
    .sort({ currentScore: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const total = await Lead.countDocuments(query);

  res.json({
    leads,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit)
  });
}));

// Get single lead with details
app.get('/api/leads/:id', asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  res.json(lead);
}));

// Create new lead - WITH VALIDATION
app.post('/api/leads', validateLead, asyncHandler(async (req, res) => {
  const { name, email, company, status } = req.body;
  
  const existingLead = await Lead.findOne({ email });
  if (existingLead) {
    return res.status(409).json({ 
      error: 'Lead with this email already exists',
      existingLeadId: existingLead._id
    });
  }

  const lead = new Lead({ name, email, company, status });
  await lead.save();
  
  res.status(201).json(lead);
}));

// Update lead - WITH VALIDATION
app.put('/api/leads/:id', validateLead, asyncHandler(async (req, res) => {
  const { name, email, company, status } = req.body;
  
  // Check if email is being changed to one that already exists
  if (email) {
    const existingLead = await Lead.findOne({ 
      email, 
      _id: { $ne: req.params.id } 
    });
    if (existingLead) {
      return res.status(409).json({ 
        error: 'Another lead with this email already exists' 
      });
    }
  }
  
  const lead = await Lead.findByIdAndUpdate(
    req.params.id,
    { name, email, company, status, updatedAt: Date.now() },
    { new: true, runValidators: true }
  );
  
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  res.json(lead);
}));

// Delete lead
app.delete('/api/leads/:id', asyncHandler(async (req, res) => {
  const lead = await Lead.findByIdAndDelete(req.params.id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  // Also delete related events and history
  await Event.deleteMany({ leadId: req.params.id });
  await ScoreHistory.deleteMany({ leadId: req.params.id });
  
  res.json({ 
    message: 'Lead deleted successfully',
    deletedLead: lead.name 
  });
}));

// Get leaderboard (top scored leads)
app.get('/api/leaderboard', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const leads = await Lead.find()
    .sort({ currentScore: -1 })
    .limit(parseInt(limit));
  
  res.json(leads);
}));

// ============= EVENT ROUTES =============

// Submit single event (webhook/API) - WITH VALIDATION
app.post('/api/events', validateEvent, asyncHandler(async (req, res) => {
  const { eventId, eventType, leadId, timestamp, metadata, sync } = req.body;

  // If sync=true, process immediately (for testing/urgent events)
  if (sync === true) {
    const result = await scoringEngine.processEvent({
      eventId,
      eventType,
      leadId,
      timestamp: timestamp || new Date(),
      metadata: metadata || {}
    });
    return res.status(result.duplicate ? 200 : 201).json(result);
  }

  // Default: Queue for async processing
  const result = await eventQueue.addEvent({
    eventId,
    eventType,
    leadId,
    timestamp: timestamp || new Date(),
    metadata: metadata || {}
  });

  res.status(202).json(result);
}));

// Batch event upload - WITH VALIDATION
app.post('/api/events/batch', validateBatchEvents, asyncHandler(async (req, res) => {
  const { events, sync } = req.body;
  
  // If sync=true, process immediately
  if (sync === true) {
    const result = await scoringEngine.processBatch(events);
    return res.json(result);
  }
  
  // Default: Queue for async processing
  const result = await eventQueue.addBatch(events);
  res.status(202).json(result);
}));

// Get events for a lead
app.get('/api/leads/:id/events', asyncHandler(async (req, res) => {
  const events = await Event.find({ leadId: req.params.id })
    .sort({ timestamp: -1 })
    .limit(100);
  
  res.json(events);
}));

// Get score history for a lead
app.get('/api/leads/:id/history', asyncHandler(async (req, res) => {
  const history = await ScoreHistory.find({ leadId: req.params.id })
    .sort({ timestamp: 1 });
  
  res.json(history);
}));

// ============= SCORING RULES ROUTES =============

// Get all scoring rules
app.get('/api/rules', asyncHandler(async (req, res) => {
  const rules = await ScoringRule.find().sort({ eventType: 1 });
  res.json(rules);
}));

// Update scoring rule
app.put('/api/rules/:eventType', asyncHandler(async (req, res) => {
  const { points, active, description } = req.body;
  
  // Validation
  if (points !== undefined && (typeof points !== 'number' || isNaN(points))) {
    return res.status(400).json({ error: 'points must be a valid number' });
  }
  
  if (active !== undefined && typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be a boolean' });
  }
  
  const rule = await ScoringRule.findOneAndUpdate(
    { eventType: req.params.eventType },
    { points, active, description, updatedAt: Date.now() },
    { new: true, runValidators: true }
  );
  
  if (!rule) {
    return res.status(404).json({ 
      error: 'Scoring rule not found',
      eventType: req.params.eventType 
    });
  }
  
  res.json(rule);
}));

// ============= EXPORT FUNCTIONALITY =============

// Export all leads as CSV
app.get('/api/export/leads', asyncHandler(async (req, res) => {
  const leads = await Lead.find({}).sort({ currentScore: -1 });
  
  // CSV header
  let csv = 'Name,Email,Company,Score,Status,Created\n';
  
  // CSV rows
  leads.forEach(lead => {
    csv += `"${lead.name}","${lead.email}","${lead.company || ''}",${lead.currentScore},"${lead.status}","${new Date(lead.createdAt).toISOString()}"\n`;
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  res.send(csv);
}));

// Export events for a lead as CSV
app.get('/api/export/events/:leadId', asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.leadId);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  const events = await Event.find({ leadId: req.params.leadId }).sort({ timestamp: -1 });
  
  // CSV header
  let csv = 'Event ID,Event Type,Timestamp,Processed,Metadata\n';
  
  // CSV rows
  events.forEach(event => {
    const metadata = JSON.stringify(event.metadata || {}).replace(/"/g, '""');
    csv += `"${event.eventId}","${event.eventType}","${new Date(event.timestamp).toISOString()}","${event.processed}","${metadata}"\n`;
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=events-${lead.name.replace(/\s+/g, '-')}.csv`);
  res.send(csv);
}));

// ============= UTILITY ROUTES =============

// Recalculate lead score
app.post('/api/leads/:id/recalculate', asyncHandler(async (req, res) => {
  const result = await scoringEngine.recalculateLeadScore(req.params.id);
  res.json(result);
}));

// Replay all events (recalculate all leads) - BONUS FEATURE
app.post('/api/replay', asyncHandler(async (req, res) => {
  const leads = await Lead.find({});
  const results = [];

  for (const lead of leads) {
    const result = await scoringEngine.recalculateLeadScore(lead._id);
    results.push({
      leadId: lead._id,
      leadName: lead.name,
      previousScore: result.previousScore,
      newScore: result.newScore,
      change: result.newScore - result.previousScore,
      eventsProcessed: result.eventsProcessed
    });
  }

  res.json({
    success: true,
    message: `Recalculated scores for ${leads.length} leads`,
    results
  });
}));

// ============= QUEUE MONITORING =============

// Get queue statistics
app.get('/api/queue/stats', asyncHandler(async (req, res) => {
  const stats = await eventQueue.getQueueStats();
  res.json(stats);
}));

// Get job status by ID
app.get('/api/queue/job/:jobId', asyncHandler(async (req, res) => {
  const status = await eventQueue.getJobStatus(req.params.jobId);
  if (status.error) {
    return res.status(404).json(status);
  }
  res.json(status);
}));

// Clear completed jobs (utility)
app.post('/api/queue/clean', asyncHandler(async (req, res) => {
  const result = await eventQueue.clearCompleted();
  res.json(result);
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ============= ERROR HANDLING =============

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// ============= SERVER START =============

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ WebSocket ready for real-time updates`);
  console.log(`✓ Event queue ready for async processing`);
  console.log(`✓ Validation and error handling enabled`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await eventQueue.closeQueue();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await eventQueue.closeQueue();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});