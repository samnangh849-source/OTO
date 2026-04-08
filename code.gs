/**
 * មុខងារ Setup: ចុច Run មុខងារនេះមុនគេ ដើម្បីរៀបចំ Sheets និង Headers ទាំងអស់
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheetsToCreate = [
    { name: "Accounts", headers: ["id", "phone", "session", "firstName", "lastName", "username", "photo", "pts", "date", "isActive", "licenseKey"] },
    { name: "Messages", headers: ["id", "telegramMessageId", "senderId", "senderName", "senderPhoto", "type", "text", "isOutgoing", "accountId", "timestamp", "isReplied", "licenseKey"] },
    { name: "Templates", headers: ["id", "name", "content", "type", "tags", "licenseKey"] },
    { name: "Users", headers: ["id", "username", "password", "role"] },
    { name: "Settings", headers: ["key", "value", "licenseKey"] },
    { name: "Licenses", headers: ["key", "status", "expiry_date", "created_at", "note"] }
  ];

  sheetsToCreate.forEach(function(item) {
    getOrCreateSheet(ss, item.name, item.headers);
  });
  
  Logger.log("ការរៀបចំ Sheets ត្រូវបានបញ្ចប់ជោគជ័យ!");
}

/**
 * Google Apps Script សម្រាប់ភ្ជាប់ជាមួយ Telegram Manual Reply Dashboard
 */

function doPost(e) {
  var result;
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var licenseKey = data.licenseKey;
    
    var sheets = {
      accounts: getOrCreateSheet(ss, "Accounts", ["id", "phone", "session", "firstName", "lastName", "username", "photo", "pts", "date", "isActive", "licenseKey"]),
      messages: getOrCreateSheet(ss, "Messages", ["id", "telegramMessageId", "senderId", "senderName", "senderPhoto", "type", "text", "isOutgoing", "accountId", "timestamp", "isReplied", "licenseKey"]),
      templates: getOrCreateSheet(ss, "Templates", ["id", "name", "content", "type", "tags", "licenseKey"]),
      settings: getOrCreateSheet(ss, "Settings", ["key", "value", "licenseKey"]),
      licenses: getOrCreateSheet(ss, "Licenses", ["key", "status", "expiry_date", "created_at", "note"])
    };

    if (data.type === 'license_action') {
      result = handleLicenseAction(sheets.licenses, data.action, data);
    } else {
      var action = data.action;
      switch(action) {
        // Account Operations
        case 'get_accounts':
          result = getRowsFiltered(sheets.accounts, "licenseKey", licenseKey);
          break;
        case 'save_account':
          data.account.licenseKey = licenseKey;
          result = saveOrUpdate(sheets.accounts, data.account, "id");
          break;
        case 'delete_account':
          result = deleteRow(sheets.accounts, data.id, "id");
          break;

        // Message Operations
        case 'get_messages':
          result = getRowsFiltered(sheets.messages, "licenseKey", licenseKey);
          break;
        case 'save_message':
          data.message.licenseKey = licenseKey;
          result = saveOrUpdate(sheets.messages, data.message, "telegramMessageId");
          break;

        // Template Operations
        case 'get_templates':
          result = getRowsFiltered(sheets.templates, "licenseKey", licenseKey);
          break;
        case 'save_template':
          data.template.licenseKey = licenseKey;
          result = saveOrUpdate(sheets.templates, data.template, "id");
          break;
        case 'delete_template':
          result = deleteRow(sheets.templates, data.id, "id");
          break;

        // Setting Operations
        case 'get_settings':
          result = getRowsFiltered(sheets.settings, "licenseKey", licenseKey);
          break;
        case 'save_setting':
          result = saveOrUpdate(sheets.settings, {key: data.key, value: data.value, licenseKey: licenseKey}, "key");
          break;

        default:
          result = { error: "Action not found: " + action };
      }
    }
  } catch (error) {
    result = { error: error.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- License Management Logic ---

function handleLicenseAction(sheet, action, data) {
  var rows = getRows(sheet);
  
  if (action === 'create') {
    var exists = rows.find(function(r) { return r.key === data.key; });
    if (exists) return { success: false, message: 'License key already exists' };
    
    appendRow(sheet, {
      key: data.key,
      status: 'active',
      expiry_date: data.expiry_date,
      created_at: new Date().toISOString(),
      note: data.note || ''
    });
    return { success: true };
  }
  
  if (action === 'validate') {
    var license = rows.find(function(r) { return r.key === data.key; });
    if (!license) return { success: false, message: 'Invalid license key' };
    if (license.status !== 'active') return { success: false, message: 'License key is blocked' };
    
    var expiry = new Date(license.expiry_date);
    if (expiry < new Date()) {
      saveOrUpdate(sheet, { key: license.key, status: 'expired' }, "key");
      return { success: false, message: 'License key expired' };
    }
    return { success: true, license: license };
  }
  
  if (action === 'list') return { success: true, licenses: rows };
  
  if (action === 'update_status') {
    return saveOrUpdate(sheet, { key: data.key, status: data.status }, "key");
  }
  
  return { success: false, message: 'Invalid action' };
}

// --- Helper Functions ---

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  } else {
    // Basic Header Alignment - add missing columns if needed
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach(function(h) {
      if (existingHeaders.indexOf(h) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h).setFontWeight("bold");
      }
    });
  }
  return sheet;
}

function getRows(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function getRowsFiltered(sheet, filterKey, filterValue) {
  var rows = getRows(sheet);
  if (!filterValue) return rows;
  return rows.filter(function(r) { return r[filterKey] == filterValue; });
}

function appendRow(sheet, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newRow = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ""; });
  sheet.appendRow(newRow);
  return { success: true };
}

function saveOrUpdate(sheet, obj, idKey) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIndex = headers.indexOf(idKey);
  var licenseIndex = headers.indexOf("licenseKey");
  
  if (idIndex === -1) return { error: "ID Key not found: " + idKey };

  for (var i = 1; i < data.length; i++) {
    // To update, BOTH ID and LicenseKey must match (unless it's the Licenses table)
    var idMatch = data[i][idIndex] == obj[idKey];
    var licenseMatch = licenseIndex === -1 || !obj.licenseKey || data[i][licenseIndex] == obj.licenseKey;
    
    if (idMatch && licenseMatch) {
      var rowValues = headers.map(function(h) { 
        return obj[h] !== undefined ? obj[h] : data[i][headers.indexOf(h)]; 
      });
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowValues]);
      return { success: true, updated: true };
    }
  }
  return appendRow(sheet, obj);
}

function deleteRow(sheet, id, idKey) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIndex = headers.indexOf(idKey);
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIndex] == id) {
      sheet.deleteRow(i + 1);
      return { success: true, deleted: true };
    }
  }
  return { success: false };
}

function findRow(sheet, key, value) {
  var rows = getRows(sheet);
  var found = rows.find(function(r) { return r[key] == value; });
  return found || null;
}
