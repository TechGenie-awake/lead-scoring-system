const Lead = require("../models/Lead");
const Event = require("../models/Event");
const ScoreHistory = require("../models/ScoreHistory");
const ScoringRule = require("../models/ScoringRule");
const { emitScoreUpdate } = require("./websocket");

const MAX_SCORE = parseInt(process.env.MAX_SCORE) || 1000;

class ScoringEngine {
  async processEvent(eventData) {
    const { eventId, eventType, leadId, timestamp, metadata = {} } = eventData;

    try {
      const existingEvent = await Event.findOne({ eventId });
      if (existingEvent && existingEvent.processed) {
        console.log(`Event ${eventId} already processed, skipping`);
        return {
          success: true,
          duplicate: true,
          message: "Event already processed",
        };
      }

      const lead = await Lead.findById(leadId);
      if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
      }

      const rule = await ScoringRule.findOne({ eventType, active: true });
      if (!rule) {
        throw new Error(
          `No active scoring rule found for event type: ${eventType}`
        );
      }

      let event;
      if (existingEvent) {
        event = existingEvent;
      } else {
        event = new Event({
          eventId,
          eventType,
          leadId,
          timestamp: timestamp || new Date(),
          metadata,
        });
        await event.save();
      }

      // **KEY IMPROVEMENT: Check if this is an out-of-order event**
      const eventTimestamp = new Date(event.timestamp);
      const latestHistory = await ScoreHistory.findOne({ leadId })
        .sort({ timestamp: -1 })
        .limit(1);

      const isOutOfOrder =
        latestHistory && eventTimestamp < new Date(latestHistory.timestamp);

      if (isOutOfOrder) {
        console.log(
          `⚠️ Out-of-order event detected for ${lead.name}. Recalculating scores...`
        );

        event.processed = true;
        event.processedAt = new Date();
        await event.save();

        const recalcResult = await this.recalculateLeadScore(leadId);

        emitScoreUpdate({
          leadId: lead._id,
          leadName: lead.name,
          leadEmail: lead.email,
          previousScore: recalcResult.previousScore,
          newScore: recalcResult.newScore,
          change: recalcResult.newScore - recalcResult.previousScore,
          eventType,
          timestamp: event.timestamp,
          outOfOrder: true,
        });

        return {
          success: true,
          outOfOrder: true,
          leadId: lead._id,
          previousScore: recalcResult.previousScore,
          newScore: recalcResult.newScore,
          change: recalcResult.newScore - recalcResult.previousScore,
          eventType,
          message: "Out-of-order event processed, scores recalculated",
        };
      }

      const previousScore = lead.currentScore;
      let newScore = previousScore + rule.points;

      if (newScore > MAX_SCORE) {
        newScore = MAX_SCORE;
      }
      if (newScore < 0) {
        newScore = 0;
      }

      lead.currentScore = newScore;
      lead.updatedAt = new Date();
      await lead.save();

      const historyEntry = new ScoreHistory({
        leadId: lead._id,
        score: newScore,
        previousScore,
        change,
        eventId,
        eventType,
        reason: `${eventType} (+${rule.points} points)`,
        timestamp: event.timestamp,
      });
      await historyEntry.save();

      event.processed = true;
      event.processedAt = new Date();
      await event.save();

      emitScoreUpdate({
        leadId: lead._id,
        leadName: lead.name,
        leadEmail: lead.email,
        previousScore,
        newScore,
        change,
        eventType,
        timestamp: event.timestamp,
      });

      console.log(
        `✓ Processed event ${eventId}: ${lead.name} score ${previousScore} → ${newScore}`
      );

      return {
        success: true,
        leadId: lead._id,
        previousScore,
        newScore,
        change,
        eventType,
      };
    } catch (error) {
      console.error("Error processing event:", error);
      throw error;
    }
  }

  async processBatch(events) {
    const sortedEvents = events.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const results = {
      processed: 0,
      failed: 0,
      duplicates: 0,
      errors: [],
    };

    for (const event of sortedEvents) {
      try {
        const result = await this.processEvent(event);
        if (result.duplicate) {
          results.duplicates++;
        } else {
          results.processed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          eventId: event.eventId,
          error: error.message,
        });
      }
    }

    return results;
  }

  async recalculateLeadScore(leadId) {
    const lead = await Lead.findById(leadId);
    if (!lead) {
      throw new Error("Lead not found");
    }

    const previousScore = lead.currentScore;

    // Get all processed events for this lead, sorted by timestamp
    const events = await Event.find({ leadId, processed: true }).sort({
      timestamp: 1,
    });

    let totalScore = 0;
    const newHistory = [];

    // Recalculate score step by step
    for (const event of events) {
      const rule = await ScoringRule.findOne({
        eventType: event.eventType,
        active: true,
      });

      if (rule) {
        const prevScore = totalScore;
        totalScore += rule.points;

        if (totalScore > MAX_SCORE) totalScore = MAX_SCORE;
        if (totalScore < 0) totalScore = 0;

        newHistory.push({
          leadId,
          score: totalScore,
          previousScore: prevScore,
          change: totalScore - prevScore,
          eventId: event.eventId,
          eventType: event.eventType,
          reason: `${event.eventType} (+${rule.points} points)`,
          timestamp: event.timestamp,
        });
      }
    }

    await ScoreHistory.deleteMany({ leadId });

    if (newHistory.length > 0) {
    await ScoreHistory.insertMany(newHistory);
    }

    lead.currentScore = totalScore;
    lead.updatedAt = new Date();
    await lead.save();

    console.log(
      `✓ Recalculated ${lead.name}: ${previousScore} → ${totalScore}`
    );

    return {
      leadId,
      previousScore,
      newScore: totalScore,
      eventsProcessed: events.length,
    };
  }

  async initializeScoringRules() {
    const defaultRules = [
      {
        eventType: "email_open",
        points: 10,
        description: "Lead opened an email",
      },
      { eventType: "page_view", points: 5, description: "Lead viewed a page" },
      {
        eventType: "form_submission",
        points: 20,
        description: "Lead submitted a form",
      },
      {
        eventType: "demo_request",
        points: 50,
        description: "Lead requested a demo",
      },
      {
        eventType: "purchase",
        points: 100,
        description: "Lead made a purchase",
      },
    ];

    for (const rule of defaultRules) {
      await ScoringRule.findOneAndUpdate({ eventType: rule.eventType }, rule, {
        upsert: true,
        new: true,
      });
    }

    console.log("✓ Scoring rules initialized");
  }
}

module.exports = new ScoringEngine();
