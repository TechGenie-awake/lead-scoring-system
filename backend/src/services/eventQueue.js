const Bull = require('bull');
const scoringEngine = require('./scoringEngine');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const eventQueue = new Bull('lead-scoring-events', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000,
    },
    removeOnFail: false,
  },
});

eventQueue.process(5, async (job) => {
  const { eventData } = job.data;
  
  console.log(`🔄 Processing job ${job.id} - Event ${eventData.eventId}`);
  
  try {
    const result = await scoringEngine.processEvent(eventData);
    console.log(`✓ Job ${job.id} completed - ${eventData.eventType} for lead ${eventData.leadId}`);
    return result;
  } catch (error) {
    console.error(`✗ Job ${job.id} failed:`, error.message);
    throw error;
  }
});

eventQueue.on('completed', (job, result) => {
  if (result.duplicate) {
    console.log(`⊘ Duplicate event detected in job ${job.id}`);
  } else if (result.outOfOrder) {
    console.log(`⚠️  Out-of-order event processed in job ${job.id}`);
  }
});

eventQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
});

eventQueue.on('stalled', (job) => {
  console.warn(`⏸️  Job ${job.id} stalled`);
});

async function addEvent(eventData) {
  const job = await eventQueue.add(
    { eventData },
    {
      jobId: eventData.eventId,
      priority: getPriority(eventData.eventType),
    }
  );
  
  return {
    jobId: job.id,
    queued: true,
    message: 'Event queued for processing',
  };
}

async function addBatch(events) {
  const jobs = events.map((eventData) => ({
    data: { eventData },
    opts: {
      jobId: eventData.eventId,
      priority: getPriority(eventData.eventType),
    },
  }));
  
  const addedJobs = await eventQueue.addBulk(jobs);
  
  return {
    queued: addedJobs.length,
    message: `${addedJobs.length} events queued for processing`,
    jobIds: addedJobs.map(j => j.id),
  };
}

async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    eventQueue.getWaitingCount(),
    eventQueue.getActiveCount(),
    eventQueue.getCompletedCount(),
    eventQueue.getFailedCount(),
    eventQueue.getDelayedCount(),
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

async function getJobStatus(jobId) {
  const job = await eventQueue.getJob(jobId);
  
  if (!job) {
    return { error: 'Job not found' };
  }
  
  const state = await job.getState();
  
  return {
    jobId: job.id,
    state,
    progress: job.progress(),
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    data: job.data,
    returnvalue: job.returnvalue,
  };
}

async function clearCompleted() {
  await eventQueue.clean(24 * 3600 * 1000);
  return { message: 'Completed jobs cleared' };
}

function getPriority(eventType) {
  const priorities = {
    purchase: 1,
    demo_request: 2,
    form_submission: 3,
    email_open: 4,
    page_view: 5,
  };
  
  return priorities[eventType] || 5;
}

async function closeQueue() {
  await eventQueue.close();
  console.log('✓ Event queue closed gracefully');
}

module.exports = {
  addEvent,
  addBatch,
  getQueueStats,
  getJobStatus,
  clearCompleted,
  closeQueue,
  queue: eventQueue,
};
