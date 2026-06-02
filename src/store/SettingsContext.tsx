import React, { createContext, useContext, useEffect, useState } from "react";
import { AppSettings, MaterialUsageRate } from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  materialUsages: [],
};

interface SettingsContextType {
  settings: AppSettings;
  updateMaterialUsage: (index: number, updated: MaterialUsageRate) => void;
  addMaterialUsage: (rate: MaterialUsageRate) => void;
  removeMaterialUsage: (index: number) => void;
  syncMaterialUsages: (rates: MaterialUsageRate[]) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("inventory_settings_v2");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse settings");
      }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem("inventory_settings_v2", JSON.stringify(settings));
  }, [settings]);

  const updateMaterialUsage = (index: number, updated: MaterialUsageRate) => {
    setSettings((prev) => {
      const copy = [...prev.materialUsages];
      copy[index] = updated;
      return { ...prev, materialUsages: copy };
    });
  };

  const addMaterialUsage = (rate: MaterialUsageRate) => {
    setSettings((prev) => ({
      ...prev,
      materialUsages: [...prev.materialUsages, rate],
    }));
  };

  const removeMaterialUsage = (index: number) => {
    setSettings((prev) => {
      const copy = [...prev.materialUsages];
      copy.splice(index, 1);
      return { ...prev, materialUsages: copy };
    });
  };

  const syncMaterialUsages = (usages: MaterialUsageRate[]) => {
    setSettings((prev) => ({
      ...prev,
      materialUsages: usages,
    }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateMaterialUsage, addMaterialUsage, removeMaterialUsage, syncMaterialUsages }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
}

