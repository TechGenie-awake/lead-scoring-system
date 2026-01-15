import React, { useState, useEffect } from 'react';
import { Settings, Save, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';

export default function ScoringRulesConfig({ apiUrl }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiUrl}/rules`);
      if (!response.ok) throw new Error('Failed to load rules');
      const data = await response.json();
      setRules(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePointsChange = (eventType, newPoints) => {
    setEditingRule({ eventType, points: parseInt(newPoints) });
  };

  const saveRule = async (eventType, updates) => {
    try {
      setSaving(true);
      const response = await fetch(`${apiUrl}/rules/${eventType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update rule');

      const updatedRule = await response.json();
      
      setRules(rules.map(r => 
        r.eventType === eventType ? updatedRule : r
      ));
      
      setEditingRule(null);
      showNotification('Rule updated successfully!', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (eventType, currentActive) => {
    await saveRule(eventType, { active: !currentActive });
  };

  const showNotification = (message, type) => {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } text-white z-50 animate-fade-in`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };

  const getRuleDisplayName = (eventType) => {
    return eventType.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-semibold">Error loading rules</p>
        <p className="text-sm">{error}</p>
        <button 
          onClick={loadRules}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-gray-600" />
          <h2 className="text-2xl font-bold">Scoring Rules Configuration</h2>
        </div>
        <button
          onClick={loadRules}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Event Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Points
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rules.map((rule) => {
              const isEditing = editingRule?.eventType === rule.eventType;
              
              return (
                <tr key={rule.eventType} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">
                      {getRuleDisplayName(rule.eventType)}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {rule.eventType}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editingRule.points}
                        onChange={(e) => handlePointsChange(rule.eventType, e.target.value)}
                        className="w-24 px-3 py-1 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-semibold ${
                          rule.points > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {rule.points > 0 ? '+' : ''}{rule.points}
                        </span>
                        <span className="text-sm text-gray-500">points</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-600">{rule.description}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(rule.eventType, rule.active)}
                      disabled={saving}
                      className="flex items-center gap-2 group"
                    >
                      {rule.active ? (
                        <>
                          <ToggleRight className="w-8 h-8 text-green-500 group-hover:text-green-600 transition-colors" />
                          <span className="text-sm font-medium text-green-600">Active</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-8 h-8 text-gray-400 group-hover:text-gray-500 transition-colors" />
                          <span className="text-sm font-medium text-gray-500">Inactive</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => saveRule(rule.eventType, { points: editingRule.points })}
                          disabled={saving}
                          className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                        >
                          <Save className="w-4 h-4" />
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRule(null)}
                          disabled={saving}
                          className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingRule({ eventType: rule.eventType, points: rule.points })}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
                      >
                        Edit Points
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How Scoring Works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Each event type has a point value that's added to a lead's score</li>
          <li>• Positive points increase the score, negative points decrease it</li>
          <li>• Inactive rules won't affect scoring (events are still tracked)</li>
          <li>• Maximum score is capped at 1000 points</li>
          <li>• Changes apply immediately to new events (existing scores unchanged)</li>
        </ul>
      </div>
    </div>
  );
}
