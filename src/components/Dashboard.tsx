import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Image, FileVideo, Mic, MessageCircle, CheckCircle2, Search, X, BarChart3, MessageSquare, Users, TrendingUp, ArrowRight, Bell, Settings, LogOut, Clock, Zap, LayoutTemplate, Send, Type, Video, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import socket from '../lib/socket';

interface Message {
  id: number;
  telegram_message_id: number;
  chat_id: string;
  sender_name: string;
  sender_photo?: string;
  type: string;
  content: string;
  timestamp: string;
  is_replied: boolean;
  is_outgoing?: boolean;
  accountId?: string;
}

interface Template {
  id: number;
  name: string;
  type: string;
  content: string;
  tags: string;
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [loading, setLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [view, setView] = useState<'chat' | 'stats'>('chat');
  const [accounts, setAccounts] = useState<Array<{ id: string; phone: string; firstName?: string; first_name?: string; lastName?: string; last_name?: string; username?: string; status?: string }>>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [unreadCountsByAccount, setUnreadCountsByAccount] = useState<Record<string, number>>({});
  const [recentMessageTimestamps, setRecentMessageTimestamps] = useState<number[]>([]);
  const [messageRateSeconds, setMessageRateSeconds] = useState<number>(0);
  const [stats, setStats] = useState<any>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [pendingSend, setPendingSend] = useState<{ type: string, content: any, name?: string } | null>(null);
  const [lastReadIds, setLastReadIds] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [userStatuses, setUserStatuses] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [telegramStatus, setTelegramStatus] = useState('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const navigate = useNavigate();
  const [qrError, setQrError] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [qrPasswordRequired, setQrPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const fetchStats = async () => {
    try {
      const res = await api.get('/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await api.get('/messages');
      setMessages(res.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/templates');
      setTemplates(res.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const checkTelegramConnection = () => {
    socket.emit('check_telegram_status');
  };

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      checkTelegramConnection();
    });

    // Always check telegram status when effect runs (not just on socket connect)
    checkTelegramConnection();

    fetchMessages();
    fetchTemplates();
    fetchStats();

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    socket.on('new_message', (msg: Message) => {
      setMessages(prev => {
        // Prevent duplicates
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
      fetchStats();
      setRecentMessageTimestamps(prev => [...prev, Date.now()]);

      // Show browser notification if it's an incoming message
      if (!msg.is_outgoing) {
        if (Notification.permission === 'granted') {
          new Notification(`New message from ${msg.sender_name}`, {
            body: msg.type === 'text' ? msg.content : `[${msg.type.toUpperCase()}]`,
            icon: msg.sender_photo || '/favicon.ico'
          });
        }
        
        // Play notification sound
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.play().catch(e => console.log('Audio play failed:', e));
      }
    });

    socket.on('message_updated', (update: { id: number, is_replied: number }) => {
      setMessages(prev => prev.map(m => m.id === update.id ? { ...m, is_replied: !!update.is_replied } : m));
      fetchStats();
    });

    socket.on('tg_status', (data) => setTelegramStatus(data.status));
    socket.on('tg_accounts_list', (list) => {
      setAccounts(list);
      setActiveAccountId(prev => {
        if (prev && list.some(a => a.id === prev)) return prev;
        if (list.length === 1) return list[0].id;
        return null;
      });
    });

    socket.on('tg_qr', (data) => {
      setQrCode(data.qr);
      setIsGeneratingQr(false);
    });
    socket.on('tg_error', (msg) => {
      setQrError(msg);
      setIsGeneratingQr(false);
    });
    socket.on('tg_password_required', () => {
      setQrPasswordRequired(true);
      setIsGeneratingQr(false);
    });
    socket.on('tg_connected', () => {
      setTelegramStatus('connected');
      setQrCode(null);
      setQrPasswordRequired(false);
      checkTelegramConnection();
    });

    socket.on('stats_update', (newStats) => {
      setStats(newStats);
    });

    socket.on('tg_typing', ({ chatId, typing }) => {
      setTypingUsers(prev => ({ ...prev, [chatId]: typing }));
      if (typing) {
        setTimeout(() => {
          setTypingUsers(prev => ({ ...prev, [chatId]: false }));
        }, 3500);
      }
    });

    socket.on('tg_read_status', ({ chatId, maxId }) => {
      setLastReadIds(prev => ({ ...prev, [chatId]: maxId }));
    });

    socket.on('tg_user_status', ({ chatId, status }) => {
      setUserStatuses(prev => ({ ...prev, [chatId]: status }));
    });

    const statusCheckInterval = setInterval(() => {
      if (telegramStatus !== 'connected') {
        socket.emit('check_telegram_status');
      }
    }, 5000);

    return () => {
      clearInterval(statusCheckInterval);
      socket.off('connect');
      socket.off('new_message');
      socket.off('message_updated');
      socket.off('tg_status');
      socket.off('tg_accounts_list');
      socket.off('tg_qr');
      socket.off('tg_error');
      socket.off('tg_password_required');
      socket.off('tg_connected');
      socket.off('stats_update');
      socket.off('tg_typing');
      socket.off('tg_read_status');
      socket.off('tg_user_status');
    };
  }, [telegramStatus]);

  const requestQr = () => {
    setIsGeneratingQr(true);
    setQrError(null);
    socket.emit('request_qr');
  };

  const submitPassword = () => {
    socket.emit('tg_submit_password', passwordInput);
    setPasswordInput('');
  };

  const handleTemplateReply = (template: Template) => {
    if (!selectedChatId) return;
    setPendingSend({ type: 'automation', content: template, name: template.name });
    setShowPreview(true);
    setShowTemplates(false);
  };

  const confirmSend = async () => {
    if (!pendingSend || !selectedChatId) return;
    
    setReplying(true);
    try {
      let res;
      if (pendingSend.type === 'automation') {
        const lastIncoming = messages.find(m => m.chat_id === selectedChatId && !m.is_outgoing);
        if (!lastIncoming) throw new Error('No message to reply to');
        res = await api.post('/reply', {
          messageId: lastIncoming.id,
          telegramMessageId: lastIncoming.telegram_message_id,
          accountId: lastIncoming.accountId,
          templateId: (pendingSend.content as Template).id
        });
      } else {
        const chatAccountId = activeChat?.accountId || activeAccountId;
        res = await api.post('/messages/send', {
          chatId: selectedChatId,
          type: pendingSend.type,
          content: pendingSend.content,
          accountId: chatAccountId,
        });
      }

      if (res.data && res.data.id) {
        const newMsg = res.data;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [newMsg, ...prev];
        });
      }

      setShowPreview(false);
      setPendingSend(null);
    } catch (error: any) {
      alert(error.message || 'Failed to send');
    } finally {
      setReplying(false);
    }
  };

  const handleSendText = async () => {
    if (!selectedChatId || !replyText.trim()) return;
    
    setReplying(true);
    try {
      const chatAccountId = activeChat?.accountId || activeAccountId;
      const res = await api.post('/messages/send', {
        chatId: selectedChatId,
        type: 'text',
        content: replyText,
        accountId: chatAccountId,
      });
      
      if (res.data && res.data.id) {
        const newMsg = res.data;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [newMsg, ...prev];
        });
      }
      
      setReplyText('');
    } catch (error: any) {
      alert(error.message || 'Failed to send message');
    } finally {
      setReplying(false);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChatId) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    const reader = new FileReader();
    reader.onload = () => {
      setPendingSend({
        type: isImage ? 'image' : isVideo ? 'video' : 'file',
        content: reader.result as string,
        name: file.name
      });
      setShowPreview(true);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChatId) return;

    const reader = new FileReader();
    reader.onload = () => {
      setPendingSend({
        type: 'video',
        content: reader.result as string,
        name: file.name
      });
      setShowPreview(true);
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
        const reader = new FileReader();
        reader.onload = () => {
          setPendingSend({
            type: 'voice',
            content: reader.result as string
          });
          setShowPreview(true);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      alert('Microphone permission denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  interface Conversation {
    chat_id: string;
    sender_name: string;
    sender_photo?: string;
    last_message: Message;
    accountId?: string;
  }

  const accountIds = new Set(accounts.map(a => a.id));
  const allVisibleMessages = messages.filter(m => accountIds.has(m.accountId || ''));
  const visibleMessages = activeAccountId ? allVisibleMessages.filter(m => m.accountId === activeAccountId) : allVisibleMessages;

  const conversations = Object.values<Conversation>(visibleMessages.reduce((acc, msg) => {
    if (!acc[msg.chat_id]) {
      acc[msg.chat_id] = {
        chat_id: msg.chat_id,
        sender_name: msg.sender_name,
        sender_photo: msg.sender_photo,
        last_message: msg,
        accountId: msg.accountId
      };
    } else {
      if (new Date(msg.timestamp) > new Date(acc[msg.chat_id].last_message.timestamp)) {
        acc[msg.chat_id].last_message = msg;
        if (!msg.is_outgoing && msg.sender_name && msg.sender_name !== 'Me') {
          acc[msg.chat_id].sender_name = msg.sender_name;
          acc[msg.chat_id].sender_photo = msg.sender_photo;
        }
      }
    }
    
    if ((!acc[msg.chat_id].sender_name || acc[msg.chat_id].sender_name === 'Me' || acc[msg.chat_id].sender_name === msg.chat_id) && !msg.is_outgoing && msg.sender_name && msg.sender_name !== 'Me') {
      acc[msg.chat_id].sender_name = msg.sender_name;
      acc[msg.chat_id].sender_photo = msg.sender_photo;
    }

    return acc;
  }, {} as Record<string, Conversation>)).sort((a, b) => new Date(b.last_message.timestamp).getTime() - new Date(a.last_message.timestamp).getTime());

  const activeChat = React.useMemo(() => 
    selectedChatId ? conversations.find(c => c.chat_id === selectedChatId) : null
  , [selectedChatId, conversations]);

  const activeChatMessages = React.useMemo(() => 
    visibleMessages.filter(m => m.chat_id === selectedChatId).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  , [selectedChatId, visibleMessages]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const getUserStatusText = (chatId: string) => {
    if (typingUsers[chatId]) return 'typing...';
    const status = userStatuses[chatId];
    if (status === 'online') return 'Online';
    if (status === 'recently') return 'Recently active';
    if (status === 'last_week') return 'Last seen this week';
    if (status === 'last_month') return 'Last seen this month';
    return 'Offline';
  };

  const getUserStatusColor = (chatId: string) => {
    const status = userStatuses[chatId];
    if (typingUsers[chatId]) return 'text-binance-green';
    if (status === 'online') return 'text-binance-green';
    if (status === 'recently') return 'text-binance-yellow';
    return 'text-binance-text-dim';
  };

  const getTrafficColor = (count: number) => {
    if (count >= 40) return 'bg-red-400';
    if (count >= 20) return 'bg-amber-400';
    if (count > 0) return 'bg-green-400';
    return 'bg-binance-text-dim';
  };

  useEffect(() => {
    if (selectedChatId) {
      scrollToBottom('auto');
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (activeChatMessages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [activeChatMessages.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 1000 * 60;
      setRecentMessageTimestamps(prev => prev.filter(ts => ts >= cutoff));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const windowCount = recentMessageTimestamps.length;
    setMessageRateSeconds(windowCount);
  }, [recentMessageTimestamps]);

  useEffect(() => {
    const counts: Record<string, number> = {};
    messages.forEach((m) => {
      if (!m.is_outgoing && !m.is_replied && m.accountId) {
        counts[m.accountId] = (counts[m.accountId] || 0) + 1;
      }
    });
    setUnreadCountsByAccount(counts);
  }, [messages, accounts]);

  const totalUnread = (Object.values(unreadCountsByAccount) as number[]).reduce((a, b) => a + b, 0);
  const getAccountUnread = (accountId: string) => unreadCountsByAccount[accountId] || 0;

  const filteredConversations = conversations.filter((c: Conversation) => 
    c.sender_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-binance-bg text-binance-text overflow-hidden font-sans">
      {/* Sidebar List */}
      <div className="w-[320px] lg:w-[380px] bg-binance-panel border-r border-binance-border flex flex-col z-20">
        <div className="p-4 border-b border-binance-border">
          <div className="mb-3 px-2 py-1 rounded-md bg-binance-card border border-binance-border">
            <label className="text-[11px] uppercase font-semibold text-binance-text-dim">Telegram Account</label>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={activeAccountId || ''}
                onChange={(e) => setActiveAccountId(e.target.value || null)}
                className="flex-1 px-2 py-1 bg-binance-bg border border-binance-border text-sm rounded outline-none"
              >
                <option value="">All accounts {totalUnread > 0 ? `(${totalUnread} unread)` : ''}</option>
                {accounts.map(ac => {
                  const unread = getAccountUnread(ac.id);
                  const displayName = ac.firstName || ac.first_name || ac.username || ac.phone || ac.id;
                  return <option key={ac.id} value={ac.id}>{displayName}{unread > 0 ? ` (${unread} unread)` : ''}</option>;
                })}
              </select>
              <span className={`w-2 h-2 rounded-full ${telegramStatus === 'connected' ? 'bg-binance-green' : 'bg-binance-red'}`} />
            </div>
            <p className="text-[10px] text-binance-text-dim mt-1">{telegramStatus === 'connected' ? 'Connected' : 'Disconnected'}</p>
          </div>


          <div className="flex bg-binance-card p-1 rounded-md mb-4">
            <button 
              onClick={() => setView('chat')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-semibold transition-all ${view === 'chat' ? 'bg-binance-panel text-binance-yellow shadow-sm' : 'text-binance-text-dim hover:text-binance-text'}`}
            >
              <MessageSquare size={14} /> Chats
            </button>
            <button 
              onClick={() => setView('stats')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-semibold transition-all ${view === 'stats' ? 'bg-binance-panel text-binance-yellow shadow-sm' : 'text-binance-text-dim hover:text-binance-text'}`}
            >
              <BarChart3 size={14} /> Markets
            </button>
          </div>
          
          {view === 'chat' && (
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-binance-text-dim" size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-binance-bg border border-binance-border rounded-md focus:border-binance-yellow outline-none transition-all text-sm text-binance-text placeholder-binance-text-dim"
              />
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {view === 'chat' ? (
            <motion.div 
              key="chat-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto"
            >
              <div className="py-2">
                {filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-xs text-binance-text-dim">
                    {telegramStatus !== 'connected'
                      ? 'Telegram disconnected: please relink in Settings'
                      : 'No messages: select account or connect Telegram.'}
                  </div>
                ) : filteredConversations.map(chat => {
                  const isActive = selectedChatId === chat.chat_id;
                  const isTyping = typingUsers[chat.chat_id];
                  const unreadCount = visibleMessages.filter(msg => msg.chat_id === chat.chat_id && !msg.is_outgoing && !msg.is_replied).length;
                  return (
                    <div
                      key={chat.chat_id}
                      onClick={() => setSelectedChatId(chat.chat_id)}
                      className={`px-4 py-3 cursor-pointer transition-all flex items-center gap-3 relative group ${
                        isActive ? 'bg-binance-card/80 border-l-4 border-binance-yellow' : 'hover:bg-binance-card/40 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        {chat.sender_photo && !failedImages[chat.chat_id] ? (
                          <img 
                            src={chat.sender_photo} 
                            alt={chat.sender_name} 
                            className="w-12 h-12 rounded-full object-cover bg-binance-bg ring-1 ring-binance-border" 
                            onError={() => setFailedImages(prev => ({ ...prev, [chat.chat_id]: true }))}
                          />
                        ) : (
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-colors ${
                            isActive ? 'bg-binance-yellow text-[#181a20]' : 'bg-binance-panel text-binance-text-dim group-hover:bg-binance-card'
                          }`}>
                            {chat.sender_name[0]}
                          </div>
                        )}
                        {userStatuses[chat.chat_id] === 'online' && (
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-binance-green border-2 border-binance-panel rounded-full shadow-sm" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <div className="min-w-0">
                            <span className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-binance-text'}`}>{chat.sender_name}</span>
                            <p className="text-[10px] text-binance-text-dim truncate max-w-[80%]">
                              {chat.accountId ? (() => {
                                const acc = accounts.find(a => a.id === chat.accountId);
                                return acc ? (acc.username || acc.firstName || acc.first_name || acc.phone || 'Linked') : 'Linked';
                              })() : 'No account'}
                            </p>
                          </div>
                          <span className="text-[10px] text-binance-text-dim whitespace-nowrap">
                            {format(new Date(chat.last_message.timestamp), 'dd/MM HH:mm')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col gap-0.5 max-w-[78%]">
                            <p className={`text-xs truncate ${isTyping ? 'text-binance-green font-medium animate-pulse' : 'text-binance-text-dim'}`}>
                              {isTyping ? (
                                'typing...'
                              ) : (
                                <>
                                  {chat.last_message.is_outgoing && <span className="text-binance-green/80 mr-1 text-[10px]">✓✓</span>}
                                  {chat.last_message.type === 'text' ? chat.last_message.content : `[${chat.last_message.type.toUpperCase()}]`}
                                </>
                              )}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className={`text-[10px] font-semibold ${getUserStatusColor(chat.chat_id)}`}>{getUserStatusText(chat.chat_id)}</p>
                              {unreadCount > 0 && (
                                <span className="text-[8px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">
                                  {unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="stats-menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="rounded-md bg-binance-card border border-binance-border p-3">
                <p className="text-xs font-semibold text-binance-text-dim uppercase tracking-wider mb-2">Telegram System Status</p>
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-binance-text">Socket.IO</span>
                  <span className="text-binance-green font-bold">CONNECTED</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-binance-text">Telegram Auth</span>
                  <span className={`font-bold ${telegramStatus === 'connected' ? 'text-binance-green' : 'text-binance-yellow'}`}>{telegramStatus.toUpperCase()}</span>
                </div>
              </div>

              {isGeneratingQr && (
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <div className="w-6 h-6 border-2 border-binance-yellow/30 border-t-binance-yellow rounded-full animate-spin" />
                  <span className="text-[10px] text-binance-text-dim italic font-medium">Generating Secure QR...</span>
                </div>
              )}

              {qrCode && (
                <div className="flex flex-col items-center gap-3 py-2 animate-in fade-in zoom-in duration-500">
                  <div className="p-2 bg-white rounded-lg shadow-inner ring-4 ring-white/5">
                    <img src={qrCode} alt="Telegram QR" className="w-32 h-32" />
                  </div>
                  <p className="text-[10px] text-center text-binance-text font-medium bg-binance-yellow/10 px-3 py-1.5 rounded-full border border-binance-yellow/20">
                    Scan with Telegram → Devices → Link Device
                  </p>
                  <button 
                    onClick={() => { setQrCode(null); setIsGeneratingQr(false); }}
                    className="text-[10px] text-binance-text-dim hover:text-white underline decoration-dotted underline-offset-4"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {qrPasswordRequired && (
                <div className="flex flex-col gap-2 pt-2 border-t border-binance-border/30">
                  <p className="text-[10px] text-binance-yellow font-bold">2-Step Verification Required</p>
                  <input 
                    type="password" 
                    placeholder="Enter 2FA Password" 
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full px-3 py-2 bg-binance-panel border border-binance-yellow/30 rounded text-xs focus:border-binance-yellow outline-none"
                  />
                  <button 
                    onClick={submitPassword}
                    className="w-full py-2 bg-binance-yellow text-[#181a20] rounded font-bold text-xs"
                  >
                    Submit Password
                  </button>
                </div>
              )}

              {qrError && (
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400 font-medium">
                  Error: {qrError}
                  <button onClick={requestQr} className="ml-2 underline">Retry</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative bg-binance-bg">
        {telegramStatus !== 'connected' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md p-6 bg-binance-panel border border-binance-border rounded-xl shadow-xl text-center">
              <p className="text-sm font-semibold text-binance-text">Telegram disconnected: please relink in Settings</p>
              <p className="text-xs text-binance-text-dim mt-2">Your messages are currently read-only until Telegram is connected.</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => navigate('/settings')}
                  className="w-full py-2 bg-binance-yellow text-[#181a20] rounded-md font-bold text-sm"
                >
                  Connect Telegram now
                </button>
                <button
                  onClick={() => socket.emit('check_telegram_status')}
                  className="w-full py-2 bg-binance-card text-binance-text rounded-md border border-binance-border text-sm"
                >
                  Retry status
                </button>
              </div>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {view === 'stats' ? (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                <div>
                  <h2 className="text-xl font-bold text-binance-text">Market Overview</h2>
                  <p className="text-xs text-binance-text-dim">Real-time incoming + outgoing counters (last 60s)</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-binance-green/10 rounded-full border border-binance-green/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-binance-green animate-pulse shadow-[0_0_8px_rgba(14,203,129,0.8)]" />
                    <span className="text-[10px] font-black text-binance-green uppercase tracking-widest">Reel Time Live</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-binance-panel rounded-full border border-binance-border">
                    <div className={`w-2 h-2 rounded-full ${getTrafficColor(messageRateSeconds)}`} />
                    <span className="text-[10px] font-bold text-binance-yellow">{messageRateSeconds}</span>
                    <span className="text-[10px] ml-1 text-binance-text-dim">/60s</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Messages', value: stats?.totalMessages, icon: MessageSquare, color: 'text-binance-text' },
                  { label: 'Active Users', value: stats?.totalUsers, icon: Users, color: 'text-binance-text' },
                  { label: 'Fill Rate (%)', value: stats?.totalMessages ? Math.round((stats.repliedMessages / stats.totalMessages) * 100) + '%' : '0%', icon: CheckCircle2, color: 'text-binance-green' },
                  { label: 'Avg Latency', value: '~4m', icon: Clock, color: 'text-binance-yellow' }
                ].map((stat, i) => (
                  <motion.div 
                    key={i} 
                    initial={false}
                    animate={{ scale: [1, 1.02, 1] }}
                    transition={{ duration: 0.3 }}
                    className="bg-binance-panel p-5 rounded-md border border-binance-border hover:border-binance-text-dim transition-colors group relative overflow-hidden"
                  >
                    <p className="text-xs font-medium text-binance-text-dim mb-2">{stat.label}</p>
                    <div className="flex items-end justify-between relative z-10">
                      <h3 className={`text-2xl font-bold ${stat.color} tabular-nums`}>{stat.value || 0}</h3>
                      <stat.icon size={20} className="text-binance-text-dim opacity-30 group-hover:opacity-50 transition-opacity" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="chat-active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col h-full relative"
            >
              {activeChat ? (
                <>
                  <div className="px-6 py-4 border-b border-binance-border flex items-center justify-between bg-binance-panel z-20">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {activeChat.sender_photo && !failedImages[activeChat.chat_id] ? (
                          <img 
                            src={activeChat.sender_photo} 
                            alt={activeChat.sender_name} 
                            className="w-10 h-10 rounded-full object-cover" 
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-binance-card text-binance-yellow flex items-center justify-center font-bold text-lg">
                            {activeChat.sender_name[0]}
                          </div>
                        )}
                        {userStatuses[activeChat.chat_id] === 'online' && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-binance-green border-2 border-binance-panel rounded-full" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-binance-text text-lg leading-tight">{activeChat.sender_name}</h3>
                        <div className="text-xs flex items-center gap-1.5 mt-0.5">
                          <span className={`font-bold ${getUserStatusColor(activeChat.chat_id)} ${typingUsers[activeChat.chat_id] ? 'animate-pulse' : ''}`}>
                            {getUserStatusText(activeChat.chat_id)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-1 bg-binance-bg relative">
                    <div className="chat-bg-pattern" />
                    
                    {activeChatMessages.map((msg, i) => {
                      const isMine = !!msg.is_outgoing;
                      const nextMsg = activeChatMessages[i + 1];
                      const prevMsg = activeChatMessages[i - 1];
                      
                      const isLastInGroup = !nextMsg || !!nextMsg.is_outgoing !== isMine;
                      const isFirstInGroup = !prevMsg || !!prevMsg.is_outgoing !== isMine;
                      
                      const showAvatar = !isMine && isLastInGroup;

                      return (
                        <div 
                          key={msg.id} 
                          className={`flex items-end gap-2 mb-1 ${isMine ? 'flex-row-reverse' : 'flex-row'} ${isLastInGroup ? 'mb-4' : 'mb-0.5'}`}
                        >
                          {!isMine && (
                            <div className="w-8 flex-shrink-0">
                              {showAvatar ? (
                                <img 
                                  src={msg.sender_photo || `https://ui-avatars.com/api/?name=${msg.sender_name}&background=1e2329&color=848e9c`} 
                                  className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-white/10" 
                                  alt="" 
                                />
                              ) : null}
                            </div>
                          )}
                          
                          <div className={`message-bubble max-w-[80%] sm:max-w-[70%] px-4 py-2.5 text-sm relative z-10 backdrop-blur-xl border transition-all ${
                            isMine 
                              ? `bg-[#0088cc]/60 border-white/20 text-white shadow-[0_8px_32px_0_rgba(0,136,204,0.2)] ${isLastInGroup ? 'rounded-2xl rounded-br-none message-bubble-tail-out' : 'rounded-2xl'}` 
                              : `bg-white/5 border-white/10 text-white/90 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ${isLastInGroup ? 'rounded-2xl rounded-bl-none message-bubble-tail-in' : 'rounded-2xl'}`
                          }`}>
                            {isFirstInGroup && !isMine && (
                              <span className="text-[11px] font-bold text-[#0088cc] mb-0.5">{msg.sender_name}</span>
                            )}
                            
                            {msg.type === 'text' && <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
                            {msg.type === 'image' && (
                              <div className="relative group overflow-hidden rounded-lg">
                                <img src={msg.content} className="max-h-72 w-full object-contain bg-black/20" alt="media" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                              </div>
                            )}
                            {msg.type === 'voice' && (
                              <audio controls preload="metadata" className="max-w-[240px]">
                                <source src={msg.content} type="audio/ogg" />
                                <source src={msg.content} type="audio/mpeg" />
                              </audio>
                            )}
                            {msg.type === 'video' && (
                              <video controls preload="metadata" className="max-h-72 w-full rounded-lg bg-black/20">
                                <source src={msg.content} type="video/mp4" />
                              </video>
                            )}
                            
                            <div className={`text-[9px] self-end font-semibold flex items-center gap-1.5 mt-0.5 ${isMine ? 'text-[#181a20]/70' : 'text-binance-text-dim'}`}>
                              {format(new Date(msg.timestamp), 'dd/MM HH:mm')}
                              {isMine && (
                                <span className="flex items-center">
                                  {(msg.telegram_message_id && lastReadIds[activeChat.chat_id] >= msg.telegram_message_id) 
                                    ? <span className="text-binance-green text-[10px] drop-shadow-sm">✓✓</span> 
                                    : <span className="text-[10px]">✓</span>}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} className="h-2" />
                  </div>

                  {/* Automation Overlay */}
                  <AnimatePresence>
                    {showTemplates && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-24 left-6 right-6 p-4 bg-binance-panel border border-binance-border rounded-lg shadow-xl z-30"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-bold text-binance-text flex items-center gap-2"><Activity size={16} className="text-binance-yellow" /> Select Auto-Reply</h4>
                          <button onClick={() => setShowTemplates(false)} className="text-binance-text-dim hover:text-binance-text transition-all">
                            <X size={18} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                          {templates.map(tmp => (
                            <button 
                              key={tmp.id} 
                              onClick={() => handleTemplateReply(tmp)} 
                              className="p-4 bg-binance-bg hover:bg-binance-card border border-binance-border rounded-md transition-all text-left flex flex-col gap-2 group"
                            >
                              <div className="flex justify-between items-center w-full">
                                <h5 className="text-sm font-semibold text-binance-text group-hover:text-binance-yellow transition-colors">{tmp.name}</h5>
                                <span className="text-[10px] bg-binance-panel px-2 py-0.5 rounded text-binance-text-dim border border-binance-border">{tmp.type.toUpperCase()}</span>
                              </div>
                              <p className="text-xs text-binance-text-dim line-clamp-2">
                                {tmp.type === 'flow' ? 'Multi-step sequence' : tmp.content}
                              </p>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Chat Input */}
                  <div className="p-4 bg-binance-panel border-t border-binance-border flex items-center gap-2 z-10">
                    <div className="flex items-center gap-0.5">
                      <button 
                        onClick={() => setShowTemplates(!showTemplates)}
                        className={`p-2 rounded-full transition-all ${showTemplates ? 'bg-binance-yellow text-[#181a20]' : 'text-binance-text-dim hover:text-binance-text hover:bg-binance-card'}`}
                        title="Auto-reply Templates"
                      >
                        <Zap size={20} />
                      </button>
                      <label 
                        className="p-2 text-binance-text-dim hover:text-binance-text hover:bg-binance-card rounded-full cursor-pointer transition-all" 
                        title="Attach Media"
                      >
                        <LayoutTemplate size={20} />
                        <input type="file" className="hidden" accept="image/*,video/mp4,video/quicktime" onChange={handleMediaUpload} />
                      </label>
                    </div>

                    <div className="chat-input-pill group shadow-lg">
                      <textarea 
                        value={replyText} 
                        onChange={(e) => setReplyText(e.target.value)} 
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }} 
                        placeholder="Type a message..." 
                        className="flex-1 bg-transparent border-none outline-none text-sm py-1 resize-none max-h-32 min-h-[24px] text-binance-text placeholder-binance-text-dim custom-scrollbar" 
                        rows={Math.min(replyText.split('\n').length, 4)} 
                      />
                      <button className="p-1.5 text-binance-text-dim hover:text-binance-yellow transition-colors">
                        <Activity size={18} />
                      </button>
                    </div>

                    {!replyText.trim() ? (
                      <button 
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`p-3 rounded-full transition-all ${isRecording ? 'bg-binance-red text-white animate-pulse' : 'bg-binance-card text-binance-text-dim hover:text-binance-text'}`}
                      >
                        <Mic size={20} />
                      </button>
                    ) : (
                      <button 
                        onClick={handleSendText} 
                        disabled={replying || telegramStatus !== 'connected'} 
                        className={`p-3 rounded-full shadow-lg transition-all flex items-center justify-center ${telegramStatus === 'connected' ? 'bg-binance-yellow text-[#181a20] hover:bg-binance-yellow-hover hover:scale-105 active:scale-95' : 'bg-binance-card text-binance-text-dim cursor-not-allowed'} ${replying ? 'opacity-50' : ''}`}
                      >
                        <Send size={20} />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center bg-binance-bg text-binance-text-dim">
                  <Activity size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-medium">Select a pair to start trading messages</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preview Modal Overlay */}
      <AnimatePresence>
        {showPreview && pendingSend && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-binance-panel rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-binance-border"
            >
              <div className="p-4 border-b border-binance-border flex justify-between items-center bg-binance-card">
                <h4 className="text-base font-bold text-binance-text flex items-center gap-2">
                  <Send size={16} className="text-binance-yellow" /> Confirm Order
                </h4>
                <button onClick={() => { setShowPreview(false); setPendingSend(null); }} className="text-binance-text-dim hover:text-binance-text">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {pendingSend.type === 'automation' && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-binance-text-dim mb-1">Asset Name</p>
                      <p className="text-sm font-medium text-binance-text bg-binance-bg p-3 rounded border border-binance-border">{(pendingSend.content as Template).name}</p>
                    </div>
                  </div>
                )}
                {pendingSend.type === 'image' && (
                  <div className="space-y-2">
                    <img src={pendingSend.content} className="w-full rounded border border-binance-border object-contain max-h-[50vh]" alt="preview" />
                    <p className="text-xs text-center text-binance-text-dim">{pendingSend.name}</p>
                  </div>
                )}
                {pendingSend.type === 'image' && (
                  <div className="space-y-2">
                    <img src={pendingSend.content} className="w-full rounded border border-binance-border object-contain" alt="preview" />
                    <p className="text-xs text-center text-binance-text-dim">{pendingSend.name}</p>
                  </div>
                )}
                {pendingSend.type === 'video' && (
                  <div className="space-y-2">
                    <video src={pendingSend.content} className="w-full rounded border border-binance-border" controls />
                    <p className="text-xs text-center text-binance-text-dim">{pendingSend.name}</p>
                  </div>
                )}
                </div>

                <div className="p-4 bg-binance-card border-t border-binance-border flex gap-3">
                <button 
                  onClick={() => { setShowPreview(false); setPendingSend(null); }} 
                  className="flex-1 py-2.5 text-sm font-medium text-binance-text bg-binance-panel border border-binance-border rounded hover:bg-binance-bg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmSend}
                  disabled={replying}
                  className="flex-1 py-2.5 bg-binance-yellow text-[#181a20] rounded font-bold text-sm hover:bg-binance-yellow-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {replying ? <div className="w-4 h-4 border-2 border-[#181a20]/30 border-t-[#181a20] rounded-full animate-spin" /> : 'Execute'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
