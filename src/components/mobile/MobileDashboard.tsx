import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  Search, Menu, MessageSquare, ArrowLeft, Send, Image as ImageIcon, 
  Mic, MoreVertical, X, Zap, Activity, Clock, CheckCircle2, 
  BarChart3, Users, Settings as SettingsIcon, LogOut, Video, FileVideo, LayoutTemplate,
  Plus, Trash2, Edit2, Save, Smartphone, ShieldCheck, AlertCircle, QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../lib/api';
import socket from '../../lib/socket';

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
  account_id?: string;
}

interface Template {
  id: number;
  name: string;
  type: string;
  content: string;
  tags: string;
}

interface Conversation {
  chat_id: string;
  sender_name: string;
  sender_photo?: string;
  last_message: Message;
  account_id?: string;
}

export default function MobileDashboard() {
  // Navigation State
  const [currentView, setCurrentView] = useState<'chats' | 'templates' | 'settings'>('chats');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Data States
  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [replying, setReplying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [userStatuses, setUserStatuses] = useState<Record<string, string>>({});
  const [lastReadIds, setLastReadIds] = useState<Record<string, number>>({});
  const [telegramStatus, setTelegramStatus] = useState('disconnected');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  
  // Media & Voice States
  const [showPreview, setShowPreview] = useState(false);
  const [pendingSend, setPendingSend] = useState<{ type: string, content: any, name?: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  // Template Manager States
  const [isEditingTemplate, setIsEditingTemplate] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<Partial<Template>>({});
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  // Settings States
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
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const timerRef = useRef<any>(null);

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

  useEffect(() => {
    socket.connect();
    socket.emit('check_telegram_status');

    fetchMessages();
    fetchTemplates();

    socket.on('new_message', (msg: Message) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
    });

    socket.on('message_updated', (update: { id: number, is_replied: boolean }) => {
      setMessages(prev => prev.map(m => m.id === update.id ? { ...m, is_replied: update.is_replied } : m));
    });

    socket.on('chat_history', ({ chatId, messages: cloudMsgs }) => {
      setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.telegram_message_id || m.telegramMessageId));
          const newMsgs = cloudMsgs.map((m: any) => ({
              ...m,
              id: m.telegramMessageId,
              telegram_message_id: m.telegramMessageId,
              chat_id: m.senderId,
              content: m.text,
              is_replied: m.isReplied,
              is_outgoing: m.isOutgoing,
              account_id: m.accountId,
              sender_name: m.senderName,
              sender_photo: m.senderPhoto
          })).filter((m: any) => !existingIds.has(m.telegram_message_id));
          return [...newMsgs, ...prev].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      });
    });

    socket.on('tg_status', (data) => setTelegramStatus(data.status));
    socket.on('tg_accounts_list', (list) => {
      setAccounts(list);
      setActiveAccountId(prev => {
        if (prev && list.some((a: any) => a.id === prev)) return prev;
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
      setIsSettingsLoading(false);
    });
    socket.on('tg_password_required', () => {
      setQrPasswordRequired(true);
      setIsGeneratingQr(false);
      setIsSettingsLoading(false);
    });
    socket.on('tg_code_required', () => {
      setCodeRequired(true);
      setIsSettingsLoading(false);
    });
    socket.on('tg_connected', () => {
      setShowAddAccount(false);
      socket.emit('check_telegram_status');
      setQrCode(null);
      setQrPasswordRequired(false);
      setCodeRequired(false);
      setIsSettingsLoading(false);
    });

    socket.on('tg_typing', ({ chatId, typing }) => {
      setTypingUsers(prev => ({ ...prev, [chatId]: typing }));
      if (typing) {
        setTimeout(() => setTypingUsers(prev => ({ ...prev, [chatId]: false })), 3500);
      }
    });

    socket.on('tg_read_status', ({ chatId, maxId }) => {
      setLastReadIds(prev => ({ ...prev, [chatId]: maxId }));
    });

    socket.on('tg_user_status', ({ chatId, status }) => {
      setUserStatuses(prev => ({ ...prev, [chatId]: status }));
    });

    return () => {
      socket.off('new_message');
      socket.off('message_updated');
      socket.off('tg_status');
      socket.off('tg_accounts_list');
      socket.off('tg_qr');
      socket.off('tg_error');
      socket.off('tg_password_required');
      socket.off('tg_code_required');
      socket.off('tg_connected');
      socket.off('tg_typing');
      socket.off('tg_read_status');
      socket.off('tg_user_status');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSendText = async () => {
    if (!selectedChatId || !replyText.trim()) return;
    
    setReplying(true);
    try {
      const chatAccountId = activeChat?.account_id || activeAccountId;
      const res = await api.post('/messages/send', {
        chatId: selectedChatId,
        type: 'text',
        content: replyText,
        accountId: chatAccountId,
      });
      
      if (res.data && res.data.id) {
        setMessages(prev => [res.data, ...prev]);
      }
      setReplyText('');
    } catch (error: any) {
      alert(error.message || 'Failed to send');
    } finally {
      setReplying(false);
    }
  };

  const handleTemplateReply = (template: Template) => {
    if (!selectedChatId) return;
    setPendingSend({ type: 'automation', content: template, name: template.name });
    setShowPreview(true);
    setShowTemplates(false);
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

  // Voice Recording Functions
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
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone permission denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
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
          templateId: (pendingSend.content as Template).id
        });
      } else {
        const chatAccountId = activeChat?.account_id || activeAccountId;
        res = await api.post('/messages/send', {
          chatId: selectedChatId,
          type: pendingSend.type,
          content: pendingSend.content,
          accountId: chatAccountId,
        });
      }

      if (res.data && res.data.id) {
        setMessages(prev => [res.data, ...prev]);
      }

      setShowPreview(false);
      setPendingSend(null);
    } catch (error: any) {
      alert(error.message || 'Failed to send');
    } finally {
      setReplying(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Template Handlers
  const saveTemplate = async () => {
    try {
      if (isCreatingTemplate) {
        const res = await api.post('/templates', { ...templateForm, id: Date.now() });
        setTemplates([...templates, res.data]);
        setIsCreatingTemplate(false);
      } else if (isEditingTemplate) {
        const res = await api.put(`/templates/${isEditingTemplate}`, templateForm);
        setTemplates(templates.map(t => t.id === isEditingTemplate ? res.data : t));
        setIsEditingTemplate(null);
      }
      setTemplateForm({});
    } catch (error: any) {
      alert(error.response?.data?.error || error.message || 'Failed to save template');
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (error: any) {
      alert(error.message || 'Failed to delete template');
    }
  };

  // Settings Handlers
  const requestQr = () => {
    setIsGeneratingQr(true);
    setQrError(null);
    socket.emit('request_qr');
  };

  const handleSendPhone = () => {
    setIsSettingsLoading(true);
    setQrError(null);
    socket.emit('tg_send_phone', phoneInput);
  };

  const handleSubmitCode = () => {
    setIsSettingsLoading(true);
    socket.emit('tg_submit_code', codeInput);
  };

  const submitPassword = () => {
    setIsSettingsLoading(true);
    socket.emit('tg_submit_password', passwordInput);
    setPasswordInput('');
  };

  const handleLogoutTelegram = (accountId: string) => {
    if (confirm('Disconnect this Telegram account?')) {
      socket.emit('logout_telegram', accountId);
    }
  };

  // Logic to compute conversations
  const accountIds = new Set((Array.isArray(accounts) ? accounts : []).map(a => String(a.id)));
  const allVisibleMessages = (Array.isArray(messages) ? messages : []).filter(m => accountIds.has(String(m.accountId || m.account_id || '')));
  const visibleMessages = activeAccountId ? allVisibleMessages.filter(m => String(m.accountId || m.account_id) === String(activeAccountId)) : allVisibleMessages;

  const conversations = Object.values<Conversation>((Array.isArray(visibleMessages) ? visibleMessages : []).reduce((acc, msg) => {
    const chatId = String(msg.senderId || msg.chat_id);
    if (!acc[chatId]) {
      acc[chatId] = {
        chat_id: chatId,
        sender_name: msg.senderName || msg.sender_name,
        sender_photo: msg.senderPhoto || msg.sender_photo,
        last_message: msg,
        account_id: msg.accountId || msg.account_id
      };
    } else {
      const msgTime = new Date(msg.timestamp).getTime();
      const lastMsgTime = new Date(acc[chatId].last_message.timestamp).getTime();
      if (msgTime > lastMsgTime) {
        acc[chatId].last_message = msg;
        if (!(msg.isOutgoing || msg.is_outgoing) && (msg.senderName || msg.sender_name) && (msg.senderName || msg.sender_name) !== 'Me') {
          acc[chatId].sender_name = msg.senderName || msg.sender_name;
          acc[chatId].sender_photo = msg.senderPhoto || msg.sender_photo;
        }
      }
    }

    if ((!acc[chatId].sender_name || acc[chatId].sender_name === 'Me') && !(msg.isOutgoing || msg.is_outgoing) && (msg.senderName || msg.sender_name) && (msg.senderName || msg.sender_name) !== 'Me') {
      acc[chatId].sender_name = msg.senderName || msg.sender_name;
      acc[chatId].sender_photo = msg.senderPhoto || msg.sender_photo;
    }

    return acc;
  }, {} as Record<string, Conversation>)).sort((a, b) => new Date(b.last_message.timestamp).getTime() - new Date(a.last_message.timestamp).getTime());

  const activeChat = React.useMemo(() => 
    selectedChatId ? conversations.find(c => String(c.chat_id) === String(selectedChatId)) : null
  , [selectedChatId, conversations]);

  const activeChatMessages = React.useMemo(() => 
    visibleMessages.filter(m => String(m.senderId || m.chat_id) === String(selectedChatId)).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  , [selectedChatId, visibleMessages]);

  useEffect(() => {
    if (selectedChatId && activeChat) {
      socket.emit('tg_get_history', { accountId: activeChat.account_id, chatId: selectedChatId });
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (activeChatMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChatMessages.length]);

  const filteredConversations = conversations.filter(c => 
    (c.sender_name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getUnreadCount = (chatId: string) => {
    return visibleMessages.filter(msg => String(msg.senderId || msg.chat_id) === String(chatId) && !(msg.isOutgoing || msg.is_outgoing) && !(msg.isReplied || msg.is_replied)).length;
  };

  const getUserStatusText = (chatId: string) => {
    if (typingUsers[chatId]) return 'typing...';
    const status = userStatuses[chatId];
    if (status === 'online') return 'Online';
    if (status === 'recently') return 'Recently active';
    return 'Offline';
  };

  // Rendering Functions
  const renderSideMenu = () => (
    <AnimatePresence>
      {isMenuOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm"
          />
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            className="fixed top-0 left-0 bottom-0 w-[280px] bg-binance-panel z-[101] p-6 flex flex-col border-r border-white/5 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 bg-[#0088cc]/20 rounded-xl flex items-center justify-center border border-[#0088cc]/30 shadow-[0_0_15px_rgba(0,136,204,0.2)]">
                <Activity className="text-[#0088cc]" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">OTO DASH</h2>
                <p className="text-[10px] text-binance-text-dim font-bold uppercase tracking-widest">Mobile Pro</p>
              </div>
            </div>
            <nav className="flex-1 space-y-3">
              <button 
                onClick={() => { setIsMenuOpen(false); setCurrentView('chats'); setSelectedChatId(null); }} 
                className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${currentView === 'chats' ? 'bg-[#0088cc]/10 text-[#0088cc] font-bold border border-[#0088cc]/20' : 'text-binance-text-dim hover:bg-white/5'}`}
              >
                <MessageSquare size={20} /> Messages
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); setCurrentView('templates'); }} 
                className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${currentView === 'templates' ? 'bg-[#0088cc]/10 text-[#0088cc] font-bold border border-[#0088cc]/20' : 'text-binance-text-dim hover:bg-white/5'}`}
              >
                <Zap size={20} /> Templates
              </button>
              <button 
                onClick={() => { setIsMenuOpen(false); setCurrentView('settings'); }} 
                className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${currentView === 'settings' ? 'bg-[#0088cc]/10 text-[#0088cc] font-bold border border-[#0088cc]/20' : 'text-binance-text-dim hover:bg-white/5'}`}
              >
                <SettingsIcon size={20} /> Settings
              </button>
            </nav>
            <div className="mt-auto pt-6 border-t border-white/5">
              <button 
                onClick={() => { localStorage.clear(); window.location.reload(); }}
                className="w-full flex items-center gap-3 p-4 text-red-400 font-bold bg-red-500/5 rounded-2xl border border-red-500/10 active:scale-95 transition-transform"
              >
                <LogOut size={20} /> Logout
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  const renderTemplatesView = () => (
    <div className="flex flex-col h-screen bg-binance-bg text-binance-text w-full font-sans overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-binance-border bg-binance-panel z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)}><Menu size={24} /></button>
          <h1 className="text-xl font-bold">Templates</h1>
        </div>
        <button 
          onClick={() => { setIsCreatingTemplate(true); setTemplateForm({ type: 'text', name: '', content: '' }); }}
          className="w-10 h-10 bg-[#0088cc] rounded-full flex items-center justify-center shadow-lg shadow-[#0088cc]/30"
        >
          <Plus size={24} className="text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {(Array.isArray(templates) ? templates : []).map(tmp => (
          <div key={tmp.id} className="bg-binance-panel p-4 rounded-2xl border border-white/5 shadow-xl relative group">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-base text-white">{tmp.name}</h3>
                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/10 text-binance-text-dim uppercase font-bold tracking-tighter">
                  {tmp.type}
                </span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setIsEditingTemplate(tmp.id); setTemplateForm(tmp); }}
                  className="p-2 bg-white/5 rounded-lg text-binance-text-dim"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => deleteTemplate(tmp.id)}
                  className="p-2 bg-red-500/10 rounded-lg text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <p className="text-sm text-binance-text-dim line-clamp-3 italic">"{tmp.content}"</p>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(isCreatingTemplate || isEditingTemplate) && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 bg-black/90 z-[200] p-6 flex flex-col"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">{isCreatingTemplate ? 'New Strategy' : 'Edit Strategy'}</h2>
              <button onClick={() => { setIsCreatingTemplate(false); setIsEditingTemplate(null); }} className="p-2"><X size={28} /></button>
            </div>
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-xs font-bold text-binance-text-dim uppercase tracking-widest">Name</label>
                <input 
                  type="text" 
                  value={templateForm.name || ''} 
                  onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[#0088cc]"
                  placeholder="e.g. Greeting"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-binance-text-dim uppercase tracking-widest">Type</label>
                <select 
                  value={templateForm.type || 'text'} 
                  onChange={e => setTemplateForm({ ...templateForm, type: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none"
                >
                  <option value="text">Text</option>
                  <option value="image">Image URL</option>
                  <option value="video">Video URL</option>
                  <option value="voice">Voice URL</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-binance-text-dim uppercase tracking-widest">Content</label>
                <textarea 
                  value={templateForm.content || ''} 
                  onChange={e => setTemplateForm({ ...templateForm, content: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-[#0088cc] min-h-[150px]"
                  placeholder="Type your message here..."
                />
              </div>
            </div>
            <button 
              onClick={saveTemplate}
              className="w-full py-4 bg-[#0088cc] rounded-2xl font-bold text-white shadow-xl mt-6 active:scale-95 transition-transform"
            >
              SAVE STRATEGY
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderSettingsView = () => (
    <div className="flex flex-col h-screen bg-binance-bg text-binance-text w-full font-sans overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-binance-border bg-binance-panel z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)}><Menu size={24} /></button>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* System Status Section */}
        <section className="space-y-3">
          <h3 className="text-xs font-black text-binance-text-dim uppercase tracking-widest px-2">System Status</h3>
          <div className="bg-binance-panel p-5 rounded-2xl border border-white/5 shadow-xl backdrop-blur-xl">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm">Socket Service</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-binance-green shadow-[0_0_8px_#0ecb81]" />
                <span className="text-xs font-bold text-binance-green">ONLINE</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Telegram Link</span>
              <span className={`text-xs font-black ${telegramStatus === 'connected' ? 'text-binance-green' : 'text-binance-yellow'}`}>
                {telegramStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </section>

        {/* Linked Accounts Section */}
        <section className="space-y-3">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-xs font-black text-binance-text-dim uppercase tracking-widest">Accounts ({accounts.length})</h3>
            <button onClick={() => setShowAddAccount(true)} className="text-[10px] font-bold text-[#0088cc] border border-[#0088cc]/30 px-3 py-1 rounded-full">+ ADD</button>
          </div>
          <div className="space-y-3">
            {(Array.isArray(accounts) ? accounts : []).map(acc => (
              <div key={acc.id} className="bg-binance-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                  {acc.photo ? (
                    <img src={acc.photo} className="w-12 h-12 rounded-full border border-white/10" alt="" />
                  ) : (
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                      <Smartphone size={24} className="text-binance-text-dim" />
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-white">{acc.first_name}</h4>
                    <p className="text-xs text-binance-text-dim">+{acc.phone}</p>
                  </div>
                </div>
                <button onClick={() => handleLogoutTelegram(acc.id)} className="p-3 text-red-400 bg-red-500/5 rounded-xl"><X size={20} /></button>
              </div>
            ))}
            {accounts.length === 0 && (
              <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center">
                <ShieldCheck className="mx-auto mb-2 text-white/5" size={40} />
                <p className="text-xs text-binance-text-dim">No accounts connected yet.</p>
              </div>
            )}
          </div>
        </section>

        {/* Add Account Panel */}
        <AnimatePresence>
          {showAddAccount && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1e2329] p-6 rounded-3xl border border-[#0088cc]/30 shadow-[0_0_40px_rgba(0,136,204,0.1)] relative"
            >
              <button onClick={() => setShowAddAccount(false)} className="absolute top-4 right-4 text-binance-text-dim"><X size={20}/></button>
              <h3 className="font-bold text-lg mb-6">Link New Account</h3>

              {!qrCode && !isGeneratingQr && !codeRequired && !qrPasswordRequired && (
                <div className="space-y-6">
                  <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
                    <button onClick={() => setLoginMode('qr')} className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${loginMode === 'qr' ? 'bg-[#0088cc] text-white shadow-lg' : 'text-binance-text-dim'}`}>QR CODE</button>
                    <button onClick={() => setLoginMode('phone')} className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${loginMode === 'phone' ? 'bg-[#0088cc] text-white shadow-lg' : 'text-binance-text-dim'}`}>PHONE</button>
                  </div>
                  {loginMode === 'qr' ? (
                    <button onClick={requestQr} className="w-full py-4 bg-[#0088cc] text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-transform">GENERATE QR</button>
                  ) : (
                    <div className="space-y-4">
                      <input type="text" placeholder="+855..." value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} className="w-full px-5 py-4 bg-black/20 border border-white/10 rounded-2xl text-white outline-none focus:border-[#0088cc]" />
                      <button onClick={handleSendPhone} className="w-full py-4 bg-[#0088cc] text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-transform">SEND OTP</button>
                    </div>
                  )}
                </div>
              )}

              {isGeneratingQr && <div className="py-10 flex flex-col items-center gap-4"><div className="w-12 h-12 border-4 border-[#0088cc]/30 border-t-[#0088cc] rounded-full animate-spin" /><p className="text-xs font-bold text-[#0088cc]">AUTHENTICATING...</p></div>}
              {qrCode && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="p-3 bg-white rounded-3xl shadow-[0_0_30px_rgba(255,255,255,0.1)]"><img src={qrCode} className="w-48 h-48" /></div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white mb-1">Scan with Telegram</p>
                    <p className="text-xs text-binance-text-dim">Settings → Devices → Link Desktop Device</p>
                  </div>
                  <button onClick={() => setQrCode(null)} className="text-xs text-red-400 font-bold underline">Cancel Generation</button>
                </div>
              )}
              {codeRequired && (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-[#0088cc] text-center uppercase tracking-widest">Verification Required</p>
                  <input type="text" placeholder="5-DIGIT OTP" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} className="w-full px-5 py-5 bg-black/20 border border-[#0088cc] rounded-2xl text-center text-3xl font-black text-white outline-none shadow-[0_0_20px_rgba(0,136,204,0.1)]" />
                  <button onClick={handleSubmitCode} className="w-full py-4 bg-[#0088cc] text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-transform">VERIFY DEVICE</button>
                </div>
              )}
              {qrPasswordRequired && (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-red-400 text-center uppercase tracking-widest">2FA Security Enabled</p>
                  <input type="password" placeholder="Cloud Password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full px-5 py-4 bg-black/20 border border-white/10 rounded-2xl text-white outline-none focus:border-[#0088cc]" />
                  <button onClick={submitPassword} className="w-full py-4 bg-[#0088cc] text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-transform">UNLOCKED ACCOUNT</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  // Main Render Logic
  if (currentView === 'templates') return (
    <>
      {renderTemplatesView()}
      {renderSideMenu()}
    </>
  );

  if (currentView === 'settings') return (
    <>
      {renderSettingsView()}
      {renderSideMenu()}
    </>
  );

  // View: Chat List
  if (!selectedChatId) {
    return (
      <div className="flex flex-col h-screen bg-binance-bg text-binance-text w-full font-sans overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-binance-border bg-binance-panel z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMenuOpen(true)}>
              <Menu className="text-binance-text" size={24} />
            </button>
            <h1 className="text-xl font-bold text-binance-yellow">OTO Messages</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${telegramStatus === 'connected' ? 'bg-binance-green' : 'bg-binance-red'}`} />
            <div className="w-8 h-8 bg-binance-card rounded-full flex items-center justify-center border border-binance-border">
              <span className="text-xs font-bold">Admin</span>
            </div>
          </div>
        </div>

        {/* Account Switcher & Search */}
        <div className="p-3 bg-binance-panel border-b border-binance-border space-y-3">
          <select
            value={activeAccountId || ''}
            onChange={(e) => setActiveAccountId(e.target.value || null)}
            className="w-full px-3 py-2 bg-binance-bg border border-binance-border text-sm rounded-lg outline-none text-binance-text"
          >
            <option value="">All Accounts</option>
            {(Array.isArray(accounts) ? accounts : []).map(ac => (
              <option key={ac.id} value={ac.id}>{ac.first_name || ac.username || ac.phone}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-binance-text-dim" size={18} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-binance-card border border-binance-border rounded-full py-2 pl-10 pr-4 text-sm text-binance-text outline-none focus:border-binance-yellow"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center p-8">
              <div className="w-6 h-6 border-2 border-binance-yellow border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && filteredConversations.map(chat => {
            const unread = getUnreadCount(chat.chat_id);
            const isTyping = typingUsers[chat.chat_id];
            
            return (
              <div 
                key={chat.chat_id} 
                onClick={() => setSelectedChatId(chat.chat_id)}
                className="flex items-center gap-3 p-4 border-b border-binance-border/30 active:bg-binance-card transition-colors relative"
              >
                <div className="relative flex-shrink-0">
                  {chat.sender_photo && !failedImages[chat.chat_id] ? (
                    <img 
                      src={chat.sender_photo} 
                      alt={chat.sender_name} 
                      className="w-14 h-14 rounded-full object-cover bg-binance-panel ring-1 ring-binance-border"
                      onError={() => setFailedImages(prev => ({ ...prev, [chat.chat_id]: true }))}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-binance-panel flex items-center justify-center text-xl font-bold text-binance-text-dim">
                      {chat.sender_name?.[0] || '?'}
                    </div>
                  )}
                  {userStatuses[chat.chat_id] === 'online' && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-binance-green border-2 border-binance-bg rounded-full" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-binance-text truncate">{chat.sender_name}</h3>
                    <span className="text-[10px] text-binance-text-dim flex-shrink-0">
                      {format(new Date(chat.last_message.timestamp), 'HH:mm')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-sm truncate ${isTyping ? 'text-binance-green animate-pulse' : 'text-binance-text-dim'}`}>
                      {isTyping ? 'typing...' : (
                        <>
                          {chat.last_message.is_outgoing && <span className="text-binance-green mr-1">✓✓</span>}
                          {chat.last_message.type === 'text' ? chat.last_message.content : `[${chat.last_message.type.toUpperCase()}]`}
                        </>
                      )}
                    </p>
                    {unread > 0 && (
                      <div className="ml-2 px-2 py-0.5 bg-binance-yellow rounded-full">
                        <span className="text-[10px] font-bold text-[#181a20]">{unread}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && filteredConversations.length === 0 && (
            <div className="p-10 text-center text-binance-text-dim text-sm">
              No conversations found
            </div>
          )}
        </div>

        {renderSideMenu()}
      </div>
    );
  }

  // View: Active Chat
  return (
    <div className="flex flex-col h-screen bg-binance-bg text-binance-text w-full font-sans overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-binance-border bg-binance-panel z-30">
        <button onClick={() => setSelectedChatId(null)} className="p-1 -ml-1 active:bg-binance-card rounded-full transition-colors">
          <ArrowLeft size={24} className="text-binance-text" />
        </button>
        <div className="relative flex-shrink-0">
          {activeChat?.sender_photo && !failedImages[activeChat.chat_id] ? (
            <img src={activeChat.sender_photo} className="w-10 h-10 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-binance-card flex items-center justify-center font-bold text-binance-yellow">
              {activeChat?.sender_name?.[0] || '?'}
            </div>
          )}
          {userStatuses[selectedChatId] === 'online' && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-binance-green border-2 border-binance-panel rounded-full" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-binance-text truncate text-base leading-tight">{activeChat?.sender_name}</h2>
          <span className={`text-[10px] font-bold ${typingUsers[selectedChatId] ? 'text-binance-green animate-pulse' : 'text-binance-text-dim'}`}>
            {getUserStatusText(selectedChatId)}
          </span>
        </div>
        <button className="p-1 active:bg-binance-card rounded-full transition-colors text-binance-text-dim">
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0b0e11] relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#848e9c 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }} />
        
        {activeChatMessages.map((msg, i) => {
          const isMine = !!msg.is_outgoing;
          const nextMsg = activeChatMessages[i + 1];
          const isLastInGroup = !nextMsg || !!nextMsg.is_outgoing !== isMine;

          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-4' : 'mb-1'}`}>
              <div className={`max-w-[85%] px-4 py-2.5 text-sm relative backdrop-blur-xl border transition-all ${
                isMine 
                  ? 'bg-[#0088cc]/60 border-white/20 text-white rounded-2xl rounded-tr-sm shadow-[0_8px_32px_0_rgba(0,136,204,0.2)]' 
                  : 'bg-white/5 border-white/10 text-white/90 rounded-2xl rounded-tl-sm shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]'
              }`}>
                {msg.type === 'text' && <p className="whitespace-pre-wrap">{msg.content}</p>}
                {msg.type === 'image' && <img src={msg.content} className="rounded-lg max-h-60 w-full object-cover" alt="" />}
                {msg.type === 'video' && <video src={msg.content} className="rounded-lg max-h-60 w-full" controls />}
                {msg.type === 'voice' && (
                  <div className="flex items-center gap-2 min-w-[150px] py-1">
                    <Mic size={16} className={isMine ? 'text-white' : 'text-binance-yellow'} />
                    <audio src={msg.content} controls className="h-8 max-w-[180px]" />
                  </div>
                )}
                
                <div className={`text-[9px] mt-1 flex justify-end gap-1 font-semibold ${isMine ? 'text-white/60' : 'text-binance-text-dim'}`}>
                  {format(new Date(msg.timestamp), 'HH:mm')}
                  {isMine && (
                    <span>
                      {(msg.telegram_message_id && lastReadIds[selectedChatId] >= msg.telegram_message_id) ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Templates Overlay */}
      <AnimatePresence>
        {showTemplates && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowTemplates(false)}
              className="fixed inset-0 bg-black/40 z-40"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 bg-binance-panel border-t border-binance-border rounded-t-3xl p-4 z-50 max-h-[70vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 sticky top-0 bg-binance-panel py-2 border-b border-binance-border/30">
                <h3 className="font-bold flex items-center gap-2"><Zap className="text-binance-yellow" size={18} /> Templates</h3>
                <button onClick={() => setShowTemplates(false)}><X size={20} /></button>
              </div>
              <div className="space-y-3 pb-6">
                {(Array.isArray(templates) ? templates : []).map(tmp => (
                  <button 
                    key={tmp.id} 
                    onClick={() => handleTemplateReply(tmp)}
                    className="w-full p-4 bg-binance-bg border border-binance-border rounded-xl text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-binance-text text-sm">{tmp.name}</span>
                      <span className="text-[10px] bg-binance-panel px-2 py-0.5 rounded text-binance-text-dim border border-binance-border uppercase">{tmp.type}</span>
                    </div>
                    <p className="text-xs text-binance-text-dim line-clamp-2">{tmp.content}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="p-3 bg-binance-panel border-t border-binance-border flex items-end gap-2 z-30">
        {!isRecording ? (
          <>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowTemplates(true)}
                className={`p-2 rounded-full transition-colors ${showTemplates ? 'text-binance-yellow' : 'text-binance-text-dim'}`}
              >
                <Zap size={24} />
              </button>
              <label className="p-2 text-binance-text-dim active:text-binance-text transition-colors cursor-pointer">
                <ImageIcon size={24} />
                <input type="file" className="hidden" accept="image/*,video/mp4,video/quicktime" onChange={handleMediaUpload} />
              </label>
            </div>
            <div className="flex-1 bg-binance-bg rounded-2xl border border-binance-border flex items-end min-h-[44px] shadow-inner">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                placeholder="Message..."
                className="w-full bg-transparent border-none outline-none py-3 px-3 text-sm resize-none max-h-32"
                rows={1}
                style={{ minHeight: '44px' }}
              />
            </div>
            {replyText.trim() ? (
              <button 
                onClick={handleSendText}
                disabled={replying || telegramStatus !== 'connected'}
                className="w-11 h-11 bg-[#0088cc] rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-lg active:scale-90 transition-transform disabled:opacity-50"
              >
                <Send size={20} className="ml-1" />
              </button>
            ) : (
              <button 
                onClick={startRecording}
                className="w-11 h-11 bg-binance-card rounded-full flex items-center justify-center text-binance-text-dim flex-shrink-0 active:scale-90 transition-transform"
              >
                <Mic size={20} />
              </button>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-between bg-binance-bg rounded-2xl border border-red-500/50 p-2 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 ml-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-bold tabular-nums text-red-500">{formatTime(recordingTime)}</span>
            </div>
            <p className="text-xs text-binance-text-dim italic">Recording voice...</p>
            <button 
              onClick={stopRecording}
              className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
            >
              STOP
            </button>
          </div>
        )}
      </div>

      {/* Media & Voice Preview Modal */}
      <AnimatePresence>
        {showPreview && pendingSend && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex flex-col"
          >
            <div className="p-4 flex justify-between items-center bg-black/40 border-b border-white/10">
              <h4 className="text-white font-bold flex items-center gap-2">
                {pendingSend.type === 'voice' ? <Mic size={18} className="text-binance-yellow" /> : <ImageIcon size={18} className="text-binance-yellow" />} 
                Preview {pendingSend.type.toUpperCase()}
              </h4>
              <button onClick={() => { setShowPreview(false); setPendingSend(null); }} className="text-white/70">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              {pendingSend.type === 'automation' && (
                <div className="bg-binance-panel p-6 rounded-2xl border border-binance-border w-full max-w-xs text-center">
                  <p className="text-xs text-binance-text-dim mb-2 uppercase font-bold tracking-wider">Execute Strategy</p>
                  <p className="text-lg font-bold text-binance-yellow">{(pendingSend.content as Template).name}</p>
                </div>
              )}
              {pendingSend.type === 'image' && (
                <img src={pendingSend.content} className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" alt="" />
              )}
              {pendingSend.type === 'video' && (
                <video src={pendingSend.content} className="max-h-full max-w-full rounded-lg shadow-2xl" controls autoPlay />
              )}
              {pendingSend.type === 'voice' && (
                <div className="flex flex-col items-center gap-6">
                  <div className="w-24 h-24 bg-[#0088cc] rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,136,204,0.3)] animate-pulse">
                    <Mic size={48} className="text-white" />
                  </div>
                  <audio src={pendingSend.content} controls className="w-full max-w-xs" />
                  <p className="text-sm text-binance-text-dim">Voice Message Ready</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-black/40 border-t border-white/10 flex gap-4">
              <button 
                onClick={() => { setShowPreview(false); setPendingSend(null); }}
                className="flex-1 py-4 rounded-xl font-bold bg-white/10 text-white active:scale-95 transition-transform"
              >
                Cancel
              </button>
              <button 
                onClick={confirmSend}
                disabled={replying}
                className="flex-1 py-4 rounded-xl font-bold bg-[#0088cc] text-white active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {replying ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Send Now'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
