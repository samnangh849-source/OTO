import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ShieldCheck, QrCode, Monitor, Laptop, Smartphone, Key, AlertCircle, CheckCircle2, X, Globe, Copy, Check, RefreshCw } from 'lucide-react';
import socket from '../lib/socket';
import api from '../lib/api';

export default function Settings() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [telegramStatus, setTelegramStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number, total: number, percent: number } | null>(null);
  const [syncStartTime, setSyncStartTime] = useState<number | null>(null);
  const [historyDays, setHistoryDays] = useState(30);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [loginMode, setLoginMode] = useState<'qr' | 'phone'>('qr');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [qrPasswordRequired, setQrPasswordRequired] = useState(false);
  const [codeRequired, setCodeRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [networkAddresses, setNetworkAddresses] = useState<string[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const fetchNetworkInfo = async () => {
    try {
      const res = await api.get('/network');
      setNetworkAddresses(res.data?.addresses || []);
    } catch (e) {
      console.error('Failed to fetch network info:', e);
      setNetworkAddresses([]);
    }
  };

  useEffect(() => {
    socket.emit('check_telegram_status');
    
    socket.on('tg_accounts_list', (list) => setAccounts(list));
    socket.on('tg_status', (data) => setTelegramStatus(data.status));
    socket.on('tg_qr', (data) => {
      setQrCode(data.qr);
      setIsGeneratingQr(false);
    });
    socket.on('tg_error', (msg) => {
      setQrError(msg);
      setIsGeneratingQr(false);
      setIsLoading(false);
    });
    socket.on('tg_password_required', () => {
      setQrPasswordRequired(true);
      setIsGeneratingQr(false);
      setIsLoading(false);
    });
    socket.on('tg_code_required', () => {
      setCodeRequired(true);
      setIsLoading(false);
    });
    socket.on('tg_connected', (data) => {
      setShowAddAccount(false);
      socket.emit('check_telegram_status');
      setQrCode(null);
      setQrPasswordRequired(false);
      setCodeRequired(false);
      setIsLoading(false);
    });
    socket.on('tg_sync_status', (data) => {
      if (data.progress) {
        setSyncProgress(data.progress);
      }
    });

    socket.on('tg_sync_finished', () => {
      setIsSyncing(false);
      setIsSyncingHistory(false);
      setSyncProgress(null);
    });

    fetchNetworkInfo();

    return () => {
      socket.off('tg_accounts_list');
      socket.off('tg_status');
      socket.off('tg_qr');
      socket.off('tg_error');
      socket.off('tg_password_required');
      socket.off('tg_code_required');
      socket.off('tg_connected');
      socket.off('tg_sync_finished');
    };
  }, []);

  const requestQr = () => {
    setIsGeneratingQr(true);
    setQrError(null);
    socket.emit('request_qr');
  };

  const handleSendPhone = () => {
    setIsLoading(true);
    setQrError(null);
    socket.emit('tg_send_phone', phoneInput);
  };

  const handleSubmitCode = () => {
    setIsLoading(true);
    socket.emit('tg_submit_code', codeInput);
  };

  const submitPassword = () => {
    setIsLoading(true);
    socket.emit('tg_submit_password', passwordInput);
    setPasswordInput('');
  };

  const handleSyncAll = () => {
    if (isSyncing) return;
    setIsSyncing(true);
    socket.emit('tg_sync_all');
  };

  const handleSyncHistory = () => {
    if (isSyncingHistory || isSyncing) return;
    setIsSyncingHistory(true);
    setSyncStartTime(Date.now());
    setSyncProgress({ current: 0, total: 100, percent: 0 }); // Initial state
    socket.emit('tg_sync_history', { days: historyDays });
  };

  const handleLogoutTelegram = (accountId: string) => {
    if (confirm('Disconnect this Telegram account?')) {
      socket.emit('logout_telegram', accountId);
    }
  };

  return (
    <div className="flex-1 p-8 bg-binance-bg min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-black text-binance-text flex items-center gap-3">
              <Monitor className="text-binance-yellow" /> System Settings
            </h2>
            <p className="text-sm text-binance-text-dim mt-1">Manage multiple Telegram connections and application security</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-end">
            <button 
              onClick={handleSyncAll}
              disabled={isSyncing || isSyncingHistory || accounts.length === 0}
              className={`px-4 py-2 border border-binance-yellow text-binance-yellow rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-binance-yellow/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              title="Sync recent unread messages using Telegram update state"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'SYNCING...' : 'SYNC MESSAGES'}
            </button>
            <div className="flex items-stretch gap-0 rounded-lg overflow-hidden border border-blue-500/50">
              <select
                value={historyDays}
                onChange={(e) => setHistoryDays(Number(e.target.value))}
                disabled={isSyncingHistory || isSyncing}
                className="px-2 py-2 bg-blue-500/10 text-blue-300 text-xs font-bold outline-none border-r border-blue-500/30 disabled:opacity-50 cursor-pointer"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
              <button 
                onClick={handleSyncHistory}
                disabled={isSyncingHistory || isSyncing || accounts.length === 0}
                className="px-4 py-2 bg-blue-500/10 text-blue-300 font-bold text-xs flex items-center gap-2 hover:bg-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Recover ALL messages from the selected period — including already-read ones. Use this after being offline for a long time."
              >
                <RefreshCw size={14} className={isSyncingHistory ? 'animate-spin' : ''} />
                {isSyncingHistory ? 'RECOVERING...' : 'SYNC HISTORY'}
              </button>
            </div>
            <button 
              onClick={() => setShowAddAccount(true)}
              className="px-4 py-2 bg-binance-yellow text-[#181a20] rounded-lg font-bold text-xs hover:scale-105 transition-all"
            >
              + ADD ACCOUNT
            </button>
          </div>
        </div>

        {/* Sync Progress Bar */}
        <AnimatePresence>
          {isSyncingHistory && syncProgress && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-binance-panel p-4 rounded-xl border border-blue-500/30 space-y-3">
                <div className="flex justify-between items-center text-[11px] font-bold">
                  <span className="text-blue-400 flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin" />
                    DEEP SYNCING HISTORY...
                  </span>
                  <div className="flex gap-4 text-binance-text-dim">
                    {syncStartTime && syncProgress.current > 0 && (
                      <span className="text-binance-green">
                        {((syncProgress.current / ((Date.now() - syncStartTime) / 1000))).toFixed(1)} chats/sec
                      </span>
                    )}
                    <span>{syncProgress.current} / {syncProgress.total} chats</span>
                  </div>
                </div>
                <div className="h-2 bg-binance-bg rounded-full overflow-hidden border border-binance-border">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${syncProgress.percent}%` }}
                    className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-binance-text-dim italic">This might take a minute. Please keep this tab open.</span>
                    {syncStartTime && syncProgress.current > 0 && syncProgress.percent < 100 && (
                      <span className="text-[9px] text-binance-yellow">
                        Est. remaining: {Math.ceil(((syncProgress.total - syncProgress.current) / (syncProgress.current / ((Date.now() - syncStartTime) / 1000))))} seconds
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-black text-blue-400">{syncProgress.percent}%</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* System Status */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-binance-text-dim uppercase tracking-widest">System Status</h3>
            <div className="p-4 bg-binance-panel rounded-xl border border-binance-border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] text-binance-text-dim">Socket.IO</span>
                <span className="text-[11px] text-binance-green font-bold">CONNECTED</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-binance-text-dim">Telegram Auth</span>
                <span className={`text-[11px] font-bold ${telegramStatus === 'connected' ? 'text-binance-green' : 'text-binance-yellow'}`}>{telegramStatus.toUpperCase()}</span>
              </div>
            </div>
            <h3 className="text-xs font-black text-binance-text-dim uppercase tracking-widest">Linked Accounts ({accounts.length})</h3>
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-binance-panel p-4 rounded-xl border border-binance-border flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  {acc.photo ? (
                    <img src={acc.photo} alt="" className="w-10 h-10 rounded-full border border-binance-border" />
                  ) : (
                    <div className="w-10 h-10 bg-binance-card rounded-full flex items-center justify-center text-binance-text-dim">
                      <Smartphone size={20} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-binance-text">{acc.first_name} {acc.last_name}</p>
                    <p className="text-[10px] text-binance-green font-medium">+{acc.phone}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleLogoutTelegram(acc.id)}
                  className="p-2 text-binance-text-dim hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            ))}

            {/* Network Connector */}
            <h3 className="text-xs font-black text-binance-text-dim uppercase tracking-widest mt-4">Network Access</h3>
            <div className="p-4 bg-binance-panel rounded-xl border border-binance-border space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-binance-yellow/10 rounded-lg text-binance-yellow">
                  <Globe size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-binance-text">Access from Other Devices</p>
                  <p className="text-[10px] text-binance-text-dim mt-0.5">Use these addresses to access the dashboard from your phone or other computers.</p>
                </div>
              </div>
              
              <div className="space-y-2">
                {networkAddresses.length > 0 ? networkAddresses.map((addr, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-binance-bg rounded-lg border border-binance-border group">
                    <code className="flex-1 text-[11px] font-mono text-binance-yellow">{addr}</code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(addr);
                        setCopiedUrl(addr);
                        setTimeout(() => setCopiedUrl(null), 2000);
                      }}
                      className="p-1.5 hover:bg-binance-card rounded transition-colors text-binance-text-dim hover:text-white"
                    >
                      {copiedUrl === addr ? <Check size={14} className="text-binance-green" /> : <Copy size={14} />}
                    </button>
                  </div>
                )) : (
                  <div className="p-2 bg-binance-bg rounded-lg border border-binance-border text-center">
                    <p className="text-[10px] text-binance-text-dim italic">No addresses found</p>
                  </div>
                )}
              </div>
              
              <div className="p-2 bg-binance-yellow/5 border border-binance-yellow/10 rounded-lg">
                <p className="text-[9px] text-binance-yellow/80 leading-relaxed italic">
                  <strong>Tip:</strong> Open the link above in your phone browser to access the mobile-friendly dashboard.
                </p>
              </div>
            </div>

            {accounts.length === 0 && (
              <div className="p-8 border-2 border-dashed border-binance-border rounded-xl text-center">
                <p className="text-xs text-binance-text-dim">No accounts linked yet.</p>
              </div>
            )}
          </div>

          {/* Add Account Modal/Panel */}
          <div className="bg-binance-panel p-6 rounded-xl border border-binance-border relative overflow-hidden">
            <AnimatePresence mode="wait">
              {showAddAccount ? (
                <motion.div 
                  key="add-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-binance-text">Link New Account</h3>
                    <button onClick={() => setShowAddAccount(false)} className="text-binance-text-dim hover:text-white"><X size={20}/></button>
                  </div>
                  
                  {!qrCode && !isGeneratingQr && !codeRequired && !qrPasswordRequired && (
                    <div className="space-y-6">
                      <div className="flex bg-binance-card p-1 rounded-lg border border-binance-border">
                        <button onClick={() => setLoginMode('qr')} className={`flex-1 py-2 rounded-md text-[10px] font-bold ${loginMode === 'qr' ? 'bg-binance-yellow text-[#181a20]' : 'text-binance-text-dim'}`}>QR CODE</button>
                        <button onClick={() => setLoginMode('phone')} className={`flex-1 py-2 rounded-md text-[10px] font-bold ${loginMode === 'phone' ? 'bg-binance-yellow text-[#181a20]' : 'text-binance-text-dim'}`}>PHONE</button>
                      </div>

                      {loginMode === 'qr' ? (
                        <button onClick={requestQr} className="w-full py-4 bg-binance-yellow text-[#181a20] rounded-lg font-bold text-sm">GENERATE QR</button>
                      ) : (
                        <div className="space-y-4">
                          <input type="text" placeholder="+855..." value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} className="w-full px-4 py-3 bg-binance-bg border border-binance-border rounded-lg text-sm text-white outline-none focus:border-binance-yellow" />
                          <button onClick={handleSendPhone} className="w-full py-3 bg-binance-yellow text-[#181a20] rounded-lg font-bold text-sm">SEND OTP</button>
                        </div>
                      )}
                    </div>
                  )}

                  {isGeneratingQr && <div className="py-8 flex flex-col items-center gap-4"><div className="w-10 h-10 border-4 border-binance-yellow/30 border-t-binance-yellow rounded-full animate-spin" /><p className="text-xs text-binance-yellow font-bold">LOADING...</p></div>}
                  {qrCode && (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-2 bg-white rounded-lg"><img src={qrCode} className="w-40 h-40" /></div>
                      <p className="text-[10px] text-binance-text-dim">Scan with Telegram Devices</p>
                      <button onClick={() => setQrCode(null)} className="text-xs text-binance-yellow underline">Cancel</button>
                    </div>
                  )}
                  {codeRequired && (
                    <div className="space-y-4">
                      <input type="text" placeholder="OTP CODE" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} className="w-full px-4 py-4 bg-binance-bg border border-binance-border rounded-lg text-center text-xl font-black text-white outline-none focus:border-binance-yellow" />
                      <button onClick={handleSubmitCode} className="w-full py-3 bg-binance-yellow text-[#181a20] rounded-lg font-bold text-sm">VERIFY</button>
                    </div>
                  )}
                  {qrPasswordRequired && (
                    <div className="space-y-4">
                      <p className="text-[10px] text-binance-text-dim uppercase font-black">2FA Required</p>
                      <input type="password" placeholder="Cloud Password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full px-4 py-3 bg-binance-bg border border-binance-border rounded-lg text-sm text-white outline-none focus:border-binance-yellow" />
                      <button onClick={submitPassword} className="w-full py-3 bg-binance-yellow text-[#181a20] rounded-lg font-bold text-sm">LOGIN</button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="info"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center py-12"
                >
                  <ShieldCheck size={48} className="text-binance-yellow/20 mb-4" />
                  <h3 className="font-bold text-binance-text">Multi-Account Support</h3>
                  <p className="text-xs text-binance-text-dim mt-2 max-w-[200px]">You can connect and manage multiple Telegram accounts simultaneously.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {qrError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0" size={20} />
            <p className="text-xs text-red-400">{qrError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
