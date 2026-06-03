import React, { useState, useEffect } from "react";
import { X, Save, Plus, Trash2, RefreshCw } from "lucide-react";
import { useSettings } from "../store/SettingsContext";
import { MaterialUsageRate } from "../types";
import { saveConsumptionRates, saveThresholds } from "../services/api";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { useAuth } from "../store/AuthContext";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTIONS = ["Mixing", "Extrusion", "Cutting", "Calendering"];
const CATEGORIES = ["Rubber", "PLY", "CH", "BW"];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, syncMaterialUsages, syncThresholds } = useSettings();
  
  // Local list of usages copied from global context for in-modal staging edits
  const [usagesList, setUsagesList] = useState<MaterialUsageRate[]>([]);
  const [dangerThreshold, setDangerThreshold] = useState<string>("4");
  const [overstockThreshold, setOverstockThreshold] = useState<string>("36");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Filtering states inside the settings modal
  const [filterSec, setFilterSec] = useState("ALL");
  const [filterCat, setFilterCat] = useState("ALL");

  // Keep track of typed input string values for row usage rates to prevent decimal truncations while typing (e.g., "0.0")
  const [inputStates, setInputStates] = useState<Record<number, string>>({});
  const [stdInputStates, setStdInputStates] = useState<Record<number, string>>({});

  // State for adding a new material row
  const [newSection, setNewSection] = useState("Mixing");
  const [newCategory, setNewCategory] = useState("Rubber");
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newUsagePerHour, setNewUsagePerHour] = useState("");
  const [newStandardTargetHours, setNewStandardTargetHours] = useState("");

  // Copy context items to local state on open
  useEffect(() => {
    if (isOpen) {
      setUsagesList(settings.materialUsages.map(item => ({ ...item })));
      setDangerThreshold(String(settings.dangerThreshold ?? 4));
      setOverstockThreshold(String(settings.overstockThreshold ?? 36));
      setInputStates({});
      setStdInputStates({});
      setSuccessMsg(null);
      setNewStandardTargetHours(newCategory === "Rubber" ? "24" : "120");
    }
  }, [isOpen, settings.materialUsages, settings.dangerThreshold, settings.overstockThreshold]);

  // Synchronize newStandardTargetHours on category change
  useEffect(() => {
    setNewStandardTargetHours(newCategory === "Rubber" ? "24" : "120");
  }, [newCategory]);

  const { user } = useAuth();

  if (!isOpen) return null;
  if (!user || user.role.toLowerCase() !== "admin") return null;

  const handleAddUsageRow = () => {
    if (!newMaterialName.trim() || isNaN(parseFloat(newUsagePerHour))) return;
    
    const parsedStd = parseFloat(newStandardTargetHours);
    const newRecord: MaterialUsageRate = {
      section: newSection,
      category: newCategory,
      materialName: newMaterialName.trim().toUpperCase(),
      usagePerHour: parseFloat(newUsagePerHour) || 0,
      standardTargetHours: isNaN(parsedStd) ? (newCategory === "Rubber" ? 24 : 120) : parsedStd
    };

    setUsagesList(prev => [...prev, newRecord]);
    setNewMaterialName("");
    setNewUsagePerHour("");
    setNewStandardTargetHours(newCategory === "Rubber" ? "24" : "120");
  };

  const handleFieldChange = (index: number, field: keyof MaterialUsageRate, value: any) => {
    setUsagesList(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleDeleteRow = (index: number) => {
    setUsagesList(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSuccessMsg(null);
    try {
      const parsedDanger = parseFloat(dangerThreshold);
      const parsedOverstock = parseFloat(overstockThreshold);
      
      const dangerVal = isNaN(parsedDanger) ? 4 : parsedDanger;
      const overstockVal = isNaN(parsedOverstock) ? 36 : parsedOverstock;

      const [ratesSuccess, thresholdsSuccess] = await Promise.all([
        saveConsumptionRates(usagesList),
        saveThresholds(dangerVal, overstockVal)
      ]);

      if (ratesSuccess && thresholdsSuccess) {
        syncMaterialUsages(usagesList);
        syncThresholds(dangerVal, overstockVal);
        setSuccessMsg("Successfully saved material usage configurations and thresholds to Google Sheets!");
        setTimeout(() => {
          setSuccessMsg(null);
        }, 3000);
      } else {
        alert("Failed to save some settings to Google Sheets. Please check configuration & credentials.");
      }
    } catch (err) {
      console.error("Failed to save configurations", err);
    } finally {
      setSaving(false);
    }
  };

  // Filter the Stage array to display
  const getFilteredUsages = () => {
    return usagesList.map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => {
        const matchesSection = filterSec === "ALL" || item.section.toLowerCase() === filterSec.toLowerCase();
        const matchesCategory = filterCat === "ALL" || item.category.toLowerCase() === filterCat.toLowerCase();
        return matchesSection && matchesCategory;
      });
  };

  const filteredItems = getFilteredUsages();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col m-2"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-slate-50 p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">System Settings</h2>
              <p className="text-xs text-slate-500 font-medium">Configure hourly usage rates of materials</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Filter Buttons in settings per Requirement 2 */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4 space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter Configurations View</h4>
              
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">Section selection:</span>
                  <div className="flex flex-wrap gap-1">
                    {["ALL", ...SECTIONS].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFilterSec(s)}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded border uppercase tracking-wider transition-all",
                          filterSec === s
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">Category selection:</span>
                  <div className="flex flex-wrap gap-1">
                    {["ALL", ...CATEGORIES].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFilterCat(c)}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded border uppercase tracking-wider transition-all",
                          filterCat === c
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Color Threshold Alerts Settings */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4 space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alert Color & Hourly Thresholds</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">
                    Danger alert threshold (Hours <span className="text-rose-600 font-bold font-mono">Red</span>):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      value={dangerThreshold}
                      onChange={(e) => setDangerThreshold(e.target.value)}
                      className="w-24 px-2 py-1 bg-white border border-slate-200 rounded font-mono text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                      placeholder="e.g. 4"
                    />
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Hours and below</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <span className="block text-[10px] font-bold text-slate-500 uppercase">
                    Overstock alert threshold (Hours <span className="text-amber-600 font-bold font-mono">Yellow</span>):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="any"
                      value={overstockThreshold}
                      onChange={(e) => setOverstockThreshold(e.target.value)}
                      className="w-24 px-2 py-1 bg-white border border-slate-200 rounded font-mono text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                      placeholder="e.g. 36"
                    />
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Hours and above</span>
                  </div>
                </div>
              </div>
            </div>

            {/* List Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Material Consumption Rates (Per Hour)</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono bg-slate-100 px-2 py-0.5 rounded">
                  Showing {filteredItems.length} of {usagesList.length} items
                </span>
              </div>

              {successMsg && (
                <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-700 text-xs font-medium">
                  {successMsg}
                </div>
              )}

              {/* Desktop Table View */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-lg overflow-x-auto select-none">
                <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-black text-slate-400">
                    <tr>
                      <th className="px-3 py-2 w-[18%]">Section</th>
                      <th className="px-3 py-2 w-[14%]">Category</th>
                      <th className="px-3 py-2 w-[22%]">Material Name</th>
                      <th className="px-3 py-2 w-[18%]">Usage in 1 Hour</th>
                      <th className="px-3 py-2 w-[20%]">Std. Target Hours</th>
                      <th className="px-3 py-2 w-[8%] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map(({ item, originalIndex }) => {
                      const isRubber = item.category.toLowerCase() === "rubber" || /^\d{4}F$/i.test(item.materialName);
                      const inputValue = originalIndex in inputStates
                        ? inputStates[originalIndex]
                        : (item.usagePerHour === 0 ? "" : String(item.usagePerHour));
                      const stdInputValue = originalIndex in stdInputStates
                        ? stdInputStates[originalIndex]
                        : (item.standardTargetHours === undefined ? "" : String(item.standardTargetHours));
                      return (
                        <tr key={originalIndex} className="hover:bg-slate-50/55">
                          <td className="px-3 py-1.5">
                            <select
                              value={item.section}
                              onChange={(e) => handleFieldChange(originalIndex, 'section', e.target.value)}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs outline-none bg-white font-medium"
                            >
                              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <select
                              value={item.category}
                              onChange={(e) => {
                                handleFieldChange(originalIndex, 'category', e.target.value);
                              }}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs outline-none bg-white font-medium"
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={item.materialName}
                              onChange={(e) => handleFieldChange(originalIndex, 'materialName', e.target.value.toUpperCase())}
                              className="w-full font-mono text-xs border border-slate-200 rounded px-2 py-1 bg-white font-bold"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={inputValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                                    setInputStates(prev => ({ ...prev, [originalIndex]: val }));
                                    const parsedNum = parseFloat(val);
                                    handleFieldChange(originalIndex, 'usagePerHour', isNaN(parsedNum) ? 0 : parsedNum);
                                  }
                                }}
                                className="w-16 text-center font-mono text-xs font-bold border border-slate-200 rounded px-2 py-1"
                              />
                              <span className="text-[10px] uppercase font-black text-slate-400">
                                {isRubber ? "b/hr" : "r/hr"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={stdInputValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                                    setStdInputStates(prev => ({ ...prev, [originalIndex]: val }));
                                    const parsedNum = parseFloat(val);
                                    handleFieldChange(originalIndex, 'standardTargetHours', isNaN(parsedNum) ? undefined : parsedNum);
                                  }
                                }}
                                className="w-16 text-center font-mono text-xs font-bold border border-slate-200 rounded px-2 py-1"
                              />
                              <span className="text-[10px] uppercase font-black text-slate-400">
                                hr
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button 
                              onClick={() => handleDeleteRow(originalIndex)}
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors inline-flex"
                              title="Delete row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs">
                          No material usage configurations match your filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="block md:hidden space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {filteredItems.map(({ item, originalIndex }) => {
                  const isRubber = item.category.toLowerCase() === "rubber" || /^\d{4}F$/i.test(item.materialName);
                  const inputValue = originalIndex in inputStates
                    ? inputStates[originalIndex]
                    : (item.usagePerHour === 0 ? "" : String(item.usagePerHour));
                  const stdInputValue = originalIndex in stdInputStates
                    ? stdInputStates[originalIndex]
                    : (item.standardTargetHours === undefined ? "" : String(item.standardTargetHours));

                  return (
                    <div key={originalIndex} className="p-3 bg-white rounded-xl border border-slate-200 space-y-3 relative shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Material Name</span>
                          <input
                            type="text"
                            value={item.materialName}
                            onChange={(e) => handleFieldChange(originalIndex, 'materialName', e.target.value.toUpperCase())}
                            className="w-full font-mono text-xs border border-slate-200 rounded px-2.5 py-1.5 bg-slate-50 font-bold focus:bg-white"
                          />
                        </div>
                        <button 
                          onClick={() => handleDeleteRow(originalIndex)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-rose-100 bg-white mt-4 flex-shrink-0"
                          title="Delete row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Section</span>
                          <select
                            value={item.section}
                            onChange={(e) => handleFieldChange(originalIndex, 'section', e.target.value)}
                            className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs outline-none bg-slate-50 focus:bg-white font-medium"
                          >
                            {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Category</span>
                          <select
                            value={item.category}
                            onChange={(e) => {
                              handleFieldChange(originalIndex, 'category', e.target.value);
                            }}
                            className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs outline-none bg-slate-50 focus:bg-white font-medium"
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                        <div>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Usage in 1 Hr</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={inputValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                                  setInputStates(prev => ({ ...prev, [originalIndex]: val }));
                                  const parsedNum = parseFloat(val);
                                  handleFieldChange(originalIndex, 'usagePerHour', isNaN(parsedNum) ? 0 : parsedNum);
                                }
                              }}
                              className="w-full text-center font-mono text-xs font-bold border border-slate-200 rounded px-2 py-1 bg-slate-50 focus:bg-white"
                            />
                            <span className="text-[9px] uppercase font-black text-slate-400">
                              {isRubber ? "b/h" : "r/h"}
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Std. Target Hrs</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={stdInputValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                                  setStdInputStates(prev => ({ ...prev, [originalIndex]: val }));
                                  const parsedNum = parseFloat(val);
                                  handleFieldChange(originalIndex, 'standardTargetHours', isNaN(parsedNum) ? undefined : parsedNum);
                                }
                              }}
                              className="w-full text-center font-mono text-xs font-bold border border-slate-200 rounded px-2 py-1 bg-slate-50 focus:bg-white"
                            />
                            <span className="text-[9px] uppercase font-black text-slate-400">
                              hr
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredItems.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-150">
                    No material usage configurations match your filter criteria.
                  </div>
                )}
              </div>
            </div>

            {/* Inline Add Row Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h4 className="text-xs font-black text-slate-600 uppercase tracking-tight mb-3">Add New Material Configuration</h4>
              <div className="grid gap-3 sm:grid-cols-5 items-end">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Section</label>
                  <select
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 bg-white"
                  >
                    {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 bg-white"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Material Name</label>
                  <input
                    type="text"
                    placeholder="e.g. 7316F or NA22GDP"
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Hourly Rate ({newCategory === "Rubber" ? "Batches" : "Rolls"}/hr)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 1.5"
                    value={newUsagePerHour}
                    onChange={(e) => setNewUsagePerHour(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded border border-slate-200 bg-white animate-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Std. Target Hours
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder={newCategory === "Rubber" ? "24" : "120"}
                      value={newStandardTargetHours}
                      onChange={(e) => setNewStandardTargetHours(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded border border-slate-200 bg-white animate-none"
                    />
                    <button
                      onClick={handleAddUsageRow}
                      disabled={!newMaterialName.trim() || !newUsagePerHour}
                      className="px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 font-bold rounded text-xs transition-colors py-1.5 flex items-center justify-center flex-shrink-0 animate-none"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky footer with actions */}
          <div className="sticky bottom-0 bg-slate-50 p-4 sm:p-6 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-all uppercase tracking-wider"
            >
              Close
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded shadow transition-all disabled:opacity-50 flex items-center uppercase tracking-wider"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving Configuration...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save to Google Sheets
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
