const mongoose = require('mongoose');

// Validate event data
function validateEvent(req, res, next) {
  const { eventId, eventType, leadId, timestamp } = req.body;

  const errors = [];

  if (!eventId || typeof eventId !== 'string') {
    errors.push('eventId is required and must be a string');
  }

  if (!eventType || typeof eventType !== 'string') {
    errors.push('eventType is required and must be a string');
  }

  const validEventTypes = ['email_open', 'page_view', 'form_submission', 'demo_request', 'purchase'];
  if (eventType && !validEventTypes.includes(eventType)) {
    errors.push(`eventType must be one of: ${validEventTypes.join(', ')}`);
  }

  if (!leadId || typeof leadId !== 'string') {
    errors.push('leadId is required and must be a string');
  }

  if (leadId && !mongoose.Types.ObjectId.isValid(leadId)) {
    errors.push('leadId must be a valid MongoDB ObjectId');
  }

  if (timestamp && isNaN(new Date(timestamp).getTime())) {
    errors.push('timestamp must be a valid ISO 8601 date string');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors 
    });
  }

  next();
}

// Validate lead data
function validateLead(req, res, next) {
  const { name, email } = req.body;
  const errors = [];

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name is required and cannot be empty');
  }

  if (!email || typeof email !== 'string') {
    errors.push('email is required');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) {
    errors.push('email must be a valid email address');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors 
    });
  }

  next();
}

// Validate batch events
function validateBatchEvents(req, res, next) {
  const { events } = req.body;

  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ 
      error: 'events must be an array' 
    });
  }

  if (events.length === 0) {
    return res.status(400).json({ 
      error: 'events array cannot be empty' 
    });
  }

  if (events.length > 1000) {
    return res.status(400).json({ 
      error: 'Maximum 1000 events allowed per batch' 
    });
  }

  const validEventTypes = ['email_open', 'page_view', 'form_submission', 'demo_request', 'purchase'];
  const errors = [];

  events.forEach((event, index) => {
    if (!event.eventId) {
      errors.push(`Event ${index}: eventId is required`);
    }
    if (!event.eventType || !validEventTypes.includes(event.eventType)) {
      errors.push(`Event ${index}: invalid eventType`);
    }
    if (!event.leadId || !mongoose.Types.ObjectId.isValid(event.leadId)) {
      errors.push(`Event ${index}: invalid leadId`);
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'Batch validation failed',
      details: errors.slice(0, 10), // Only show first 10 errors
      totalErrors: errors.length
    });
  }

  next();
}

module.exports = {
  validateEvent,
  validateLead,
  validateBatchEvents
};