# Lead Scoring System

Real-time lead scoring platform that processes events asynchronously to rank sales leads based on their interactions.

## Features

- Event queue processing with Bull & Redis
- Real-time WebSocket updates
- Idempotency & out-of-order event handling
- Configurable scoring rules
- CSV batch upload
- Complete score history & audit trail

## Tech Stack

**Backend:** Node.js, Express, MongoDB, Bull, Socket.io  
**Frontend:** React, Vite, Tailwind CSS, Recharts

## Quick Start

### Prerequisites

- Node.js 16+
- MongoDB
- Redis

### Installation

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Start MongoDB & Redis (macOS)
brew services start mongodb-community
brew services start redis

# Configure backend/.env
MONGODB_URI=mongodb://localhost:27017/lead-scoring
PORT=3000
REDIS_URL=redis://localhost:6379

# Seed database (optional)
cd backend && npm run seed
```

### Run

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

Open http://localhost:5173

## API Endpoints

### Leads
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead
- `GET /api/leads/:id` - Get lead details
- `GET /api/leaderboard` - Top scored leads

### Events
- `POST /api/events` - Submit event (queued)
- `POST /api/events/batch` - Batch submission
- `POST /api/events/upload` - CSV/JSON upload
- `GET /api/leads/:id/events` - Lead events
- `GET /api/leads/:id/history` - Score history

### Scoring Rules
- `GET /api/rules` - List rules
- `PUT /api/rules/:eventType` - Update rule

### Queue
- `GET /api/queue/stats` - Queue statistics
- `GET /api/queue/job/:jobId` - Job status

### Export
- `GET /api/export/leads` - Download leads CSV
- `GET /api/export/events/:leadId` - Download events CSV

## Event Types

| Type | Points | Description |
|------|--------|-------------|
| `email_open` | 10 | Email opened |
| `page_view` | 5 | Page visited |
| `form_submission` | 20 | Form submitted |
| `demo_request` | 50 | Demo requested |
| `purchase` | 100 | Purchase made |

## Example Usage

### Create Lead
```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","company":"Acme"}'
```

### Submit Event
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt_1","eventType":"page_view","leadId":"<LEAD_ID>"}'
```

### Upload CSV
```bash
curl -X POST http://localhost:3000/api/events/upload -F "file=@events.csv"
```

## Project Structure

```
backend/
├── src/
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API routes
│   ├── services/        # Queue, scoring, websocket
│   └── server.js        # Main server
frontend/
├── src/
│   ├── components/      # React components
│   └── App.jsx          # Main app
```

## Troubleshooting

**MongoDB not connecting?**
- Start MongoDB: `brew services start mongodb-community`

**Redis not running?**
- Start Redis: `brew services start redis`

**Port already in use?**
- Check `.env` PORT setting (default: 3000)

