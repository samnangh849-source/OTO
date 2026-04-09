import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Save, X, LayoutTemplate, ArrowUp, ArrowDown, Type, Image as ImageIcon, Video, Mic, Clock, ExternalLink, Activity, Download, Upload, FileText, BarChart3, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface Template {
  id: number;
  name: string;
  type: string;
  content: string;
  tags: string;
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Template>>({});
  const [flowSteps, setFlowSteps] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<number | null>(null);
  // Import/Export state
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<any[]>([]);
  const [ioToast, setIoToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null); // tracks which export is loading
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/templates');
      setTemplates(res.data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleDeleteClick = (id: number) => {
    setTemplateToDelete(id);
  };

  const confirmDelete = async () => {
    if (templateToDelete === null) return;
    try {
      await api.delete(`/templates/${templateToDelete}`);
      setTemplates(templates.filter(t => t.id !== templateToDelete));
    } catch (error: any) {
      alert(error.message || 'Failed to delete template');
    } finally {
      setTemplateToDelete(null);
    }
  };

  const handleSave = async () => {
    try {
      const finalForm = { ...editForm };
      if (editForm.type === 'flow') {
        finalForm.content = JSON.stringify(flowSteps);
      }

      if (isCreating) {
        const res = await api.post('/templates', { ...finalForm, id: Date.now() });
        setTemplates([...templates, res.data]);
        setIsCreating(false);
      } else if (isEditing) {
        const res = await api.put(`/templates/${isEditing}`, finalForm);
        setTemplates(templates.map(t => t.id === isEditing ? res.data : t));
        setIsEditing(null);
      }
      setEditForm({});
      setFlowSteps([]);
    } catch (error: any) {
      alert(`Failed to save template: ${error.response?.data?.error || error.message}`);
    }
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
    setIoToast({ msg, type });
    setTimeout(() => setIoToast(null), 3000);
  };

  // ✅ Fix 1: linkElement properly appended/removed for Firefox/Safari compatibility
  const triggerDownload = (dataUri: string, fileName: string) => {
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', fileName);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(templates, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const fileName = `templates_export_${new Date().toISOString().split('T')[0]}.json`;
    triggerDownload(dataUri, fileName);
    showToast(`Exported ${templates.length} templates`, 'success');
  };

  // ✅ Fix 2: Export Messages CSV — use server-side endpoint to avoid 114MB browser crash
  const handleExportMessages = async () => {
    if (exporting) return;
    setExporting('messages');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/export/messages-csv?limit=5000', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      triggerDownload(url, `messages_${date}.csv`);
      URL.revokeObjectURL(url);
      const total = res.headers.get('x-total-rows');
      showToast(`Messages exported as CSV${total ? ` (${total} rows)` : ''}`, 'success');
    } catch (err: any) {
      console.error('Export messages error:', err);
      showToast(`Export failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  // ✅ Fix 2: Export Stats as JSON
  const handleExportStats = async () => {
    if (exporting) return;
    setExporting('stats');
    try {
      const res = await api.get('/stats');
      const stats = { ...res.data, exportedAt: new Date().toISOString() };
      const dataStr = JSON.stringify(stats, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const fileName = `stats_export_${new Date().toISOString().split('T')[0]}.json`;
      triggerDownload(dataUri, fileName);
      showToast('Stats exported successfully', 'success');
    } catch (err) {
      showToast('Failed to export stats', 'error');
    } finally {
      setExporting(null);
    }
  };

  // ✅ Fix 3: Replace browser confirm() with custom modal
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedTemplates = JSON.parse(e.target?.result as string);
        if (!Array.isArray(importedTemplates)) {
          showToast('Invalid format. Expected an array of templates.', 'error');
          return;
        }
        setPendingImportData(importedTemplates);
        setShowImportConfirm(true);
      } catch (err) {
        console.error('Import error:', err);
        showToast('Failed to parse file. Check format.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const confirmImport = async () => {
    setImporting(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const t of pendingImportData) {
        // Validate required fields before posting
        if (!t.name || !t.type || !t.content) { failCount++; continue; }
        const { id, ...templateData } = t;
        try {
          await api.post('/templates', {
            name: String(t.name),
            type: String(t.type),
            content: String(t.content),
            tags: String(t.tags || ''),
          });
          successCount++;
        } catch {
          failCount++;
        }
      }
      fetchTemplates();
      if (successCount > 0) {
        showToast(`Imported ${successCount} template${successCount > 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} skipped)` : ''} successfully`, 'success');
      } else {
        showToast('Import failed — no valid templates found', 'error');
      }
    } catch (err) {
      showToast('Import failed. Please try again.', 'error');
    } finally {
      setImporting(false);
      setShowImportConfirm(false);
      setPendingImportData([]);
    }
  };

  const startEdit = (template: Template) => {
    setIsEditing(template.id);
    setEditForm(template);
    if (template.type === 'flow') {
      try {
        setFlowSteps(JSON.parse(template.content));
      } catch (e) {
        setFlowSteps([]);
      }
    } else {
      setFlowSteps([]);
    }
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setIsEditing(null);
    setEditForm({ type: 'text', name: '', content: '', tags: '' });
    setFlowSteps([]);
  };

  const addStep = () => {
    setFlowSteps([...flowSteps, { type: 'text', content: '', duration: 3, buttons: [] }]);
  };

  const removeStep = (index: number) => {
    setFlowSteps(flowSteps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...flowSteps];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newSteps.length) return;
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setFlowSteps(newSteps);
  };

  const updateStep = (index: number, updates: any) => {
    setFlowSteps(flowSteps.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const addButton = (stepIndex: number) => {
    const step = flowSteps[stepIndex];
    updateStep(stepIndex, { buttons: [...(step.buttons || []), { text: '', type: 'text', value: '' }] });
  };

  const removeButton = (stepIndex: number, btnIndex: number) => {
    const step = flowSteps[stepIndex];
    updateStep(stepIndex, { buttons: step.buttons.filter((_: any, i: number) => i !== btnIndex) });
  };

  const updateButton = (stepIndex: number, btnIndex: number, updates: any) => {
    const step = flowSteps[stepIndex];
    const newButtons = step.buttons.map((b: any, i: number) => i === btnIndex ? { ...b, ...updates } : b);
    updateStep(stepIndex, { buttons: newButtons });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto text-binance-text">

      {/* ─── Toast Notification ─── */}
      {ioToast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xl border backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ${
          ioToast.type === 'success'
            ? 'bg-binance-green/20 border-binance-green text-binance-green'
            : 'bg-red-500/20 border-red-500/50 text-red-400'
        }`}>
          {ioToast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {ioToast.msg}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Activity className="text-binance-yellow" /> Auto-Reply Workflows</h1>
          <p className="text-sm text-binance-text-dim mt-1">Configure automated narratives and responses</p>
        </div>
        {!isCreating && !isEditing && (
          <div className="flex gap-2">
            <button onClick={handleExport} className="flex items-center gap-2 bg-binance-card text-binance-text px-4 py-2 rounded font-bold border border-binance-border hover:bg-binance-bg transition-colors text-sm">
              <Download size={16} /> Export
            </button>
            <label className="flex items-center gap-2 bg-binance-card text-binance-text px-4 py-2 rounded font-bold border border-binance-border hover:bg-binance-bg transition-colors text-sm cursor-pointer">
              <Upload size={16} /> Import
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button onClick={startCreate} className="flex items-center gap-2 bg-binance-yellow text-[#181a20] px-4 py-2 rounded font-bold hover:bg-binance-yellow-hover transition-colors text-sm">
              <Plus size={16} /> New Strategy
            </button>
          </div>
        )}
      </div>

      {/* ─── Export Center Panel ─── */}
      {!isCreating && !isEditing && (
        <div className="mb-6 p-4 bg-binance-panel border border-binance-border rounded-lg">
          <p className="text-[11px] font-black text-binance-text-dim uppercase tracking-widest mb-3">📦 Export Center</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleExportMessages}
              disabled={exporting === 'messages'}
              className="flex items-center gap-2 px-4 py-2 bg-binance-bg border border-binance-border rounded text-sm font-bold text-binance-text hover:border-binance-yellow hover:text-binance-yellow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'messages' ? (
                <><div className="w-3.5 h-3.5 border-2 border-binance-yellow/30 border-t-binance-yellow rounded-full animate-spin" /> Exporting...</>
              ) : (
                <><FileText size={15} /> Export Messages CSV</>
              )}
            </button>
            <button
              onClick={handleExportStats}
              disabled={exporting === 'stats'}
              className="flex items-center gap-2 px-4 py-2 bg-binance-bg border border-binance-border rounded text-sm font-bold text-binance-text hover:border-binance-green hover:text-binance-green transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'stats' ? (
                <><div className="w-3.5 h-3.5 border-2 border-binance-green/30 border-t-binance-green rounded-full animate-spin" /> Exporting...</>
              ) : (
                <><BarChart3 size={15} /> Export Stats JSON</>
              )}
            </button>
          </div>
        </div>
      )}

      {(isCreating || isEditing) && (
        <div className="bg-binance-panel p-6 rounded-lg border border-binance-border mb-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-binance-text">{isCreating ? 'Create Strategy' : 'Edit Strategy'}</h2>
            <button onClick={() => { setIsCreating(false); setIsEditing(null); }} className="text-binance-text-dim hover:text-binance-text"><X size={20} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-binance-text-dim">Strategy Name</label>
              <input type="text" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 bg-binance-bg border border-binance-border rounded text-sm text-binance-text focus:border-binance-yellow outline-none transition-colors" placeholder="e.g., Welcome Flow" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-binance-text-dim">Type</label>
              <select value={editForm.type || 'text'} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className="w-full px-3 py-2 bg-binance-bg border border-binance-border rounded text-sm text-binance-text focus:border-binance-yellow outline-none transition-colors">
                <option value="text">Text Message</option>
                <option value="image">Image (URL)</option>
                <option value="video">Video (URL)</option>
                <option value="voice">Voice (URL)</option>
                <option value="flow">Advanced Flow ⚡️</option>
              </select>
            </div>

            {editForm.type === 'flow' ? (
              <div className="md:col-span-2 mt-4 border border-binance-border rounded-lg bg-binance-bg p-6 overflow-hidden relative">
                  
                  {/* Main Action Node */}
                  <div className="max-w-2xl mx-auto z-10 relative">
                    <div className="bg-binance-panel rounded-lg border border-binance-border overflow-hidden">
                      {/* Node Header */}
                      <div className="bg-binance-card p-4 flex justify-between items-center border-b border-binance-border">
                        <div className="flex items-center gap-3">
                          <Activity size={20} className="text-binance-yellow" />
                          <h3 className="text-sm font-bold text-binance-text">Execution Sequence</h3>
                        </div>
                      </div>

                      <div className="p-6 space-y-6 relative before:absolute before:left-10 before:top-4 before:bottom-10 before:w-px before:bg-binance-border before:border-dashed before:border">
                  {flowSteps.map((step, index) => (
                    <div key={index} className="flex gap-4 group relative">
                      <div className="z-10 bg-binance-card h-8 w-8 rounded text-binance-yellow border border-binance-border flex flex-shrink-0 items-center justify-center translate-y-2">
                        {step.type === 'text' && <Type size={14} />}
                        {step.type === 'image' && <ImageIcon size={14} />}
                        {step.type === 'video' && <Video size={14} />}
                        {step.type === 'voice' && <Mic size={14} />}
                        {step.type === 'delay' && <Clock size={14} />}
                      </div>

                      <div className="flex-1 bg-binance-bg p-4 rounded border border-binance-border transition-all">
                        <div className="flex justify-between items-center mb-4">
                          <select value={step.type} onChange={e => updateStep(index, { type: e.target.value })} className="text-xs font-semibold text-binance-text bg-binance-panel border border-binance-border px-2 py-1 rounded outline-none focus:border-binance-yellow">
                            <option value="text">TEXT</option>
                            <option value="image">IMAGE</option>
                            <option value="video">VIDEO</option>
                            <option value="voice">AUDIO</option>
                            <option value="delay">DELAY</option>
                          </select>
                          <div className="flex gap-1">
                            <button onClick={() => moveStep(index, 'up')} disabled={index === 0} className="p-1 text-binance-text-dim hover:text-binance-text disabled:opacity-20"><ArrowUp size={14} /></button>
                            <button onClick={() => moveStep(index, 'down')} disabled={index === flowSteps.length - 1} className="p-1 text-binance-text-dim hover:text-binance-text disabled:opacity-20"><ArrowDown size={14} /></button>
                            <button onClick={() => removeStep(index)} className="p-1 text-binance-text-dim hover:text-binance-red"><Trash2 size={14} /></button>
                          </div>
                        </div>

                        <div>
                          {step.type === 'delay' ? (
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-binance-text-dim">Wait:</span>
                              <input type="number" value={step.duration || ''} onChange={e => updateStep(index, { duration: parseInt(e.target.value) })} className="w-20 text-center text-sm bg-binance-panel border border-binance-border text-binance-text rounded py-1 outline-none focus:border-binance-yellow" />
                              <span className="text-xs text-binance-text-dim">Secs</span>
                            </div>
                          ) : step.type === 'text' ? (
                            <textarea value={step.content} onChange={e => updateStep(index, { content: e.target.value })} placeholder="Message content..." className="w-full text-sm px-3 py-2 bg-binance-panel border border-binance-border text-binance-text rounded outline-none focus:border-binance-yellow transition-all min-h-[60px]" />
                          ) : (
                            <div className="space-y-3">
                              {step.content && (
                                <div className="relative w-32 h-32 rounded border border-binance-border overflow-hidden bg-binance-panel">
                                  {step.type === 'image' ? (
                                    <img src={step.content} className="w-full h-full object-cover" alt="preview" />
                                  ) : step.type === 'video' ? (
                                    <div className="w-full h-full flex items-center justify-center text-binance-yellow">
                                      <Video size={32} />
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-binance-yellow">
                                      <Mic size={32} />
                                    </div>
                                  )}
                                  <button onClick={() => updateStep(index, { content: '' })} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><X size={12} /></button>
                                </div>
                              )}
                              <label className="flex items-center gap-2 cursor-pointer bg-binance-panel border border-binance-border px-4 py-2 rounded text-xs text-binance-text hover:border-binance-yellow transition-colors w-fit">
                                <Plus size={14} /> {step.content ? 'Change' : 'Upload'} {step.type.toUpperCase()}
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  accept={
                                    step.type === 'image' ? "image/png, image/jpeg" : 
                                    step.type === 'video' ? "video/mp4" : 
                                    "audio/*"
                                  }
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => updateStep(index, { content: reader.result as string });
                                    reader.readAsDataURL(file);
                                  }} 
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {step.type !== 'delay' && (
                          <div className="pt-4 mt-4 border-t border-binance-border">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-xs font-semibold text-binance-text-dim">Interactive Buttons</h4>
                              <button onClick={() => addButton(index)} className="text-xs text-binance-yellow hover:text-binance-yellow-hover flex items-center gap-1 font-medium"><Plus size={12} /> Add</button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              {(step.buttons || []).map((btn: any, bIdx: number) => (
                                <div key={bIdx} className="flex gap-2 items-center">
                                  <input type="text" placeholder="Button Label" value={btn.text} onChange={e => updateButton(index, bIdx, { text: e.target.value })} className="flex-1 bg-binance-panel text-xs text-binance-text px-2 py-1.5 rounded border border-binance-border outline-none focus:border-binance-yellow" />
                                  <select value={btn.type || 'text'} onChange={e => updateButton(index, bIdx, { type: e.target.value, value: '' })} className="bg-binance-panel text-xs text-binance-text px-2 py-1.5 rounded border border-binance-border outline-none focus:border-binance-yellow">
                                    <option value="text">Reply Text</option>
                                    <option value="flow">Trigger Flow</option>
                                    <option value="url">Open URL</option>
                                  </select>
                                  {btn.type === 'flow' ? (
                                    <select value={btn.value || ''} onChange={e => updateButton(index, bIdx, { value: e.target.value })} className="flex-[2] bg-binance-panel text-xs text-binance-text px-2 py-1.5 rounded border border-binance-border outline-none focus:border-binance-yellow">
                                      <option value="">-- Select Flow --</option>
                                      {(Array.isArray(templates) ? templates : []).map(t => <option key={t.id} value={t.id}>{t.name} ({t.type})</option>)}
                                    </select>
                                  ) : btn.type === 'text' ? (
                                    <textarea placeholder="Auto-reply text" value={btn.value || ''} onChange={e => updateButton(index, bIdx, { value: e.target.value })} rows={2} className="flex-[2] bg-binance-panel text-xs text-binance-text px-2 py-1.5 rounded border border-binance-border outline-none focus:border-binance-yellow resize-y min-h-[32px]" />
                                  ) : (
                                    <input type="text" placeholder="https://..." value={btn.value || btn.url || ''} onChange={e => updateButton(index, bIdx, { value: e.target.value })} className="flex-[2] bg-binance-panel text-xs text-binance-text px-2 py-1.5 rounded border border-binance-border outline-none focus:border-binance-yellow" />
                                  )}
                                  <button onClick={() => removeButton(index, bIdx)} className="text-binance-text-dim hover:text-binance-red p-1"><X size={14} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                        <button onClick={addStep} className="w-full py-3 border border-dashed border-binance-border rounded text-sm font-medium text-binance-text-dim hover:text-binance-yellow hover:border-binance-yellow transition-colors flex items-center justify-center gap-2 bg-binance-bg">
                          <Plus size={16} /> Add Step
                        </button>
                      </div>
                    </div>
                  </div>
              </div>
            ) : (
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-binance-text-dim">Content</label>
                <textarea value={editForm.content || ''} onChange={e => setEditForm({ ...editForm, content: e.target.value })} className="w-full px-3 py-2 bg-binance-bg border border-binance-border rounded text-sm text-binance-text focus:border-binance-yellow outline-none min-h-[100px]" placeholder={editForm.type === 'text' ? "Message..." : "URL..."} />
              </div>
            )}
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-binance-text-dim">Tags (comma separated)</label>
              <input type="text" value={editForm.tags || ''} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} className="w-full px-3 py-2 bg-binance-bg border border-binance-border rounded text-sm text-binance-text focus:border-binance-yellow outline-none" placeholder="e.g. sales, support" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => { setIsCreating(false); setIsEditing(null); }} className="px-4 py-2 text-sm font-medium text-binance-text bg-binance-bg border border-binance-border rounded hover:bg-binance-card">Cancel</button>
            <button onClick={handleSave} disabled={!editForm.name || (editForm.type !== 'flow' ? !editForm.content : flowSteps.length === 0)} className="bg-binance-yellow text-[#181a20] px-4 py-2 rounded text-sm font-bold flex items-center gap-2 hover:bg-binance-yellow-hover disabled:opacity-50"><Save size={16} /> Save</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Array.isArray(templates) ? templates : []).map(template => (
          <div key={template.id} className="bg-binance-panel p-5 rounded-lg border border-binance-border hover:border-binance-text-dim transition-colors flex flex-col group relative">
            <div className="flex justify-between items-start mb-4">
              <div className="pr-12">
                <h3 className="text-base font-bold text-binance-text leading-tight mb-1">{template.name}</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-binance-card text-binance-text-dim border border-binance-border uppercase">
                  {template.type}
                </span>
              </div>
              <div className="absolute top-5 right-5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(template)} className="text-binance-text-dim hover:text-binance-yellow"><Edit2 size={16} /></button>
                <button onClick={() => handleDeleteClick(template.id)} className="text-binance-text-dim hover:text-binance-red"><Trash2 size={16} /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden">
              {template.type === 'flow' ? (
                <div className="space-y-2">
                  {(() => {
                    try {
                      const flowData = JSON.parse(template.content);
                      const preview = flowData.slice(0, 3);
                      return (
                        <>
                          {preview.map((step: any, sIdx: number) => (
                            <div key={sIdx} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-binance-yellow" />
                              <span className="text-xs text-binance-text-dim truncate">
                                {step.type === 'delay' ? `Wait ${step.duration}s` : step.content || `[${step.type}]`}
                              </span>
                            </div>
                          ))}
                          {flowData.length > 3 && (
                            <p className="text-[10px] text-binance-yellow mt-1">+ {flowData.length - 3} more steps</p>
                          )}
                        </>
                      );
                    } catch (e) { return <p className="text-xs text-binance-red">Invalid flow data</p>; }
                  })()}
                </div>
              ) : (
                <p className="text-xs text-binance-text-dim leading-relaxed line-clamp-3">{template.content}</p>
              )}
            </div>
            
            {template.tags && typeof template.tags === 'string' && (
              <div className="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-binance-border">
                {template.tags.split(',').filter(t => t.trim()).map((tag, i) => (
                  <span key={i} className="text-[10px] text-binance-text bg-binance-card px-1.5 py-0.5 rounded border border-binance-border">
                    #{tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 && !isCreating && !isEditing && (
          <div className="col-span-full py-12 text-center bg-binance-panel rounded-lg border border-dashed border-binance-border">
            <Activity size={32} className="mx-auto mb-3 text-binance-text-dim opacity-50" />
            <h3 className="text-sm font-bold text-binance-text">No Strategies Found</h3>
            <p className="text-xs text-binance-text-dim mt-1">Create your first auto-reply workflow.</p>
          </div>
        )}
      </div>

      {/* ─── Delete Confirm Modal ─── */}
      {templateToDelete !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-binance-panel p-6 rounded-lg max-w-sm w-full border border-binance-border">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="text-binance-red" size={22} />
              <h3 className="text-lg font-bold text-binance-text">Cancel Strategy?</h3>
            </div>
            <p className="text-sm text-binance-text-dim mb-6">This workflow and all its steps will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setTemplateToDelete(null)} className="flex-1 py-2 text-sm font-medium text-binance-text bg-binance-bg border border-binance-border rounded hover:bg-binance-card">Dismiss</button>
              <button onClick={confirmDelete} className="flex-1 py-2 bg-binance-red text-white text-sm font-bold rounded hover:opacity-90">Confirm Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Import Confirm Modal (Fix 3: replaces browser confirm()) ─── */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-binance-panel p-6 rounded-lg max-w-sm w-full border border-binance-border shadow-2xl">
            <div className="flex items-center gap-3 mb-2">
              <Upload className="text-binance-yellow" size={22} />
              <h3 className="text-lg font-bold text-binance-text">Import Templates?</h3>
            </div>
            <p className="text-sm text-binance-text-dim mb-1">
              Found <span className="text-binance-yellow font-bold">{pendingImportData.length}</span> templates ready to import.
            </p>
            <p className="text-xs text-binance-text-dim mb-6">These will be added as new entries without replacing existing ones.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowImportConfirm(false); setPendingImportData([]); }}
                disabled={importing}
                className="flex-1 py-2 text-sm font-medium text-binance-text bg-binance-bg border border-binance-border rounded hover:bg-binance-card disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={importing}
                className="flex-1 py-2 bg-binance-yellow text-[#181a20] text-sm font-bold rounded hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? (
                  <><div className="w-4 h-4 border-2 border-[#181a20]/30 border-t-[#181a20] rounded-full animate-spin" /> Importing...</>
                ) : (
                  `Import ${pendingImportData.length} Templates`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
