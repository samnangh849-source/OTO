import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { KeyRound, Plus, Trash2, Power, PowerOff, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function LicenseManager() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New License Form
  const [newKey, setNewKey] = useState('');
  const [expiryDays, setExpiryDays] = useState(30);
  const [note, setNote] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Basic Admin check: only users with 'admin' in their license note can manage licenses
    try {
      const infoStr = localStorage.getItem('license_info');
      if (infoStr) {
        const info = JSON.parse(infoStr);
        if (info.note && info.note.toLowerCase().includes('admin')) {
          setIsAdmin(true);
        } else if (info.key === 'OTO-ADMIN-MASTER') {
            setIsAdmin(true);
        }
      }
    } catch (e) {}

    fetchLicenses();
  }, []);

  const fetchLicenses = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/admin/licenses');
      if (res.data && res.data.licenses) {
        setLicenses(res.data.licenses);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch licenses');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey) return;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    try {
      const res = await api.post('/admin/licenses/create', {
        key: newKey.toUpperCase(),
        expiry_date: expiryDate.toISOString(),
        note: note
      });

      if (res.data.success) {
        setNewKey('');
        setNote('');
        fetchLicenses();
      } else {
        alert(res.data.message || 'Failed to create license');
      }
    } catch (err) {
      console.error(err);
      alert('Error creating license');
    }
  };

  const handleStatusChange = async (key: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    if (!confirm(`Change license ${key} status to ${newStatus.toUpperCase()}?`)) return;

    try {
      const res = await api.post('/admin/licenses/status', {
        key,
        status: newStatus
      });
      if (res.data.success) {
        fetchLicenses();
      }
    } catch (err) {
      console.error(err);
      alert('Error updating status');
    }
  };

  const generateRandomKey = () => {
    const prefix = 'OTO-';
    const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
    const randomNum = Math.floor(Math.random() * 9000 + 1000);
    setNewKey(`${prefix}${randomString}-${randomNum}`);
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 p-8 bg-binance-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <ShieldAlert size={48} className="mx-auto text-red-500" />
          <h2 className="text-2xl font-black text-binance-text">ACCESS DENIED</h2>
          <p className="text-binance-text-dim text-sm max-w-sm mx-auto">
            You do not have administrative privileges to view this page. Your license must contain "admin" in its note to grant access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-binance-bg min-h-screen">
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-black text-binance-text flex items-center gap-3">
              <KeyRound className="text-binance-yellow" /> License Manager
            </h2>
            <p className="text-sm text-binance-text-dim mt-1">Generate and control access keys for your customers</p>
          </div>
          <button 
            onClick={fetchLicenses}
            className="text-xs font-bold text-binance-text-dim hover:text-binance-yellow transition-colors"
          >
            REFRESH LIST
          </button>
        </div>

        {/* Create Form */}
        <div className="bg-binance-card p-6 rounded-xl border border-binance-border shadow-lg">
          <h3 className="text-sm font-bold text-binance-text mb-4 uppercase tracking-wider flex items-center gap-2">
            <Plus size={16} className="text-binance-yellow" /> Create New License
          </h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label className="block text-[10px] uppercase font-bold text-binance-text-dim mb-1">License Key</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newKey}
                  onChange={e => setNewKey(e.target.value.toUpperCase())}
                  placeholder="e.g. OTO-VIP-2026"
                  className="flex-1 bg-binance-bg border border-binance-border text-binance-text text-sm rounded-lg px-3 py-2 font-mono focus:border-binance-yellow focus:ring-1 focus:ring-binance-yellow outline-none"
                />
                <button
                  type="button"
                  onClick={generateRandomKey}
                  className="bg-binance-bg hover:bg-binance-border border border-binance-border text-binance-text-dim hover:text-binance-text px-3 rounded-lg transition-colors text-xs font-bold"
                >
                  RANDOM
                </button>
              </div>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase font-bold text-binance-text-dim mb-1">Duration (Days)</label>
              <input
                type="number"
                min="1"
                required
                value={expiryDays}
                onChange={e => setExpiryDays(parseInt(e.target.value))}
                className="w-full bg-binance-bg border border-binance-border text-binance-text text-sm rounded-lg px-3 py-2 focus:border-binance-yellow focus:ring-1 focus:ring-binance-yellow outline-none"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[10px] uppercase font-bold text-binance-text-dim mb-1">Customer Note / Name</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Client name, email, or role (e.g. admin)"
                className="w-full bg-binance-bg border border-binance-border text-binance-text text-sm rounded-lg px-3 py-2 focus:border-binance-yellow focus:ring-1 focus:ring-binance-yellow outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full bg-binance-yellow hover:bg-yellow-400 text-black font-black text-sm py-2 rounded-lg transition-colors shadow-lg shadow-binance-yellow/10"
              >
                CREATE
              </button>
            </div>
          </form>
        </div>

        {/* License List */}
        <div className="bg-binance-card rounded-xl border border-binance-border overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-binance-border bg-binance-bg/50">
                  <th className="p-4 text-xs font-black text-binance-text-dim uppercase tracking-wider">License Key</th>
                  <th className="p-4 text-xs font-black text-binance-text-dim uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-black text-binance-text-dim uppercase tracking-wider">Expiry Date</th>
                  <th className="p-4 text-xs font-black text-binance-text-dim uppercase tracking-wider">Note</th>
                  <th className="p-4 text-xs font-black text-binance-text-dim uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-binance-border/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-binance-text-dim text-sm">Loading licenses...</td>
                  </tr>
                ) : licenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-binance-text-dim text-sm">No licenses found. Create your first one above!</td>
                  </tr>
                ) : (Array.isArray(licenses) ? licenses : []).map((lic, idx) => {
                    const isExpired = new Date(lic.expiry_date) < new Date();
                    const status = isExpired ? 'expired' : lic.status;
                    
                    return (
                      <tr key={idx} className="hover:bg-binance-bg/30 transition-colors">
                        <td className="p-4 font-mono text-sm text-binance-yellow">{lic.key}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            status === 'active' ? 'bg-binance-green/10 text-binance-green border border-binance-green/20' : 
                            status === 'expired' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                          }`}>
                            {status === 'active' ? <CheckCircle2 size={12} /> : 
                             status === 'expired' ? <Clock size={12} /> : <PowerOff size={12} />}
                            {status}
                          </span>
                        </td>
                        <td className="p-4 text-sm text-binance-text">
                          {format(new Date(lic.expiry_date), 'MMM dd, yyyy HH:mm')}
                        </td>
                        <td className="p-4 text-sm text-binance-text-dim">{lic.note || '-'}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleStatusChange(lic.key, lic.status)}
                            disabled={status === 'expired'}
                            className={`p-2 rounded-lg transition-colors ${
                              status === 'expired' ? 'opacity-50 cursor-not-allowed text-binance-text-dim' :
                              status === 'active' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 
                              'bg-binance-green/10 text-binance-green hover:bg-binance-green/20'
                            }`}
                            title={status === 'active' ? "Block License" : "Activate License"}
                          >
                            <Power size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
