// IMPORTANT: YOU MUST COPY THIS ENTIRE FILE AND PASTE IT INTO YOUR GOOGLE APPS SCRIPT EDITOR
// Replace your existing code entirely.
//
// AFTER PASTING:
// 1. Click "Deploy" -> "New deployment"
// 2. Select type "Web app"
// 3. Set "Execute as" to "Me"
// 4. Set "Who has access" to "Anyone"
// 5. Click Deploy and authorize if prompted.
// 6. COPY the new Web App URL and paste it into `/src/services/api.ts` under MACRO_URL!

const SPREADSHEET_ID = "1GHwq2tHt0ZDwuGHfTZSov6b2JgfURUKt7c8WLZWPGKs";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "saveInventory") {
      return saveInventory(data.records);
    }
    
    if (action === "saveMaterialUsage") {
      return saveMaterialUsage(data.records);
    }
    
    return createJsonResponse({ error: "Unknown action: " + action });
      
  } catch (err) {
    return createJsonResponse({ error: err.toString() });
  }
}

function saveInventory(records) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Inventory');
  if (!sheet) {
    sheet = ss.insertSheet('Inventory');
    sheet.appendRow(['Section', 'Material Name', 'Batches/Rolls', 'Last Updated']);
  }
  
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const recSection = (rec.section || '').toString().trim();
    const recMaterial = (rec.materialName || '').toString().trim();
    const count = parseFloat(rec.batchesOrRolls) || 0;
    const dateStr = rec.lastUpdated || new Date().toISOString();
    
    sheet.appendRow([recSection, recMaterial, count, dateStr]);
  }
  
  return createJsonResponse({ success: true });
}

function getSheetByGid(ss, gid) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId().toString() === gid.toString()) {
      return sheets[i];
    }
  }
  return null;
}

function saveMaterialUsage(records) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = getSheetByGid(ss, '1582193389');
  
  if (!sheet) {
    sheet = ss.insertSheet();
  }
  
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([['Section', 'Category of material', 'Material name', 'Material will use in 1 hour']]);
  
  if (records && records.length > 0) {
    const rows = records.map(r => [
      r.section || '',
      r.category || '',
      r.materialName || '',
      parseFloat(r.usagePerHour) || 0
    ]);
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return createJsonResponse({ success: true });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput("Google Apps Script is online. The application uses POST requests to save data.")
    .setMimeType(ContentService.MimeType.JSON);
}
