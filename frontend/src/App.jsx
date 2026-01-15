import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, Activity, Award, Plus, RefreshCw, Settings, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import io from 'socket.io-client';
import ScoringRulesConfig from './components/ScoringRulesConfig';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:5000';

const api = {
  async get(endpoint) {
    const res = await fetch(`${API_URL}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
};

function useWebSocket() {
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    const socket = io(WS_URL);
    socket.on('score:updated', (data) => {
      setUpdates(prev => [data, ...prev.slice(0, 9)]);
    });
    return () => socket.close();
  }, []);

  return { updates };
}

function LeadList({ onSelectLead, refreshTrigger }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadLeads();
  }, [refreshTrigger, search]);

  const loadLeads = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/leads?search=${search}`);
      setLeads(data.leads);
    } catch (error) {
      console.error('Failed to load leads:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Users size={20} />
          Leads
        </h2>
        <div className="flex gap-2">
          <a
            href={`${API_URL}/export/leads`}
            download="leads.csv"
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
          >
            <Download size={14} />
            Export
          </a>
          <button onClick={loadLeads} className="p-1.5 hover:bg-gray-100 rounded">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search leads..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {leads.map(lead => (
            <div
              key={lead._id}
              onClick={() => onSelectLead(lead)}
              className="p-3 border border-gray-100 rounded hover:border-gray-300 cursor-pointer transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-sm">{lead.name}</h3>
                  <p className="text-xs text-gray-500">{lead.email}</p>
                  {lead.company && <p className="text-xs text-gray-400">{lead.company}</p>}
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-blue-600">{lead.currentScore}</div>
                  <span className="text-xs bg-gray-50 px-2 py-0.5 rounded">{lead.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadDetail({ lead, onClose }) {
  const [history, setHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lead) {
      loadLeadData();
    }
  }, [lead]);

  const loadLeadData = async () => {
    try {
      setLoading(true);
      const [historyData, eventsData] = await Promise.all([
        api.get(`/leads/${lead._id}/history`),
        api.get(`/leads/${lead._id}/events`)
      ]);
      setHistory(historyData);
      setEvents(eventsData);
    } catch (error) {
      console.error('Failed to load lead data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!lead) return null;

  const chartData = history.map(h => ({
    time: new Date(h.timestamp).toLocaleString(),
    score: h.score
  }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">{lead.name}</h2>
            <p className="text-gray-600">{lead.email}</p>
            {lead.company && <p className="text-gray-500">{lead.company}</p>}
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-600">{lead.currentScore}</div>
            <span className="text-sm bg-gray-100 px-3 py-1 rounded">{lead.status}</span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <>
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp size={20} />
                  Score History
                </h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500">No score history yet</p>
                )}
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Activity size={20} />
                  Recent Events
                </h3>
                <div className="space-y-2">
                  {events.slice(0, 10).map(event => (
                    <div key={event._id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">{event.eventType.replace('_', ' ')}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${event.processed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {event.processed ? 'Processed' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function EventForm({ leads, onSuccess }) {
  const [leadId, setLeadId] = useState('');
  const [eventType, setEventType] = useState('page_view');
  const [eventId, setEventId] = useState('');
  const [metadata, setMetadata] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!leadId) {
      alert('Please select a lead');
      return;
    }
    
    try {
      setSubmitting(true);
      const finalEventId = eventId || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await api.post('/events', {
        leadId,
        eventType,
        eventId: finalEventId,
        metadata: metadata ? JSON.parse(metadata) : {}
      });
      alert('Event submitted successfully!');
      setLeadId('');
      setEventType('page_view');
      setEventId('');
      setMetadata('');
      onSuccess();
    } catch (error) {
      alert(`Failed: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Plus size={24} />
        Submit Event
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Lead</label>
          <select
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Select a lead</option>
            {leads.map(lead => (
              <option key={lead._id} value={lead._id}>
                {lead.name} ({lead.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="email_open">Email Open (+10)</option>
            <option value="page_view">Page View (+5)</option>
            <option value="form_submission">Form Submission (+20)</option>
            <option value="demo_request">Demo Request (+50)</option>
            <option value="purchase">Purchase (+100)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Event ID (optional)</label>
          <input
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="Auto-generated if empty"
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Metadata (JSON, optional)</label>
          <textarea
            value={metadata}
            onChange={(e) => setMetadata(e.target.value)}
            placeholder='{"source": "web"}'
            className="w-full px-3 py-2 border rounded-lg"
            rows={3}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {submitting ? 'Submitting...' : 'Submit Event'}
        </button>
      </div>
    </div>
  );
}

function Leaderboard({ refreshTrigger }) {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [refreshTrigger]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const data = await api.get('/leaderboard?limit=10');
      setLeaders(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Award size={18} className="text-yellow-500" />
        Leaderboard
      </h2>
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-1.5">
          {leaders.map((lead, idx) => (
            <div key={lead._id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-bold text-gray-300 w-6">{idx + 1}</span>
                <div>
                  <div className="font-medium text-sm">{lead.name}</div>
                  <div className="text-xs text-gray-500">{lead.company || lead.email}</div>
                </div>
              </div>
              <div className="text-lg font-bold text-blue-600">{lead.currentScore}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RealtimeUpdates({ updates }) {
  if (updates.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Activity size={18} className="text-green-500" />
        Live Updates
      </h2>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {updates.map((update, idx) => (
          <div key={idx} className="p-2.5 bg-green-50 border border-green-100 rounded">
            <div className="font-medium text-sm">{update.leadName}</div>
            <div className="text-xs text-gray-600">
              {update.eventType?.replace('_', ' ')} • 
              <span className="font-medium text-green-600">+{update.change}</span> • 
              {update.previousScore} → {update.newScore}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [selectedLead, setSelectedLead] = useState(null);
  const [leads, setLeads] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const { updates } = useWebSocket();

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (updates.length > 0) {
      setRefreshTrigger(prev => prev + 1);
    }
  }, [updates]);

  const loadLeads = async () => {
    try {
      const data = await api.get('/leads');
      setLeads(data.leads);
    } catch (error) {
      console.error('Failed to load leads:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Lead Scoring System</h1>
          <p className="text-gray-600">Event-driven real-time lead management</p>
        </header>

        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Dashboard
              </div>
            </button>
            <button
              onClick={() => setActiveTab('submit')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'submit'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Submit Event
              </div>
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'rules'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Scoring Rules
              </div>
            </button>
          </nav>
        </div>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <LeadList onSelectLead={setSelectedLead} refreshTrigger={refreshTrigger} />
            </div>
            <div className="space-y-4">
              <Leaderboard refreshTrigger={refreshTrigger} />
              <RealtimeUpdates updates={updates} />
            </div>
          </div>
        )}

        {activeTab === 'submit' && (
          <div className="max-w-2xl">
            <EventForm leads={leads} onSuccess={() => setRefreshTrigger(prev => prev + 1)} />
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="max-w-5xl">
            <ScoringRulesConfig apiUrl={API_URL} />
          </div>
        )}

        {selectedLead && <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />}
      </div>
    </div>
  );
}