/**
 * មុខងារ Setup: ចុច Run មុខងារនេះមុនគេ ដើម្បីរៀបចំ Sheets និង Headers ទាំងអស់
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheetsToCreate = [
    { name: "Accounts", headers: ["id", "phoneNumber", "session", "name", "isActive"] },
    { name: "Messages", headers: ["id", "telegramMessageId", "accountId", "senderId", "text", "timestamp", "type"] },
    { name: "Templates", headers: ["id", "title", "content", "category"] },
    { name: "Users", headers: ["id", "username", "password", "role"] },
    { name: "Settings", headers: ["key", "value"] },
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
    
    // បង្កើត Sheets ទាំងអស់ប្រសិនបើមិនទាន់មាន
    var sheets = {
      accounts: getOrCreateSheet(ss, "Accounts", ["id", "phoneNumber", "session", "name", "isActive"]),
      messages: getOrCreateSheet(ss, "Messages", ["id", "telegramMessageId", "accountId", "senderId", "text", "timestamp", "type"]),
      templates: getOrCreateSheet(ss, "Templates", ["id", "title", "content", "category"]),
      users: getOrCreateSheet(ss, "Users", ["id", "username", "password", "role"]),
      settings: getOrCreateSheet(ss, "Settings", ["key", "value"]),
      licenses: getOrCreateSheet(ss, "Licenses", ["key", "status", "expiry_date", "created_at", "note"])
    };

    // Check if it's a License Action
    if (data.type === 'license_action') {
      result = handleLicenseAction(sheets.licenses, data.action, data);
    } else {
      var action = data.action;
      switch(action) {
        // Account Operations
        case 'get_accounts':
          result = getRows(sheets.accounts);
          break;
        case 'save_account':
          result = saveOrUpdate(sheets.accounts, data.account, "id");
          break;
        case 'delete_account':
          result = deleteRow(sheets.accounts, data.id, "id");
          break;

        // Message Operations
        case 'get_messages':
          result = getRows(sheets.messages);
          break;
        case 'save_message':
          result = appendRow(sheets.messages, data.message);
          break;
        case 'find_message':
          result = findRow(sheets.messages, "telegramMessageId", data.telegramMessageId);
          break;

        // Template Operations
        case 'get_templates':
          result = getRows(sheets.templates);
          break;
        case 'save_template':
          result = saveOrUpdate(sheets.templates, data.template, "id");
          break;
        case 'delete_template':
          result = deleteRow(sheets.templates, data.id, "id");
          break;

        // User Operations
        case 'get_users':
          result = getRows(sheets.users);
          break;
        case 'save_user':
          result = saveOrUpdate(sheets.users, data.user, "id");
          break;

        // Setting Operations
        case 'get_settings':
          result = getRows(sheets.settings);
          break;
        case 'save_setting':
          result = saveOrUpdate(sheets.settings, {key: data.key, value: data.value}, "key");
          break;

        default:
          result = { error: "រកមិនឃើញ Action: " + action };
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
    // ពិនិត្យមើលថាតើ Key ជាន់គ្នាដែរឬទេ
    var exists = rows.find(function(r) { return r.key === data.key; });
    if (exists) return { success: false, message: 'License key រួចរាល់ហើយ' };
    
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
    if (!license) return { success: false, message: 'License key មិនត្រឹមត្រូវទេ' };
    if (license.status !== 'active') return { success: false, message: 'License key ត្រូវបានបិទ (Blocked)' };
    
    // Check expiry
    var expiry = new Date(license.expiry_date);
    var now = new Date();
    if (expiry < now) {
      // Auto update status to expired
      saveOrUpdate(sheet, { key: license.key, status: 'expired', expiry_date: license.expiry_date, created_at: license.created_at, note: license.note }, "key");
      return { success: false, message: 'License key ផុតកំណត់ហើយ' };
    }
    
    return { success: true, license: license };
  }
  
  if (action === 'list') {
    return { success: true, licenses: rows };
  }
  
  if (action === 'update_status') {
    var license = rows.find(function(r) { return r.key === data.key; });
    if (!license) return { success: false, message: 'រកមិនឃើញ License key' };
    
    license.status = data.status;
    return saveOrUpdate(sheet, license, "key");
  }
  
  return { success: false, message: 'Action មិនត្រឹមត្រូវសម្រាប់ License' };
}

// --- មុខងារជំនួយ (Helper Functions) ---

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
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

function appendRow(sheet, obj) {
  var headers = sheet.getDataRange().getValues()[0];
  var newRow = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ""; });
  sheet.appendRow(newRow);
  return { success: true };
}

function saveOrUpdate(sheet, obj, idKey) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIndex = headers.indexOf(idKey);
  
  if (idIndex === -1) return { error: "រកមិនឃើញ Key: " + idKey };

  for (var i = 1; i < data.length; i++) {
    if (data[i][idIndex] == obj[idKey]) {
      var rowValues = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : data[i][headers.indexOf(h)]; });
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
  return { success: false, message: "រកមិនឃើញទិន្នន័យ" };
}

function findRow(sheet, key, value) {
  var rows = getRows(sheet);
  var found = rows.find(function(r) { return r[key] == value; });
  return found || null;
}
