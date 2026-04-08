import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutTemplate, LogOut, Unplug, Activity, Settings as SettingsIcon, KeyRound } from 'lucide-react';
import socket from '../lib/socket';

export default function Sidebar() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
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
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  const handleDisconnectTelegram = () => {
    if (confirm('Are you sure you want to disconnect your Telegram account?')) {
      socket.emit('logout_telegram');
    }
  };

  return (
    <div className="w-64 bg-binance-panel border-r border-binance-border flex flex-col h-screen text-binance-text">
      <div className="p-6 border-b border-binance-border flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2 tracking-tight">
          <Activity className="text-binance-yellow" />
          <span className="text-binance-text">OTO Messages</span>
        </h1>
      </div>
      
      <nav className="flex-1 py-4 space-y-1">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-l-4 ${
              isActive 
                ? 'bg-binance-card text-binance-yellow border-binance-yellow' 
                : 'border-transparent text-binance-text-dim hover:bg-binance-card hover:text-binance-text'
            }`
          }
        >
          <MessageSquare size={18} />
          Messages
        </NavLink>
        <NavLink
          to="/templates"
          className={({ isActive }) =>
            `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-l-4 ${
              isActive 
                ? 'bg-binance-card text-binance-yellow border-binance-yellow' 
                : 'border-transparent text-binance-text-dim hover:bg-binance-card hover:text-binance-text'
            }`
          }
        >
          <LayoutTemplate size={18} />
          Templates
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-l-4 ${
              isActive 
                ? 'bg-binance-card text-binance-yellow border-binance-yellow' 
                : 'border-transparent text-binance-text-dim hover:bg-binance-card hover:text-binance-text'
            }`
          }
        >
          <SettingsIcon size={18} />
          Settings
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/licenses"
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-l-4 ${
                isActive 
                  ? 'bg-binance-card text-binance-yellow border-binance-yellow' 
                  : 'border-transparent text-binance-text-dim hover:bg-binance-card hover:text-binance-text'
              }`
            }
          >
            <KeyRound size={18} />
            License Manager
          </NavLink>
        )}
      </nav>

      <div className="p-4 border-t border-binance-border space-y-2">
        <button
          onClick={handleDisconnectTelegram}
          className="flex items-center gap-3 px-4 py-2.5 w-full rounded-md text-binance-text-dim hover:bg-binance-card hover:text-binance-text transition-colors text-sm font-medium"
        >
          <Unplug size={16} />
          Unlink Telegram
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 w-full rounded-md text-binance-text-dim hover:bg-binance-card hover:text-binance-text transition-colors text-sm font-medium"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );
}
