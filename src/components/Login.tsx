import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import socket from '../lib/socket';
import { Key, ShieldCheck, Lock } from 'lucide-react';

export default function Login() {
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      // We'll change the endpoint to /login-license
      const res = await api.post('/login-license', { licenseKey });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('license_info', JSON.stringify(res.data.license));
      
      // Update socket auth and reconnect
      socket.disconnect().connect();
      
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired License Key');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-binance-bg p-4 font-sans">
      <div className="max-w-md w-full space-y-8 bg-binance-card p-10 rounded-2xl shadow-2xl border border-binance-border relative overflow-hidden group">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-binance-yellow opacity-50"></div>
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-binance-yellow/5 rounded-full blur-3xl"></div>
        
        <div className="relative">
          <div className="mx-auto h-16 w-16 bg-binance-yellow/10 text-binance-yellow rounded-2xl flex items-center justify-center mb-6 rotate-3 group-hover:rotate-0 transition-transform duration-500 shadow-inner">
            <ShieldCheck size={32} />
          </div>
          <h2 className="text-center text-3xl font-black text-binance-text tracking-tight">
            OTO Dashboard
          </h2>
          <p className="mt-3 text-center text-xs text-binance-text-dim uppercase tracking-widest font-bold">
            Secure License Access
          </p>
        </div>

        <form className="mt-10 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-xs font-bold text-center animate-shake">
              {error}
            </div>
          )}
          
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-binance-text-dim group-focus-within:text-binance-yellow transition-colors">
              <Key size={18} />
            </div>
            <input
              type="text"
              required
              spellCheck="false"
              autoComplete="off"
              className="block w-full pl-12 pr-4 py-4 bg-binance-bg border border-binance-border placeholder-binance-text-dim text-binance-text rounded-xl focus:outline-none focus:ring-2 focus:ring-binance-yellow/50 focus:border-binance-yellow transition-all text-sm font-mono tracking-wider"
              placeholder="ENTER LICENSE KEY"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group relative w-full flex justify-center items-center gap-3 py-4 px-4 border border-transparent text-sm font-black rounded-xl text-black bg-binance-yellow hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-binance-yellow transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-binance-yellow/10"
          >
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
            ) : (
              <>
                <Lock size={18} />
                ACTIVATE NOW
              </>
            )}
          </button>
        </form>

        <div className="pt-6 text-center border-t border-binance-border/50">
          <p className="text-[10px] text-binance-text-dim leading-relaxed uppercase tracking-tighter">
            Contact your administrator to obtain or renew a License Key.
            <br />
            Authorized access only.
          </p>
        </div>
      </div>
    </div>
  );
}
