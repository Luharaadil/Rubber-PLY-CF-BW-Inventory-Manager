import React, { useState, useEffect, useRef } from "react";
import { format, addHours } from "date-fns";
import * as htmlToImage from "html-to-image";
import { fetchInventoryData, fetchConsumptionRates, saveInventoryData } from "../services/api";
import { InventoryRawRecord } from "../types";
import { useSettings } from "../store/SettingsContext";
import { useAuth } from "../store/AuthContext";
import { SettingsModal } from "./SettingsModal";
import { Settings2, RefreshCw, AlertCircle, Camera, LogOut, Copy, Edit2, Save, X, Plus } from "lucide-react";
import { cn } from "../lib/utils";

export function Dashboard() {
  const { logout } = useAuth();
  const { settings, syncConsumption } = useSettings();
  
  const [allRecords, setAllRecords] = useState<InventoryRawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [copying, setCopying] = useState(false);
  const [copyingText, setCopyingText] = useState(false);

  const [filterSection, setFilterSection] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingRecords, setEditingRecords] = useState<InventoryRawRecord[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  const lastSaveTime = allRecords.length > 0 
    ? new Date(Math.max(...allRecords.map(r => r.timestamp.getTime())))
    : null;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [inventoryResponse, rates] = await Promise.all([
        fetchInventoryData(),
        fetchConsumptionRates()
      ]);
      
      const records = [...inventoryResponse.records];
      
      if (Object.keys(rates).length > 0) {
        syncConsumption(rates);
        
        const existingCodes = new Set(records.map(r => r.rubberCode));
        for (const code of Object.keys(rates)) {
          if (!existingCodes.has(code)) {
            records.push({
              section: "", // Default to empty so the user can easily set it via edit mode
              rubberCode: code,
              batchesOrRolls: 0,
              weight: 0,
              timestamp: new Date(),
              barcode: ""
            });
          }
        }
      }
      
      setAllRecords(records);
      
      if (inventoryResponse.errors.length > 0) {
        setError(inventoryResponse.errors.join("\n"));
      }
    } catch (err) {
      setError("Failed to fetch data. Please check connection.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (!editMode) loadData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [editMode]);

  const handleEditToggle = () => {
    if (editMode) {
      setEditMode(false);
      setEditingRecords([]);
    } else {
      setEditingRecords(allRecords.map(r => ({ ...r, timestamp: new Date(r.timestamp) })));
      setEditMode(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Find modified records by comparing with allRecords
      const modifiedRecords = editingRecords.filter(er => {
        const orig = allRecords.find(ar => ar.section === er.section && ar.rubberCode === er.rubberCode);
        if (!orig) return true; // New record
        return orig.batchesOrRolls !== er.batchesOrRolls;
      });

      if (modifiedRecords.length === 0) {
        setEditMode(false);
        setSaving(false);
        return;
      }

      const success = await saveInventoryData(modifiedRecords);
      if (success) {
        // Optimistically update allRecords so the user immediately sees the changes
        // before the background sheet refresh completes.
        setAllRecords([...editingRecords]);
        setEditMode(false);
        setSaving(false);
        // Delay background reload to give Apps Script time to finish writing to the sheet
        setTimeout(() => loadData(), 4000);
      } else {
        setError("Failed to save changes. Unknown API error.");
      }
    } catch (err: any) {
      setError("Failed to save: " + err.message);
    }
    setSaving(false);
  };

  const handleRecordChange = (index: number, field: keyof InventoryRawRecord, value: any) => {
    const updated = [...editingRecords];
    updated[index] = { ...updated[index], [field]: value, timestamp: new Date() };
    setEditingRecords(updated);
  };

  const handleAddRow = () => {
    setEditingRecords([
      ...editingRecords,
      { section: "", rubberCode: "", batchesOrRolls: 0, weight: 0, timestamp: new Date(), barcode: "" }
    ]);
  };

  const handleDeleteRow = (index: number) => {
    const updated = [...editingRecords];
    updated.splice(index, 1);
    setEditingRecords(updated);
  };

  const handleCopyPicture = async () => {
    if (!printRef.current) return;
    setCopying(true);
    try {
      const blob = await htmlToImage.toBlob(printRef.current, {
        pixelRatio: 2,
        backgroundColor: "#f8fafc",
        filter: (node: any) => !node?.classList?.contains("hide-in-print")
      });
      if (!blob) throw new Error("Failed to generate image blob");
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      setTimeout(() => setCopying(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed", err);
      setCopying(false);
    }
  };

  const copyText = () => {
    const recordsToCopy = getFilteredRecords();
    if (recordsToCopy.length === 0) return;
    let fullText = `Inventory_${format(new Date(), "ddMM_hh:mm a")}\n\n`;
    
    // Group by section
    const grouped: Record<string, typeof recordsToCopy> = {};
    recordsToCopy.forEach(r => {
      if (!grouped[r.section]) grouped[r.section] = [];
      grouped[r.section].push(r);
    });

    Object.keys(grouped).sort().forEach(section => {
      fullText += `--------------------\n\n${section}:\n\n`;
      grouped[section].forEach(r => {
        const { remainingHrs } = calculateMetrics(r);
        const hrsInfo = remainingHrs !== null ? `(${remainingHrs.toFixed(1)}/ 24 hr)` : ``;
        fullText += `>${r.rubberCode}\n${r.batchesOrRolls?.toFixed(1) || "0"} ${hrsInfo}\n\n`;
      });
    });

    navigator.clipboard.writeText(fullText.trim());
    setCopyingText(true);
    setTimeout(() => setCopyingText(false), 2000);
  };

  const calculateMetrics = (record: InventoryRawRecord) => {
    const usagePerDay = settings.consumptionRates ? settings.consumptionRates[record.rubberCode] : 0;
    let remainingHrs: number | null = null;
    let finishTime: Date | null = null;
    
    if (usagePerDay && usagePerDay > 0) {
      const qty = record.batchesOrRolls || 0;
      remainingHrs = qty / (usagePerDay / 24);
      finishTime = addHours(record.timestamp, remainingHrs);
    }
    return { remainingHrs, finishTime, usagePerDay };
  };

  const getFilteredRecords = () => {
    const records = editMode ? editingRecords : allRecords;
    const excludedNames = ["RM32", "RM16", "RM55", "0751NPT", "7331NPT", "0809F", "0824NP"].map(n => n.toUpperCase());
    
    return records.filter(r => {
      if (excludedNames.includes(r.rubberCode.toUpperCase())) return false;
      
      let sMatch = filterSection === "ALL" || r.section?.toLowerCase() === filterSection.toLowerCase();
      
      let cMatch = false;
      const isRubber = /^\d{4}F$/i.test(r.rubberCode);
      if (filterCategory === "ALL") {
        cMatch = true;
      } else if (filterCategory === "Rubber") {
        cMatch = isRubber;
      } else if (filterCategory === "Other") {
        cMatch = !isRubber;
      }

      return sMatch && cMatch;
    }).sort((a, b) => a.section.localeCompare(b.section) || a.rubberCode.localeCompare(b.rubberCode));
  };

  const displayedRecords = getFilteredRecords();

  return (
    <div ref={printRef} className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-16">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col items-start flex-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-800 uppercase">
              Inventory Dashboard
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Last saved: {lastSaveTime ? format(lastSaveTime, "dd-MM-yyyy HH:mm") : "N/A"}
            </p>
          </div>
          
          <div className="flex items-center gap-2 hide-in-print">
            {editMode ? (
              <>
                <button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center shadow-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Save Changes
                </button>
                <button 
                  onClick={handleEditToggle}
                  className="px-4 py-2 text-xs font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center shadow-sm"
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={copyText} className="px-3 py-2 text-xs font-bold rounded shadow-sm transition-colors flex items-center bg-white border-slate-200 text-slate-700 hover:bg-slate-50 border">
                  <Copy className="w-4 h-4 mr-1.5" /> {copyingText ? "Copied!" : "Copy Text"}
                </button>
                <button onClick={handleCopyPicture} className="px-3 py-2 text-xs font-bold rounded shadow-sm border transition-colors flex items-center bg-white border-slate-200 text-slate-700 hover:bg-slate-50">
                  <Camera className="w-4 h-4 mr-1.5" /> {copying ? "Copied!" : "Copy Picture"}
                </button>
                <button onClick={handleEditToggle} className="px-3 py-2 text-xs font-bold rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center shadow-sm">
                  <Edit2 className="w-4 h-4 mr-1.5" /> Edit Inventory
                </button>
              </>
            )}
            <button onClick={() => setSettingsOpen(true)} className="p-2 bg-white rounded shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Settings2 className="w-4 h-4" />
            </button>
            <button onClick={logout} className="p-2 bg-white rounded shadow-sm border border-slate-200 text-rose-600 hover:bg-rose-50">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 relative z-20 print:hidden shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex gap-6">
          <div className="flex flex-col flex-1 max-w-[200px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Section Options
            </label>
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50"
            >
              <option value="ALL">ALL</option>
              <option value="Mixing">Mixing</option>
              <option value="Extrusion">Extrusion</option>
              <option value="Cutting">Cutting</option>
              <option value="Calendering">Calendering</option>
            </select>
          </div>
          <div className="flex flex-col flex-1 max-w-[200px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Category Options
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded px-3 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50"
            >
              <option value="ALL">ALL</option>
              <option value="Rubber">Rubber</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full">
        {loading && !editMode && allRecords.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start text-left">
                <AlertCircle className="w-5 h-5 text-rose-500 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-rose-800 uppercase tracking-widest mb-1">Warning</h3>
                  <p className="text-rose-600 text-sm">{error}</p>
                </div>
              </div>
            )}
            
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest w-48">Section</th>
                      <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest w-64">Material Name</th>
                      <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-center">Rolls or Batch</th>
                      <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-right">Remaining HRS</th>
                      <th className="px-6 py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-right">Finish Time</th>
                      {editMode && <th className="px-4 py-4 hide-in-print"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">No records found.</td>
                      </tr>
                    ) : (
                      displayedRecords.map((r, index) => {
                        const originalIndex = editMode ? editingRecords.indexOf(r) : index;
                        const { remainingHrs, finishTime } = calculateMetrics(r);
                        
                        const isDanger = remainingHrs !== null && remainingHrs < 4;
                        const isOverstock = remainingHrs !== null && remainingHrs > 36;
                        
                        return (
                          <tr key={originalIndex} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-3">
                              {editMode ? (
                                <input 
                                  value={r.section} 
                                  onChange={(e) => handleRecordChange(originalIndex, 'section', e.target.value)}
                                  className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 bg-white"
                                  placeholder="e.g. Extrusion"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-slate-600">{r.section}</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              {editMode ? (
                                <input 
                                  value={r.rubberCode} 
                                  onChange={(e) => handleRecordChange(originalIndex, 'rubberCode', e.target.value)}
                                  className="w-full font-mono text-sm border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 bg-white"
                                  placeholder="Material Name"
                                />
                              ) : (
                                <span className="font-mono font-bold text-slate-800 text-sm bg-slate-100 px-2.5 py-1 rounded">
                                  {r.rubberCode}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-center">
                              {editMode ? (
                                <input 
                                  type="number"
                                  value={r.batchesOrRolls || ""} 
                                  onChange={(e) => handleRecordChange(originalIndex, 'batchesOrRolls', parseFloat(e.target.value) || 0)}
                                  className="w-24 mx-auto text-center font-bold text-sm border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 bg-white"
                                  step="any"
                                />
                              ) : (
                                <span className="font-black text-slate-800 text-lg">
                                  {r.batchesOrRolls?.toFixed(1) || 0}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-right">
                              {remainingHrs === null ? (
                                <span className="text-xs font-bold text-slate-300 uppercase">N/A</span>
                              ) : (
                                <span className={cn(
                                  "px-2.5 py-1 rounded font-bold text-xs uppercase tracking-widest",
                                  isDanger ? "bg-rose-100 text-rose-700" :
                                  isOverstock ? "bg-amber-100 text-amber-700" :
                                  "bg-emerald-100 text-emerald-700"
                                )}>
                                  {remainingHrs.toFixed(1)} HR
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 text-right">
                              {finishTime === null ? (
                                <span className="text-xs font-bold text-slate-300 uppercase">N/A</span>
                              ) : (
                                <span className={cn(
                                  "font-medium text-sm",
                                  isDanger ? "text-rose-600" : "text-slate-600"
                                )}>
                                  {format(finishTime, "dd-MM-yyyy HH:mm")}
                                </span>
                              )}
                            </td>
                            {editMode && (
                              <td className="px-4 py-3 text-right hide-in-print">
                                <button onClick={() => handleDeleteRow(originalIndex)} className="text-slate-400 hover:text-rose-500 transition-colors p-1">
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {editMode && (
                <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-center hide-in-print">
                  <button onClick={handleAddRow} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center justify-center w-full">
                    <Plus className="w-4 h-4 mr-1" /> Add New Material Row
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
