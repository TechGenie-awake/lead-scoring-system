const express = require('express');
const multer = require('multer');
const router = express.Router();
const Lead = require('../models/Lead');
const scoringEngine = require('../services/scoringEngine');

// Configure multer for file upload (store in memory)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'));
    }
  }
});

// Parse CSV content
function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const events = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length !== headers.length) continue;

    const event = {};
    headers.forEach((header, index) => {
      event[header] = values[index];
    });

    events.push({
      eventId: event.eventId || `csv_${Date.now()}_${i}`,
      eventType: event.eventType,
      leadEmail: event.leadEmail,
      timestamp: event.timestamp || new Date().toISOString(),
      metadata: {
        source: event.source || 'csv_upload',
        page: event.page,
        campaign: event.campaign
      }
    });
  }

  return events;
}

// CSV Upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf8');
    let events;

    // Parse based on file type
    if (req.file.mimetype === 'text/csv') {
      events = parseCSV(fileContent);
    } else if (req.file.mimetype === 'application/json') {
      events = JSON.parse(fileContent);
      if (!Array.isArray(events)) {
        return res.status(400).json({ error: 'JSON file must contain an array of events' });
      }
    }

    if (!events || events.length === 0) {
      return res.status(400).json({ error: 'No valid events found in file' });
    }

    // Get all leads to map emails to IDs
    const leads = await Lead.find({});
    const emailToId = {};
    leads.forEach(lead => {
      emailToId[lead.email.toLowerCase()] = lead._id.toString();
    });

    // Convert email to leadId
    const eventsWithIds = events
      .map(event => ({
        ...event,
        leadId: emailToId[event.leadEmail?.toLowerCase()]
      }))
      .filter(event => event.leadId); // Only include events with valid leads

    if (eventsWithIds.length === 0) {
      return res.status(400).json({ 
        error: 'No events matched existing leads',
        hint: 'Check that lead emails in CSV match leads in database'
      });
    }

    // Remove leadEmail from events (not needed anymore)
    eventsWithIds.forEach(event => delete event.leadEmail);

    // Process batch
    const result = await scoringEngine.processBatch(eventsWithIds);

    res.json({
      success: true,
      message: `Processed ${result.processed} events from file`,
      stats: {
        totalInFile: events.length,
        matchedLeads: eventsWithIds.length,
        processed: result.processed,
        duplicates: result.duplicates,
        failed: result.failed,
        unmatchedEmails: events.length - eventsWithIds.length
      },
      errors: result.errors
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process file',
      message: error.message 
    });
  }
});

module.exports = router;
