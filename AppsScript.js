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
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      let sheet = ss.getSheetByName('Inventory');
      if (!sheet) {
        sheet = ss.insertSheet('Inventory');
      }
      
      // Clear all existing data
      sheet.clearContent();
      
      // Setup headers
      sheet.appendRow(['Section', 'Material Name', 'Batches/Rolls', 'Last Updated']);
      
      if (data.records && data.records.length > 0) {
        const rows = data.records.map(r => [
          r.section || '',
          r.materialName || '',
          r.batchesOrRolls || 0,
          r.lastUpdated || new Date().toISOString()
        ]);
        
        // Write all rows starting from row 2
        sheet.getRange(2, 1, rows.length, 4).setValues(rows);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ error: "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Google Apps Script is online. The application uses POST requests to save data.")
    .setMimeType(ContentService.MimeType.JSON);
}
