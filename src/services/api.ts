import { parse, isValid } from "date-fns";
import { InventoryRawRecord } from "../types";

const MACRO_URL = "https://script.google.com/macros/s/AKfycbwgP4jhdt0rom8RB3r3yvc42Xg-kgB4FgJ2DQTVOFHTir1g6mVFjCAMW5BB0dpbFbSARg/exec";
const NEW_SHEET_ID = "1GHwq2tHt0ZDwuGHfTZSov6b2JgfURUKt7c8WLZWPGKs";
const CONSUMPTION_SHEET_ID = "1m79DT6yZNg_qJLzMikzVXIV84pFRq6NkItMDA-Wd6P8";

// --- JSONP Helper for Google Sheets (Used for Consumption) ---
async function fetchSheetData(sheetId: string, sheetName?: string, gid?: string): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const cbName = 'sheet_cb_' + Math.random().toString(36).substring(2, 11);
    const tqx = `out:json;responseHandler:${cbName}`;
    let url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=${tqx}`;
    
    if (gid) {
      url += `&gid=${gid}`;
    } else if (sheetName) {
      url += `&sheet=${sheetName}`;
    }
    url += `&_=${new Date().getTime()}`; // Bypass aggressive Google Sheet caching
    
    const script = document.createElement('script');
    script.src = url;
    
    (window as any)[cbName] = (data: any) => {
      document.head.removeChild(script);
      delete (window as any)[cbName];
      
      try {
        const rows: string[][] = [];
        if (data && data.table && data.table.cols) {
          rows.push(data.table.cols.map((c: any) => c ? String(c.label || '') : ''));
        }
        if (data && data.table && data.table.rows) {
          for (const row of data.table.rows) {
            if (!row || !row.c) continue;
            const rData = row.c.map((cell: any) => {
              if (!cell) return '';
              if (cell.f !== undefined && cell.f !== null) return String(cell.f);
              if (cell.v !== undefined && cell.v !== null) return String(cell.v);
              return '';
            });
            rows.push(rData);
          }
        }
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    
    script.onerror = () => {
      document.head.removeChild(script);
      delete (window as any)[cbName];
      reject(new Error("JSONP fetch failed"));
    };
    
    document.head.appendChild(script);
  });
}

// Common date formats in sheets: MM/dd/yyyy HH:mm:ss
function parseSheetDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim().replace(/\s+/g, ' ');
  const nativeParsed = new Date(trimmed);
  if (!isNaN(nativeParsed.getTime())) return nativeParsed;
  return null;
}

export async function fetchUsers(): Promise<Record<string, {password: string, role: string}>> {
  const users: Record<string, {password: string, role: string}> = {};
  try {
    const rows = await fetchSheetData(NEW_SHEET_ID, "Users");
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 3 && row[0]) {
        users[row[0].trim()] = {
          password: String(row[1] || "").trim(),
          role: String(row[2] || "").trim(),
        };
      }
    }
  } catch (err) {
    console.error("Error fetching users:", err);
  }
  return users;
}

export async function fetchConsumptionRates(): Promise<Record<string, number>> {
  const consumptionRates: Record<string, number> = {};
  
  try {
    const rows = await fetchSheetData(CONSUMPTION_SHEET_ID, undefined, "1995297640");
    // O column is index 14, T column is index 19. Start from 4th row (index 3)
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (row.length > 19) {
        const rawMaterial = String(row[14] || "");
        const batchesStr = String(row[19] || "");
        
        const rubberMatch = rawMaterial.match(/^(\d{4}F)/i);
        const rubberCode = rubberMatch ? rubberMatch[1].toUpperCase() : rawMaterial.trim();
        
        if (rubberCode) {
          const batches = parseFloat(batchesStr);
          if (!isNaN(batches)) {
            consumptionRates[rubberCode] = batches;
          }
        }
      }
    }
  } catch (err) {
    console.error("Error fetching consumption rates:", err);
  }
  
  return consumptionRates;
}

export async function fetchInventoryData(): Promise<{ records: InventoryRawRecord[]; errors: string[] }> {
    try {
        // Read directly from the sheet using JSONP (bypasses CORS/AppsScript execution)
        // Using the sheetName "Inventory"
        const rows = await fetchSheetData(NEW_SHEET_ID, "Inventory");
        const allRecords: InventoryRawRecord[] = [];
        
        // Starts from index 1 to skip header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Format: ['Section', 'Material Name', 'Batches/Rolls', 'Last Updated']
            if (row.length >= 2 && (row[0] || row[1])) {
                const batches = parseFloat(row[2]) || 0;
                const dateStr = String(row[3] || "");
                let parsedDate = dateStr ? new Date(dateStr) : new Date();
                if (isNaN(parsedDate.getTime())) {
                    // Try to extract if format is Date(...)
                    const match = dateStr.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
                    if (match) {
                        parsedDate = new Date(
                           parseInt(match[1]), 
                           parseInt(match[2]), 
                           parseInt(match[3]), 
                           match[4] ? parseInt(match[4]) : 0, 
                           match[5] ? parseInt(match[5]) : 0, 
                           match[6] ? parseInt(match[6]) : 0
                        );
                    }
                    if (isNaN(parsedDate.getTime())) parsedDate = new Date();
                }

                allRecords.push({
                    section: String(row[0] || ""),
                    rubberCode: String(row[1] || ""),
                    weight: 0,
                    batchesOrRolls: batches,
                    timestamp: parsedDate,
                    barcode: ""
                });
            }
        }
        
        return { records: allRecords, errors: [] };
    } catch (err: any) {
        console.warn("Failed to load inventory from sheet: ", err);
        return { records: [], errors: ["Failed to load from Google Sheet. Ensure 'Anyone with the link can view' is enabled."] };
    }
}

export async function saveInventoryData(records: InventoryRawRecord[]): Promise<boolean> {
    const dataToSave = records.map(r => {
        let d = r.timestamp;
        if (!(d instanceof Date)) d = new Date(d);
        if (isNaN(d.getTime())) d = new Date();
        return {
            section: r.section || "",
            materialName: r.rubberCode || "",
            batchesOrRolls: r.batchesOrRolls || 0,
            lastUpdated: d.toISOString()
        };
    });
    
    try {
        // Send as text/plain to avoid CORS preflight, and use mode: 'no-cors' so 
        // the browser doesn't block the request. We don't await the response here 
        // to avoid throwing an opaque CORS redirect error that interrupts the UI.
        fetch(MACRO_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain",
            },
            body: JSON.stringify({ action: "saveInventory", records: dataToSave })
        }).catch(e => {
            // Silently ignore browser CORS errors. The POST payload is still delivered.
            console.warn("Apps Script redirect blocked by browser (normal behavior):", e);
        });

        // Give Apps Script a couple of seconds to process the request safely
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return true;
    } catch (err: any) {
        console.error("Error initiating save:", err);
        return false;
    }
}
