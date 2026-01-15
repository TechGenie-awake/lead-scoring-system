const mongoose = require('mongoose');
require('dotenv').config();

const Lead = require('./models/Lead');
const Event = require('./models/Event');
const ScoreHistory = require('./models/ScoreHistory');
const ScoringRule = require('./models/ScoringRule');
const scoringEngine = require('./services/scoringEngine');

const sampleLeads = [
  { name: 'Alice Johnson', email: 'alice@techcorp.com', company: 'TechCorp', status: 'qualified' },
  { name: 'Bob Smith', email: 'bob@startupco.io', company: 'StartupCo', status: 'new' },
  { name: 'Carol Williams', email: 'carol@enterprise.com', company: 'Enterprise Inc', status: 'contacted' },
  { name: 'David Brown', email: 'david@innovate.com', company: 'Innovate Labs', status: 'qualified' },
  { name: 'Eve Davis', email: 'eve@business.com', company: 'Business Solutions', status: 'new' },
  { name: 'Frank Miller', email: 'frank@digital.com', company: 'Digital Agency', status: 'contacted' },
  { name: 'Grace Lee', email: 'grace@commerce.com', company: 'Commerce Plus', status: 'qualified' },
  { name: 'Henry Wilson', email: 'henry@consulting.com', company: 'Wilson Consulting', status: 'converted' }
];

const eventTypes = ['email_open', 'page_view', 'form_submission', 'demo_request', 'purchase'];

function generateRandomEvents(leadId, count = 10) {
  const events = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const timestamp = new Date(now - (daysAgo * 24 * 60 * 60 * 1000));
    
    events.push({
      eventId: `evt_${leadId}_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      leadId: leadId,
      timestamp: timestamp,
      metadata: {
        source: 'seed_script',
        random: Math.random()
      }
    });
  }
  
  return events;
}

async function seed() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lead-scoring');
    console.log('✓ Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await Lead.deleteMany({});
    await Event.deleteMany({});
    await ScoreHistory.deleteMany({});
    await ScoringRule.deleteMany({});

    // Initialize scoring rules
    console.log('Creating scoring rules...');
    await scoringEngine.initializeScoringRules();

    // Create leads
    console.log('Creating leads...');
    const createdLeads = [];
    for (const leadData of sampleLeads) {
      const lead = new Lead(leadData);
      await lead.save();
      createdLeads.push(lead);
      console.log(`  ✓ Created lead: ${lead.name}`);
    }

    // Generate and process events for each lead
    console.log('\nGenerating and processing events...');
    for (const lead of createdLeads) {
      const eventCount = Math.floor(Math.random() * 15) + 5; // 5-20 events per lead
      const events = generateRandomEvents(lead._id.toString(), eventCount);
      
      console.log(`  Processing ${events.length} events for ${lead.name}...`);
      const result = await scoringEngine.processBatch(events);
      console.log(`    ✓ Processed: ${result.processed}, Duplicates: ${result.duplicates}, Failed: ${result.failed}`);
    }

    // Display final scores
    console.log('\n📊 Final Lead Scores:');
    const finalLeads = await Lead.find().sort({ currentScore: -1 });
    finalLeads.forEach((lead, index) => {
      console.log(`  ${index + 1}. ${lead.name.padEnd(20)} - ${lead.currentScore} points`);
    });

    console.log('\n✓ Seed completed successfully!');
    console.log(`✓ Created ${createdLeads.length} leads`);
    console.log(`✓ Total events: ${await Event.countDocuments()}`);
    console.log(`✓ Total history entries: ${await ScoreHistory.countDocuments()}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seed();