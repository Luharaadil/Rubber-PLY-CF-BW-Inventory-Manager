import React, { useState, useEffect, useRef } from "react";
import { format, addHours } from "date-fns";
import * as htmlToImage from "html-to-image";
import { fetchInventoryData, fetchConsumptionRates, saveInventoryData, fetchThresholds } from "../services/api";
import { InventoryRawRecord } from "../types";
import { useSettings } from "../store/SettingsContext";
import { useAuth } from "../store/AuthContext";
import { SettingsModal } from "./SettingsModal";
import { Settings2, RefreshCw, AlertCircle, Camera, LogOut, Copy, Edit2, Save, X, Plus, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

export function Dashboard() {
  const { user, logout } = useAuth();
  const { settings, syncMaterialUsages, syncThresholds } = useSettings();
  
  const [allRecords, setAllRecords] = useState<InventoryRawRecord[]>([]);
  const [originalRecords, setOriginalRecords] = useState<InventoryRawRecord[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [copying, setCopying] = useState(false);
  const [copyingText, setCopyingText] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });

  const [filterSection, setFilterSection] = useState<string>("ALL");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["Rubber", "PLY", "CH", "BW"]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const lastSaveTime = allRecords.length > 0 
    ? new Date(Math.max(...allRecords.map(r => r.timestamp.getTime())))
    : null;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [inventoryResponse, rates, thresholds] = await Promise.all([
        fetchInventoryData(),
        fetchConsumptionRates(),
        fetchThresholds()
      ]);
      
      const records = [...inventoryResponse.records];
      
      if (thresholds) {
        syncThresholds(thresholds.dangerThreshold, thresholds.overstockThreshold);
      }
      
      if (rates.length > 0) {
        syncMaterialUsages(rates);
        
        const existingCodes = new Set(records.map(r => r.rubberCode));
        for (const r of rates) {
          if (!existingCodes.has(r.materialName)) {
            records.push({
              section: r.section,
              rubberCode: r.materialName,
              batchesOrRolls: 0,
              weight: 0,
              timestamp: new Date(),
              barcode: ""
            });
          }
        }
      }
      
      setAllRecords(records);
      setOriginalRecords(records.map(r => ({ ...r })));
      
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
      if (!editMode && !isDirty) loadData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [editMode]);

  const handleEditToggle = () => {
    if (editMode) {
      setEditMode(false);
    } else {
      setEditMode(true);
    }
  };

  // Determine if there are local unsaved edits
  const getModifiedRecords = () => {
    return allRecords.filter(er => {
      const orig = originalRecords.find(ar => ar.section === er.section && ar.rubberCode === er.rubberCode);
      if (!orig) return true; // Newly added
      return orig.batchesOrRolls !== er.batchesOrRolls || orig.section !== er.section || orig.rubberCode !== er.rubberCode;
    });
  };

  const modifiedRecords = getModifiedRecords();
  const isDirty = modifiedRecords.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (modifiedRecords.length === 0) {
        setEditMode(false);
        setSaving(false);
        return;
      }

      const success = await saveInventoryData(modifiedRecords);
      if (success) {
        setOriginalRecords(allRecords.map(r => ({ ...r })));
        setEditMode(false);
        setSaving(false);
        // Clean refresh shortly after API write
        setTimeout(() => loadData(), 4000);
      } else {
        setError("Failed to save changes. Unknown API error.");
      }
    } catch (err: any) {
      setError("Failed to save: " + err.message);
    }
    setSaving(false);
  };

  const handleCancelEdits = () => {
    setAllRecords(originalRecords.map(r => ({ ...r })));
    setEditMode(false);
  };

  const handleRecordChange = (index: number, field: keyof InventoryRawRecord, value: any) => {
    setAllRecords(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value, timestamp: new Date() };
      return copy;
    });
  };

  const handleAddRow = () => {
    setAllRecords(prev => [
      ...prev,
      { section: "Mixing", rubberCode: "", batchesOrRolls: 0, weight: 0, timestamp: new Date(), barcode: "" }
    ]);
  };

  const handleDeleteRow = (index: number) => {
    setAllRecords(prev => {
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleCopyPicture = async () => {
    const isMobile = window.innerWidth < 768; // 768px is md breakpoint in Tailwind CSS
    const targetElement = isMobile 
      ? document.getElementById("full-dashboard-capture") 
      : printRef.current;

    if (!targetElement) return;
    setCopying(true);
    // Flush the DOM updates so any visual elements settle before raw canvas snapshot
    await new Promise(resolve => setTimeout(resolve, 120));
    try {
      const blob = await htmlToImage.toBlob(targetElement, {
        pixelRatio: 2.5,
        backgroundColor: isMobile ? "#f8fafc" : "#ffffff", // slate-50 background for full dashboard capture on mobile, white for card capture
        style: isMobile ? {} : {
          padding: "16px",
          borderRadius: "8px"
        },
        filter: (node: any) => !node?.classList?.contains("hide-in-print")
      });
      if (!blob) throw new Error("Failed to generate image blob");
      const item = new ClipboardItem({ "image/png": blob });
      await navigator.clipboard.write([item]);
      
      setToast({ message: "📸 Snapshot copied to clipboard!", visible: true });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2500);

      setTimeout(() => setCopying(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed", err);
      setCopying(false);
    }
  };

  const formatRemainingHrs = (hrs: number): string => {
    const formatted = hrs.toFixed(1);
    if (formatted.endsWith(".0")) {
      return hrs.toFixed(0);
    }
    return formatted;
  };

  const copyText = () => {
    const recordsToCopy = getFilteredRecords();
    if (recordsToCopy.length === 0) return;
    
    let shortSection = "ALL";
    if (filterSection === "Mixing") shortSection = "MX";
    else if (filterSection === "Extrusion") shortSection = "EX";
    else if (filterSection === "Cutting") shortSection = "CT";
    else if (filterSection === "Calendering") shortSection = "CL";

    const now = new Date();
    const timestampStr = format(now, "ddMM_hh:mm a");

    let fullText = `${shortSection} Inventory\n${timestampStr}\n\n--------------------\n`;

    const categoryMin: Record<string, number> = {};

    recordsToCopy.forEach(r => {
      const { remainingHrs } = calculateMetrics(r);
      const isRubber = isRubberRecord(r);
      const recordCategory = getRecordCategory(r);

      const rateItem = settings.materialUsages.find(mu => 
        mu.materialName.toUpperCase() === r.rubberCode.toUpperCase() &&
        mu.section.toUpperCase() === r.section.toUpperCase()
      ) || settings.materialUsages.find(mu => 
        mu.materialName.toUpperCase() === r.rubberCode.toUpperCase()
      );

      const defaultHrs = isRubber ? 24 : 120;
      const stdHrs = rateItem && rateItem.standardTargetHours !== undefined ? rateItem.standardTargetHours : defaultHrs;

      const qtyStr = r.batchesOrRolls !== undefined ? r.batchesOrRolls.toFixed(1) : "0.0";
      const remainingStr = remainingHrs !== null ? formatRemainingHrs(remainingHrs) : "N/A";
      const unitStr = isRubber ? "Batch" : "Roll";
      
      fullText += `\n${r.rubberCode}\n${qtyStr} ${unitStr}\n${remainingStr} hr / ${stdHrs} hr\n`;

      if (remainingHrs !== null) {
        const cat = recordCategory; 
        if (categoryMin[cat] === undefined || remainingHrs < categoryMin[cat]) {
          categoryMin[cat] = remainingHrs;
        }
      }
    });

    fullText += `\n`;

    const sortedCats = Object.keys(categoryMin).sort();
    sortedCats.forEach(cat => {
      fullText += `${cat} Minimum\n${formatRemainingHrs(categoryMin[cat])} hr\n\n`;
    });

    navigator.clipboard.writeText(fullText.trim());
    setCopyingText(true);
    
    setToast({ message: "📋 Minimalist text inventory copied!", visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2500);

    setTimeout(() => setCopyingText(false), 2000);
  };

  const getRecordCategory = (record: InventoryRawRecord): string => {
    const rateItem = settings.materialUsages.find(mu => 
      mu.materialName.toUpperCase() === record.rubberCode.toUpperCase() &&
      mu.section.toUpperCase() === record.section.toUpperCase()
    ) || settings.materialUsages.find(mu => 
      mu.materialName.toUpperCase() === record.rubberCode.toUpperCase()
    );

    if (rateItem && rateItem.category) {
      const catUpper = rateItem.category.toUpperCase();
      if (["RUBBER", "PLY", "CH", "BW"].includes(catUpper)) {
        return rateItem.category; 
      }
    }
    // Fallback based on rubber code signature
    return /^\d{4}F$/i.test(record.rubberCode) ? "Rubber" : "PLY";
  };

  // Determine whether item has rubber category or matches signature 4 digits + F pattern
  const isRubberRecord = (record: InventoryRawRecord) => {
    return getRecordCategory(record).toLowerCase() === "rubber";
  };

  const calculateMetrics = (record: InventoryRawRecord) => {
    const rateItem = settings.materialUsages.find(mu => 
      mu.materialName.toUpperCase() === record.rubberCode.toUpperCase() &&
      mu.section.toUpperCase() === record.section.toUpperCase()
    ) || settings.materialUsages.find(mu => 
      mu.materialName.toUpperCase() === record.rubberCode.toUpperCase()
    );

    const usagePerHour = rateItem ? rateItem.usagePerHour : 0;
    let remainingHrs: number | null = null;
    let finishTime: Date | null = null;

    if (usagePerHour && usagePerHour > 0) {
      const qty = record.batchesOrRolls || 0;
      remainingHrs = qty / usagePerHour;
      finishTime = addHours(new Date(), remainingHrs);
    }
    
    return { remainingHrs, finishTime, usagePerHour };
  };

  const getFilteredRecords = () => {
    const excludedNames = ["RM32", "RM16", "RM55", "0751NPT", "7331NPT", "0809F", "0824NP", "0.955MM"].map(n => n.toUpperCase());
    
    return allRecords.filter(r => {
      if (excludedNames.includes(r.rubberCode.toUpperCase())) return false;
      
      let sMatch = filterSection === "ALL" || r.section?.toLowerCase() === filterSection.toLowerCase();
      
      const recordCategory = getRecordCategory(r);
      let cMatch = selectedCategories.some(cat => cat.toUpperCase() === recordCategory.toUpperCase());

      return sMatch && cMatch;
    }).sort((a, b) => a.section.localeCompare(b.section) || a.rubberCode.localeCompare(b.rubberCode));
  };

  const displayedRecords = getFilteredRecords();

  const categoryOptions = ["Rubber", "PLY", "CH", "BW"];

  return (
    <div id="full-dashboard-capture" className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-16">
      {/* Header Dashboard bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="max-w-full mx-auto px-2 sm:px-4 md:px-6 py-3 md:py-4 flex flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <span className="w-2 md:w-2.5 h-5 md:h-6 bg-indigo-600 rounded flex-shrink-0"></span>
            <h1 className="text-xs sm:text-sm md:text-xl font-black tracking-tight text-slate-800 uppercase">
              Inventory Manager
            </h1>
          </div>
          
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 hide-in-print ml-auto flex-shrink-0">
            {isDirty && (
              <span className="text-[9px] sm:text-[10px] bg-amber-100 text-amber-800 font-black border border-amber-300 px-2 sm:px-3 py-1 rounded uppercase tracking-wider animate-pulse flex items-center gap-1 flex-shrink-0">
                Unsaved Edits
              </span>
            )}

            {isDirty && (
              <button 
                onClick={handleSave} 
                disabled={saving}
                className="px-2.5 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center shadow-sm"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 mr-1 sm:mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />}
                <span className="hidden xs:inline">Save</span>
              </button>
            )}

            {isDirty && (
              <button 
                onClick={handleCancelEdits}
                className="px-2 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-bold rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center shadow-sm"
              >
                <X className="w-3.5 h-3.5 mr-1 sm:mr-1.5" />
                <span className="hidden xs:inline">Cancel</span>
              </button>
            )}

            {!isDirty && (
              <>
                <button 
                  onClick={copyText} 
                  className={cn(
                    "p-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs font-bold rounded shadow-sm border transition-all duration-200 flex items-center select-none",
                    copyingText 
                      ? "bg-emerald-600 border-emerald-600 text-white" 
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  )} 
                  title="Copy Text"
                >
                  {copyingText ? (
                    <Check className="w-4 h-4 sm:mr-1.5" />
                  ) : (
                    <Copy className="w-4 h-4 sm:mr-1.5" />
                  )}
                  <span className="hidden xs:inline">{copyingText ? "Copied!" : "Copy Text"}</span>
                </button>
                <button 
                  onClick={handleCopyPicture} 
                  className={cn(
                    "p-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs font-bold rounded shadow-sm border transition-all duration-200 flex items-center select-none",
                    copying 
                      ? "bg-emerald-600 border-emerald-600 text-white" 
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  )} 
                  title="Copy Picture"
                >
                  {copying ? (
                    <Check className="w-4 h-4 sm:mr-1.5" />
                  ) : (
                    <Camera className="w-4 h-4 sm:mr-1.5" />
                  )}
                  <span className="hidden xs:inline">{copying ? "Copied!" : "Copy Picture"}</span>
                </button>
                <button 
                  onClick={handleEditToggle} 
                  className={cn(
                    "p-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs font-bold rounded transition-colors flex items-center shadow-sm",
                    editMode ? "bg-slate-700 text-white hover:bg-slate-800" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  )}
                  title={editMode ? "Exit Structural Edit" : "Edit List Rows"}
                >
                  <Edit2 className="w-4 h-4 sm:mr-1.5" /> 
                  <span className="hidden md:inline">{editMode ? "Exit Edit" : "Edit Rows"}</span>
                </button>
              </>
            )}
            {user?.role?.toLowerCase() === "admin" && (
              <button onClick={() => setSettingsOpen(true)} className="p-1.5 sm:p-2 bg-white rounded shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50" title="System settings">
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={logout} className="p-1.5 sm:p-2 bg-white rounded shadow-sm border border-slate-200 text-rose-600 hover:bg-rose-50" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Filter and dynamic Last Saved layout - next to Category per Requirement 6 */}
      <div className="bg-white border-b border-slate-200 relative z-20 print:hidden shadow-sm">
        <div className="max-w-full mx-auto px-2 sm:px-4 md:px-6 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-row items-center gap-2 sm:gap-4 w-full lg:w-auto">
            <div className="flex flex-col flex-1 min-w-0 max-w-[180px] sm:max-w-[200px]">
              <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5 truncate">
                Section Options
              </label>
              <select
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-200 rounded px-2 py-1.5 sm:px-3 sm:py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 font-medium"
              >
                <option value="ALL">ALL</option>
                <option value="Mixing">Mixing</option>
                <option value="Extrusion">Extrusion</option>
                <option value="Cutting">Cutting</option>
                <option value="Calendering">Calendering</option>
              </select>
            </div>
            
            <div className="flex flex-col flex-1 min-w-0 max-w-[180px] sm:max-w-[200px] relative">
              <label className="block text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5 truncate">
                Category Options
              </label>
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full text-[11px] sm:text-xs font-semibold border border-slate-200 rounded px-2 py-1.5 sm:px-3 sm:py-2 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 text-slate-700 flex justify-between items-center select-none"
              >
                <span className="truncate">
                  {selectedCategories.length === 0
                    ? "None"
                    : selectedCategories.length === categoryOptions.length
                    ? "All"
                    : selectedCategories.join(", ")}
                </span>
                <span className="text-[10px] text-slate-400 font-bold ml-1 flex-shrink-0">▼</span>
              </button>
            {categoryDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setCategoryDropdownOpen(false)}
                />
                <div className="absolute top-[100%] left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-2 px-3 z-50 space-y-1">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSelectedCategories([...categoryOptions])}
                      className="text-[10px] font-black text-indigo-600 uppercase tracking-wider hover:underline"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCategories([])}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-wider hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                  {categoryOptions.map(cat => {
                    const isChecked = selectedCategories.includes(cat);
                    return (
                      <label 
                        key={cat} 
                        className="flex items-center gap-2 py-1 px-1.5 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-700 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedCategories(selectedCategories.filter(c => c !== cat));
                            } else {
                              setSelectedCategories([...selectedCategories, cat]);
                            }
                          }}
                          className="h-3.5 w-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span>{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

          {/* Last Saved Timestamp Info aligned next to options dropdown bar */}
          <div className="sm:ml-auto flex flex-col sm:items-end justify-center self-end">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Data Synchronization Status
            </span>
            <div className="text-xs text-slate-600 font-bold font-mono bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-lg flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 flex-shrink-0 animate-pulse"></span>
              Last saved: {lastSaveTime ? format(lastSaveTime, "dd-MM-yyyy HH:mm") : "01-06-2026 12:22"}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-full mx-auto px-2 sm:px-4 md:px-6 py-6 w-full">
        {loading && allRecords.length === 0 ? (
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
            
            {/* Table wrapper - target of handleCopyPicture to limit the capture card precisely and avoid screen margins */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden pb-0">
              <div ref={printRef} className="bg-white p-4">
                
                 {/* Header that only displays in printable image copy or browser print (desktop/tablet only, hidden on mobile) */}
                <div className={cn(
                  "border-b border-slate-200 pb-4 mb-4 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 p-4 rounded-xl gap-3 text-left",
                  copying ? "hidden md:flex" : "hidden md:print:flex"
                )}>
                  <div>
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Live Material Inventory Report</h2>
                    <div className="flex flex-col gap-1 mt-1.5">
                      <p className="text-[11px] text-slate-500 font-bold font-mono uppercase">
                        Captured Snapshot: {format(new Date(), "dd-MM-yyyy HH:mm")}
                      </p>
                      <div className="text-[11px] text-emerald-700 font-extrabold font-mono uppercase flex items-center mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 inline-block"></span>
                        Data Synchronization Status: Saved {lastSaveTime ? format(lastSaveTime, "dd-MM-yyyy HH:mm") : "01-06-2026 12:22"}
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Section View</span>
                    <span className="text-xs bg-indigo-100 text-indigo-700 font-black px-2.5 py-1 rounded-lg uppercase inline-block border border-indigo-200/50">{filterSection}</span>
                  </div>
                </div>

                {/* Desktop Version Table */}
                <div className="hidden md:block overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b-2 border-slate-200">
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-44">Section</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest w-48">Material Name</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center w-52">Inventory</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Remaining HRS</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Finish Time</th>
                        {editMode && <th className="px-4 py-4 hide-in-print w-16 text-right">Delete</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={editMode ? 6 : 5} className="px-6 py-12 text-center text-slate-400 text-sm">No records found.</td>
                        </tr>
                      ) : (
                        displayedRecords.map((r) => {
                          const originalIndex = allRecords.indexOf(r);
                          const { remainingHrs, finishTime } = calculateMetrics(r);
                          const isRubber = isRubberRecord(r);
                          
                          const isDanger = remainingHrs !== null && remainingHrs < (settings.dangerThreshold ?? 4);
                          const isOverstock = remainingHrs !== null && remainingHrs > (settings.overstockThreshold ?? 36);
                          
                          return (
                            <tr key={originalIndex} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-6 py-3">
                                {editMode ? (
                                  <input 
                                    value={r.section} 
                                    onChange={(e) => handleRecordChange(originalIndex, 'section', e.target.value)}
                                    className="w-full text-xs font-bold border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 bg-white"
                                    placeholder="e.g. Extrusion"
                                  />
                                ) : (
                                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{r.section}</span>
                                )}
                              </td>
                              <td className="px-6 py-3">
                                {editMode ? (
                                  <input 
                                    value={r.rubberCode} 
                                    onChange={(e) => handleRecordChange(originalIndex, 'rubberCode', e.target.value)}
                                    className="w-full font-mono text-xs border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 bg-white font-bold"
                                    placeholder="Material Name"
                                  />
                                ) : (
                                  <span className="font-mono font-bold text-slate-800 text-xs bg-slate-100/80 px-2.5 py-1 rounded">
                                    {r.rubberCode}
                                  </span>
                                )}
                              </td>
                              
                              {/* Direct display of quantity editable inline anywhere per Requirement 3 */}
                              <td className="px-6 py-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <input 
                                    type="number"
                                    step="any"
                                    value={r.batchesOrRolls ?? 0} 
                                    onChange={(e) => handleRecordChange(originalIndex, 'batchesOrRolls', parseFloat(e.target.value) || 0)}
                                    className="w-24 text-center font-mono font-bold text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white shadow-inner"
                                  />
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-16 text-left">
                                    {isRubber ? "Batches" : "Rolls"}
                                  </span>
                                </div>
                              </td>

                              <td className="px-6 py-3 text-right">
                                {remainingHrs === null ? (
                                  <span className="text-[10px] font-bold text-slate-300 uppercase">N/A</span>
                                ) : (
                                  <span className={cn(
                                    "px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-widest font-mono",
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
                                  <span className="text-[10px] font-bold text-slate-300 uppercase">N/A</span>
                                ) : (
                                  <span className={cn(
                                    "font-bold text-xs font-mono",
                                    isDanger ? "text-rose-600 animate-pulse" : "text-slate-600"
                                  )}>
                                    {format(finishTime, "dd-MM-yyyy HH:mm")}
                                  </span>
                                )}
                              </td>
                              {editMode && (
                                <td className="px-4 py-3 text-right hide-in-print">
                                  <button onClick={() => handleDeleteRow(originalIndex)} className="text-slate-400 hover:text-rose-500 transition-colors p-1.5 bg-rose-50 rounded-lg hover:bg-rose-100">
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

                {/* Mobile Version Table (Material Name, Remaining HRS, Finish Time with downside inline Inventory Count input) */}
                <div className="block md:hidden w-full">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-50/70 border-b-2 border-slate-200">
                        <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest w-[38%] text-left">Material Name</th>
                        <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest w-[28%] text-right">Remaining HRS</th>
                        <th className="px-3 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest w-[34%] text-right">Finish Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-12 text-center text-slate-400 text-sm">No records found.</td>
                        </tr>
                      ) : (
                        displayedRecords.map((r) => {
                          const originalIndex = allRecords.indexOf(r);
                          const { remainingHrs, finishTime } = calculateMetrics(r);
                          const isRubber = isRubberRecord(r);
                          
                          const isDanger = remainingHrs !== null && remainingHrs < (settings.dangerThreshold ?? 4);
                          const isOverstock = remainingHrs !== null && remainingHrs > (settings.overstockThreshold ?? 36);
                          
                          return (
                            <React.Fragment key={`mobile-${originalIndex}`}>
                              {/* Row 1: Material Name, Remaining HRS, Finish Time */}
                              <tr className="bg-white hover:bg-slate-50/50 transition-colors">
                                <td className="px-3 py-3 text-left">
                                  {editMode ? (
                                    <input 
                                      value={r.rubberCode} 
                                      onChange={(e) => handleRecordChange(originalIndex, 'rubberCode', e.target.value)}
                                      className="w-full font-mono text-xs border border-slate-200 rounded px-1.5 py-1 focus:ring-1 focus:ring-indigo-500 bg-white font-bold"
                                      placeholder="Name"
                                    />
                                  ) : (
                                    <span className="font-mono font-bold text-slate-800 text-xs bg-slate-100/80 px-2 py-0.5 rounded truncate block max-w-full">
                                      {r.rubberCode}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {remainingHrs === null ? (
                                    <span className="text-[10px] font-bold text-slate-300 uppercase">N/A</span>
                                  ) : (
                                    <div className="flex justify-end">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded font-bold text-[10px] uppercase font-mono text-right",
                                        isDanger ? "bg-rose-100 text-rose-700" :
                                        isOverstock ? "bg-amber-100 text-amber-700" :
                                        "bg-emerald-100 text-emerald-700"
                                      )}>
                                        {remainingHrs.toFixed(1)} HR
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {finishTime === null ? (
                                    <span className="text-[10px] font-bold text-slate-300 uppercase font-mono">N/A</span>
                                  ) : (
                                    <span className={cn(
                                      "font-bold text-[10px] font-mono leading-tight block break-words text-right",
                                      isDanger ? "text-rose-600" : "text-slate-600"
                                    )}>
                                      {format(finishTime, "dd-MM-yy HH:mm")}
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {/* Row 2: Aligned inline column inputs */}
                              <tr className="bg-slate-50/40 border-b border-slate-200">
                                <td className="px-3 pb-3 pt-1 text-left">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Inventory
                                  </span>
                                </td>
                                <td className="px-3 pb-3 pt-1 text-right">
                                  <div className="flex justify-end">
                                    <input 
                                      type="number"
                                      step="any"
                                      value={r.batchesOrRolls ?? 0} 
                                      onChange={(e) => handleRecordChange(originalIndex, 'batchesOrRolls', parseFloat(e.target.value) || 0)}
                                      className="w-16 text-center font-mono font-bold text-xs border border-slate-200 rounded px-1.5 py-1 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white shadow-sm"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 pb-3 pt-1 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider font-mono">
                                      {isRubber ? "Batches" : "Rolls"}
                                    </span>
                                    {editMode && (
                                      <button 
                                        onClick={() => handleDeleteRow(originalIndex)} 
                                        className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 bg-rose-50 rounded border border-rose-100 hover:bg-rose-100 ml-1.5"
                                        title="Delete material row"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {editMode && (
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 text-center hide-in-print">
                  <button onClick={handleAddRow} className="text-xs font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest flex items-center justify-center w-full gap-1">
                    <Plus className="w-4 h-4" /> Add New Material Row
                  </button>
                </div>
              )}
            </div>
            
            {/* Quick alert bar floating above if dirty */}
            {isDirty && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between hide-in-print">
                <div className="flex items-center text-left">
                  <AlertCircle className="w-5 h-5 text-amber-500 mr-3 flex-shrink-0" />
                  <p className="text-amber-700 text-xs font-semibold">
                    You have made changes to the stock count. Remember to save to synchronize with the main Google Sheets database.
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all uppercase tracking-wider"
                >
                  {saving ? "Saving..." : "Save Now"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Floating Success Toast notification for Copy & Snapshot Feedback */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: -24, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -16, x: "-50%" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 rounded-full border border-white/10 shadow-xl text-white font-sans text-xs font-bold uppercase tracking-wider whitespace-nowrap hide-in-print"
          >
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 animate-bounce" />
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
