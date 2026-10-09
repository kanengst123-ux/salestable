/**
 * Google Apps Script Web App Template for Salestable / Trade Log App.
 * Fully backwards-compatible with all existing apps, external automations,
 * Customer Grade managers, Product managers, and Trade Log operations.
 *
 * Supported Actions (via HTTP POST / JSON):
 * 1. addProduct / updateProduct: Add/update product in 'raw' sheet.
 * 2. addCustomer: Add new customer to 'customer_cat' or '顧客級數' sheet.
 * 3. updateGrades: Update customer grade assignments in 'customer_cat' / '顧客級數'.
 *    (Also supports legacy payload `{ "CustomerName": "A", ... }` directly).
 * 4. writeTradeLog: Writes trade rows to 'Trade_Log' (or 'Trade_log_admin') and deducts inventory in 'raw'.
 * 5. deleteOrder: Deletes order rows by orderId and restores inventory in 'raw' (strictly 1x, deduplicated).
 * 6. revertStockForOrders: Reverts/replenishes stock for specific order ID(s) without double counting.
 *
 * Supported Actions (via HTTP GET):
 * 1. getCustomers: Returns list of customers with grade, sales/user, and district.
 * 2. getProducts: Returns all products from 'raw' sheet with prices, stock, and remarks.
 * 3. getProductImage: Finds image in Google Drive by product ID / SKU.
 */

// ==========================================
// 1. HTTP POST Entrypoint
// ==========================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Empty post body' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var param = {};
    try {
      param = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid JSON payload: ' + parseErr.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var action = param.action;

    // A. Action: addProduct or updateProduct
    if (action === 'addProduct' || action === 'updateProduct' || (!action && param.id && param.name)) {
      var prodResult = handleAddOrUpdateProduct(param);
      return ContentService.createTextOutput(JSON.stringify(prodResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // B. Action: addCustomer
    if (action === 'addCustomer') {
      var custResult = handleAddCustomer(param);
      return ContentService.createTextOutput(JSON.stringify(custResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // C. Action: updateGrades or Legacy Direct Grade Map
    // (Other apps or CustomerGrades tab send either { action: 'updateGrades', grades: {...} }
    // or directly { "Customer A": "A", "Customer B": "B" })
    var isDirectGradeMap = !action && !param.orderId && !param.rows && !param.id && typeof param === 'object' && Object.keys(param).length > 0;
    if (action === 'updateGrades' || param.grades || isDirectGradeMap) {
      var gradesData = param.grades || param;
      var gradeResult = handleUpdateGrades(gradesData);
      return ContentService.createTextOutput(JSON.stringify(gradeResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // D. Action: writeTradeLog
    if (action === 'writeTradeLog') {
      var logResult = handleWriteTradeLog(param);
      return ContentService.createTextOutput(JSON.stringify(logResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // E. Action: deleteOrder / removeTradeLogRows / revertTradeLog (Deletes order and replenishes stock strictly 1x, or keeps stock unchanged if requested)
    if (action === 'deleteOrder' || action === 'removeTradeLogRows' || action === 'deleteTradeLog' || action === 'revertTradeLog' || action === 'revertTrade') {
      var delResult = handleDeleteOrder(param);
      return ContentService.createTextOutput(JSON.stringify(delResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // F. Action: revertStockForOrders / revertStock
    if (action === 'revertStockForOrders' || action === 'revertStock') {
      var orderIds = param.orderIds || (param.orderId ? [param.orderId] : []);
      var revertResult = handleRevertStockForOrders(orderIds);
      return ContentService.createTextOutput(JSON.stringify(revertResult))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'unknown action: ' + action }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 2. HTTP GET Entrypoint
// ==========================================
function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;

    // 1. getCustomers
    if (action === 'getCustomers') {
      var customers = handleGetCustomers();
      return ContentService.createTextOutput(JSON.stringify(customers))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. getProducts
    if (action === 'getProducts') {
      var products = handleGetProducts();
      return ContentService.createTextOutput(JSON.stringify(products))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. getProductImage
    if (action === 'getProductImage') {
      var id = e.parameter ? e.parameter.id : null;
      if (!id) {
        return ContentService.createTextOutput(JSON.stringify({ found: false, error: 'missing id' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var foundUrl = null;
      var fileNamesToTry = [id, id + '.jpg', id + '.png', id + '.jpeg', id + '.webp'];
      for (var fIdx = 0; fIdx < fileNamesToTry.length; fIdx++) {
        var files = DriveApp.getFilesByName(fileNamesToTry[fIdx]);
        if (files.hasNext()) {
          var file = files.next();
          foundUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ found: !!foundUrl, url: foundUrl, id: id }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput("Google Apps Script Web App is active and ready.");
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 3. Core Helper Functions
// ==========================================

/**
 * Safely find all trade log sheets in the active spreadsheet.
 * Strictly deduplicates sheets by Sheet ID so that aliases or case variations
 * NEVER cause the same sheet to be processed multiple times.
 */
function getUniqueTradeLogSheets(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = ss.getSheets();
  var logSheets = [];
  var visitedSheetIds = {};

  for (var i = 0; i < allSheets.length; i++) {
    var s = allSheets[i];
    var sId = s.getSheetId();
    if (visitedSheetIds[sId]) continue;

    var nameNorm = s.getName().toLowerCase().replace(/[\s_-]/g, '');
    if (nameNorm === 'tradelog' || nameNorm === 'tradelogadmin' || s.getName() === '交易記錄') {
      visitedSheetIds[sId] = true;
      logSheets.push(s);
    }
  }
  return logSheets;
}

/**
 * Safely parse numeric value from currency or formatted strings.
 */
function safeParseNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  var cleaned = val.toString().replace('$', '').replace(/,/g, '').trim();
  var parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Safely parse price value (returns NaN if empty, preserving unset prices).
 */
function safeParsePrice(val) {
  if (val === undefined || val === null || val.toString().trim() === '') return NaN;
  var cleaned = val.toString().replace('$', '').replace(/,/g, '').trim();
  var parsed = parseFloat(cleaned);
  return isNaN(parsed) ? NaN : parsed;
}

/**
 * Get customer categorization sheet (supports customer_cat or 顧客級數).
 */
function getCustomerCatSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('customer_cat') ||
         ss.getSheetByName('顧客級數') ||
         ss.getSheetByName('Customer_Cat');
}

// ==========================================
// 4. Feature Handlers
// ==========================================

/**
 * Handle Add or Update Product in 'raw' sheet.
 */
function handleAddOrUpdateProduct(param) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('raw');
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }

  var name = param.name;
  var id = param.id;
  var price = param.price;
  var priceA = param.priceA;
  var priceB = param.priceB;
  var priceC = param.priceC;
  var quantity = param.quantity;
  var remarks = param.remarks;

  // Resolve headers dynamically from row 1 to guarantee exact column placement
  var lastCol = Math.max(sheet.getLastColumn(), 57);
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = {};
  for (var c = 0; c < headerRow.length; c++) {
    var h = (headerRow[c] || "").toString().trim().toLowerCase();
    if (h) colMap[h] = c + 1; // 1-based index
  }

  // Exact column resolution with standard fallbacks:
  // Col A (1): URL
  // Col B (2): Product ID
  // Col C (3): Title
  // Col D (4): Description
  // Col N (14): Cost
  // Col O (15): Price
  // Col R (18): Discounted Price For Member Tier - GOLD (Grade A)
  // Col S (19): Discounted Price For Member Tier - SILVER (Grade B)
  // Col T (20): Discounted Price For Member Tier - Basic (Grade C)
  // Col U (21): Enable volume price
  // Col AB (28): Unlimited stock
  // Col AC (29): Stock
  // Col AD (30): Cat
  // Col AF (32): list
  // Col AU (47): Publish Status
  // Col AV (48): Listing status

  var colUrl = colMap['url'] || 1;
  var colId = colMap['product id'] || 2;
  var colTitle = colMap['title'] || colMap['name'] || 3;
  var colDesc = colMap['description'] || 4;
  var colCost = colMap['cost'] || 14;
  var colPrice = colMap['price'] || 15;
  var colGold = colMap['discounted price for member tier - gold'] || 18;
  var colSilver = colMap['discounted price for member tier - silver'] || 19;
  var colBasic = colMap['discounted price for member tier - basic'] || 20;
  var colVol = colMap['enable volume price'] || 21;
  var colUnlimited = colMap['unlimited stock'] || 28;
  var colStock = colMap['stock'] || 29;
  var colCat = colMap['cat'] || 30;
  var colList = colMap['list'] || 32; // Col AF
  var colPubStatus = colMap['publish status'] || 47;
  var colListStatus = colMap['listing status'] || 48;

  var data = sheet.getDataRange().getValues();
  var foundIndex = -1;
  for (var i = 1; i < data.length; i++) {
    var rowName = (data[i][colTitle - 1] || "").toString().trim();
    var rowId = (data[i][colId - 1] || "").toString().trim();
    if ((id && rowId === id.toString().trim()) || (name && rowName === name.toString().trim())) {
      foundIndex = i;
      break;
    }
  }

  var rowToUpdate = foundIndex !== -1 ? foundIndex + 1 : sheet.getLastRow() + 1;

  if (foundIndex === -1) {
    // New product insertion:
    sheet.getRange(rowToUpdate, colUrl).setValue("");                          // Col A: URL (Do NOT put timestamp!)
    sheet.getRange(rowToUpdate, colId).setValue(id || "");                     // Col B: Product ID
    sheet.getRange(rowToUpdate, colTitle).setValue(name || "");                // Col C: Title (Product Name)
    sheet.getRange(rowToUpdate, colDesc).setValue(param.description || "");    // Col D: Description (Do NOT put ID!)
    sheet.getRange(rowToUpdate, colCost).setValue(param.cost !== undefined ? param.cost : 0); // Col N: Cost
    sheet.getRange(rowToUpdate, colVol).setValue(0);                           // Col U: Enable volume price
    sheet.getRange(rowToUpdate, colCat).setValue(param.cat || "#N/A");         // Col AD: Cat
    sheet.getRange(rowToUpdate, colPubStatus).setValue(1);                     // Col AU: Publish Status
    sheet.getRange(rowToUpdate, colListStatus).setValue(1);                    // Col AV: Listing status
  } else {
    // Update existing product
    if (id) sheet.getRange(rowToUpdate, colId).setValue(id);
    if (name) sheet.getRange(rowToUpdate, colTitle).setValue(name);
  }

  // Prices
  var pNum = safeParsePrice(price);
  if (!isNaN(pNum)) sheet.getRange(rowToUpdate, colPrice).setValue(pNum);      // Col O: Price

  var pA = safeParsePrice(priceA);
  if (!isNaN(pA)) sheet.getRange(rowToUpdate, colGold).setValue(pA);           // Col R: A 價
  else if (!isNaN(pNum)) sheet.getRange(rowToUpdate, colGold).setValue(pNum);

  var pB = safeParsePrice(priceB);
  if (!isNaN(pB)) sheet.getRange(rowToUpdate, colSilver).setValue(pB);         // Col S: B 價
  else if (!isNaN(pNum)) sheet.getRange(rowToUpdate, colSilver).setValue(pNum);

  var pC = safeParsePrice(priceC);
  if (!isNaN(pC)) sheet.getRange(rowToUpdate, colBasic).setValue(pC);          // Col T: C 價
  else if (!isNaN(pNum)) sheet.getRange(rowToUpdate, colBasic).setValue(pNum);

  // Stock
  var abVal = (quantity === "" || quantity === undefined) ? 1 : 0;
  var acVal = abVal === 1 ? "" : (quantity || "0");
  sheet.getRange(rowToUpdate, colUnlimited).setValue(abVal);                   // Col AB: UnlimitedStock
  sheet.getRange(rowToUpdate, colStock).setValue(acVal);                       // Col AC: Stock

  // Col AF: list (Header as 'list') MUST ALWAYS BE '0' so users can select the newly added product!
  sheet.getRange(rowToUpdate, colList).setValue("0");

  SpreadsheetApp.flush();
  return {
    status: 'success',
    message: 'Product synced successfully in row ' + rowToUpdate,
    id: id || "",
    name: name || "",
    row: rowToUpdate
  };
}

/**
 * Handle Add Customer to customer_cat / 顧客級數.
 */
function handleAddCustomer(param) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getCustomerCatSheet(ss);
  if (!sheet) {
    return { status: 'error', message: 'customer_cat or 顧客級數 sheet not found' };
  }

  var name = param.name;
  var user = param.user || param.sales || "";
  var district = param.district || "";
  var grade = param.grade || "C";

  sheet.appendRow([name, user, grade, district]);
  SpreadsheetApp.flush();
  return { status: 'success', message: 'Customer added successfully' };
}

/**
 * Handle Update Customer Grades.
 * Updates customer grades in 'customer_cat' / '顧客級數' without modifying other fields.
 */
function handleUpdateGrades(grades) {
  if (!grades || typeof grades !== 'object') {
    return { status: 'error', message: 'No grades provided' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getCustomerCatSheet(ss);
  if (!sheet) {
    return { status: 'error', message: 'customer_cat or 顧客級數 sheet not found' };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { status: 'success', message: 'No customer rows to update' };
  }

  var updatedCount = 0;
  for (var i = 1; i < data.length; i++) {
    var custName = (data[i][0] || '').toString().trim();
    if (custName && grades.hasOwnProperty(custName)) {
      var newGrade = grades[custName];
      if (newGrade !== undefined && newGrade !== null) {
        sheet.getRange(i + 1, 3).setValue(newGrade.toString().trim().toUpperCase()); // Col C: Grade
        updatedCount++;
      }
    }
  }

  SpreadsheetApp.flush();
  return { status: 'success', message: 'Updated ' + updatedCount + ' customer grades successfully' };
}

/**
 * Handle Write Trade Log & Deduct Inventory.
 */
function handleWriteTradeLog(param) {
  var rows = param.rows;
  if (!rows || rows.length === 0) {
    return { status: 'success', message: 'No rows sent' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Determine target sheet
  var isTargetAdmin = false;
  if (param.targetSheet === 'Trade_log_admin' || param.isAdmin === true) {
    isTargetAdmin = true;
  } else if (rows[0] && rows[0].length > 10) {
    var userCol = (rows[0][10] || '').toString().trim().toLowerCase();
    if (userCol === 'admin') isTargetAdmin = true;
  }

  var sheet;
  var targetSheetName;
  if (isTargetAdmin) {
    targetSheetName = 'Trade_log_admin';
    sheet = ss.getSheetByName('Trade_log_admin') ||
            ss.getSheetByName('Trade_Log_admin') ||
            ss.getSheetByName('trade_log_admin');
    if (!sheet) sheet = ss.insertSheet('Trade_log_admin');
  } else {
    targetSheetName = 'Trade_Log';
    sheet = ss.getSheetByName('Trade_Log') ||
            ss.getSheetByName('trade_log') ||
            ss.getSheetByName('交易記錄');
    if (!sheet) sheet = ss.getSheetByName('Trade_Log') || ss.getSheets()[0];
  }

  // Deduplicate and remove existing rows with matching order IDs across all trade log tabs
  var incomingIds = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length >= 13) {
      var oId = (rows[i][12] || '').toString().trim();
      if (oId) incomingIds[oId] = true;
    }
  }

  var uniqueIdsToDelete = Object.keys(incomingIds);
  if (uniqueIdsToDelete.length > 0) {
    var logSheetsForClean = getUniqueTradeLogSheets(ss);
    var oldRowsToReplenish = [];

    logSheetsForClean.forEach(function(targetLogSheet) {
      var lastRow = targetLogSheet.getLastRow();
      if (lastRow > 1) {
        var allData = targetLogSheet.getRange(1, 1, lastRow, 14).getValues();
        for (var r = lastRow; r >= 2; r--) {
          var rowOrderId = (allData[r - 1][12] || '').toString().trim();
          if (rowOrderId && incomingIds[rowOrderId]) {
            oldRowsToReplenish.push(allData[r - 1]);
            targetLogSheet.deleteRow(r);
          }
        }
      }
    });

    // If delta adjustment options are NOT supplied and there were existing rows,
    // replenish old rows first so deducting the new rows results in the exact delta.
    var hasExplicitDelta = (param.deltaRowsToDeduct && param.deltaRowsToDeduct.length > 0) ||
                           (param.deltaRowsToReplenish && param.deltaRowsToReplenish.length > 0);
    if (!hasExplicitDelta && !param.keepStock && !param.skipStockReplenish && param.replenishStock !== false && oldRowsToReplenish.length > 0) {
      replenishInventoryInRaw(ss, oldRowsToReplenish);
    }
  }

  // Append new trade rows
  for (var i = 0; i < rows.length; i++) {
    sheet.appendRow(rows[i]);
  }

  // Handle inventory quantities in 'raw' sheet:
  // If skipStockDeduction is true or deductStock is false or keepStock is true:
  // Stock was already deducted (e.g. held order keyed in again with no quantity changes).
  var skipStock = param.skipStockDeduction === true || param.deductStock === false || param.keepStock === true;
  var deltaDeduct = param.deltaRowsToDeduct;
  var deltaReplenish = param.deltaRowsToReplenish;

  if (skipStock) {
    // Inventory already deducted/reserved; no changes to raw sheet stock
  } else if ((deltaDeduct && deltaDeduct.length > 0) || (deltaReplenish && deltaReplenish.length > 0)) {
    if (deltaDeduct && deltaDeduct.length > 0) {
      deductInventoryFromRaw(ss, deltaDeduct);
    }
    if (deltaReplenish && deltaReplenish.length > 0) {
      replenishInventoryInRaw(ss, deltaReplenish);
    }
  } else {
    // Standard initial key-in: deduct full order quantity from 'raw' sheet
    deductInventoryFromRaw(ss, rows);
  }

  SpreadsheetApp.flush();
  return {
    status: 'success',
    message: 'Trade log written and stock updated in ' + targetSheetName
  };
}

/**
 * Handle Delete Order & Replenish Stock.
 * GUARANTEE: Restores inventory strictly ONCE (no doubling).
 */
function handleDeleteOrder(param) {
  var rowValuesToReplenish = param.rows;
  var targetOrderIds = {};
  if (param.orderId) targetOrderIds[param.orderId.toString().trim()] = true;
  if (param.orderIds && Array.isArray(param.orderIds)) {
    param.orderIds.forEach(function(id) {
      if (id) targetOrderIds[id.toString().trim()] = true;
    });
  }
  var orderIdList = Object.keys(targetOrderIds);
  var orderId = orderIdList.length > 0 ? orderIdList[0] : null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheets = getUniqueTradeLogSheets(ss);

  // If keepStock or skipStockReplenish is true, inventory in 'raw' sheet is kept unchanged
  var shouldReplenishStock = !param.keepStock && !param.skipStockReplenish && param.replenishStock !== false;

  // If trade rows to replenish were not explicitly provided, extract them from the sheets before deleting
  if (shouldReplenishStock && orderIdList.length > 0 && (!rowValuesToReplenish || rowValuesToReplenish.length === 0)) {
    rowValuesToReplenish = [];
    logSheets.forEach(function(s) {
      var lRow = s.getLastRow();
      if (lRow > 1) {
        var vals = s.getRange(1, 1, lRow, 14).getValues();
        for (var r = 1; r < lRow; r++) {
          var rowOrderId = (vals[r][12] || '').toString().trim();
          if (rowOrderId && targetOrderIds[rowOrderId]) {
            rowValuesToReplenish.push(vals[r]);
          }
        }
      }
    });
  }

  // Replenish stock in 'raw' sheet strictly ONCE
  if (shouldReplenishStock && rowValuesToReplenish && rowValuesToReplenish.length > 0) {
    replenishInventoryInRaw(ss, rowValuesToReplenish);
  }

  // Delete order rows from all unique log sheets
  var deletedCount = 0;
  if (orderIdList.length > 0) {
    logSheets.forEach(function(s) {
      var lastRow = s.getLastRow();
      if (lastRow > 1) {
        var colMValues = s.getRange(2, 13, lastRow - 1, 1).getValues();
        for (var r = lastRow; r >= 2; r--) {
          var cellValue = (colMValues[r - 2][0] || '').toString().trim();
          if (cellValue && targetOrderIds[cellValue]) {
            s.deleteRow(r);
            deletedCount++;
          }
        }
      }
    });
  }

  SpreadsheetApp.flush();
  return {
    status: 'success',
    message: 'Order rows processed and deleted successfully (deleted ' + deletedCount + ' rows)'
  };
}

/**
 * Handle Revert Stock for Orders.
 * Used by external apps or automations to replenish stock for orders.
 */
function handleRevertStockForOrders(orderIds) {
  if (!orderIds || (Array.isArray(orderIds) && orderIds.length === 0)) {
    return { status: 'error', message: 'No order IDs provided' };
  }

  if (!Array.isArray(orderIds)) {
    orderIds = [orderIds.toString().trim()];
  }

  var idMap = {};
  orderIds.forEach(function(id) {
    if (id) idMap[id.toString().trim()] = true;
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheets = getUniqueTradeLogSheets(ss);
  var rowsToReplenish = [];

  logSheets.forEach(function(s) {
    var lRow = s.getLastRow();
    if (lRow > 1) {
      var vals = s.getRange(1, 1, lRow, 14).getValues();
      for (var r = 1; r < lRow; r++) {
        var rowOrderId = (vals[r][12] || '').toString().trim();
        if (rowOrderId && idMap[rowOrderId]) {
          rowsToReplenish.push(vals[r]);
        }
      }
    }
  });

  if (rowsToReplenish.length > 0) {
    replenishInventoryInRaw(ss, rowsToReplenish);
  }

  SpreadsheetApp.flush();
  return {
    status: 'success',
    message: 'Reverted stock for ' + rowsToReplenish.length + ' order items'
  };
}

/**
 * Deduct inventory quantities from 'raw' sheet based on trade log rows.
 * Explicitly targets Col AC (header as 'Stock', column 29) of 'raw' tab.
 */
function deductInventoryFromRaw(ss, rows) {
  var rawSheet = ss.getSheetByName('raw');
  if (!rawSheet || !rows || rows.length === 0) return;

  var rawValues = rawSheet.getDataRange().getValues();
  var headers = findRawSheetHeaders(rawValues);

  // Guarantee Col AC (1-based column 29, 0-indexed 28)
  var stockColIndex = headers.stockIdx !== undefined ? headers.stockIdx : 28;

  var prodToIndex = {};
  var prodIdToIndex = {};
  for (var rIdx = headers.headerRowIdx + 1; rIdx < rawValues.length; rIdx++) {
    var pName = rawValues[rIdx][headers.titleIdx];
    if (pName && pName.toString().trim()) {
      var tName = pName.toString().trim();
      prodToIndex[tName] = rIdx;
      prodToIndex[tName.toLowerCase()] = rIdx;
      prodToIndex[tName.replace(/[\s\u3000]/g, '').toLowerCase()] = rIdx;
      prodToIndex[tName.replace(/[（(]/g, '(').replace(/[）)]/g, ')').toLowerCase()] = rIdx;
    }
    var pId = rawValues[rIdx][headers.productIdIdx];
    if (pId && pId.toString().trim()) {
      var tId = pId.toString().trim();
      prodIdToIndex[tId] = rIdx;
      prodIdToIndex[tId.toLowerCase()] = rIdx;
      prodIdToIndex[tId.replace(/^id-/, '')] = rIdx;
    }
  }

  for (var i = 0; i < rows.length; i++) {
    var incomingRow = rows[i];
    if (incomingRow.length < 6) continue;
    var incomingProdName = (incomingRow[1] || '').toString().trim();
    var incomingProdId = (incomingRow[2] || '').toString().trim();
    var colD = incomingRow[3];
    var colF = incomingRow[5];

    var soldQty = safeParseNumber(colD) * safeParseNumber(colF);
    if ((incomingProdName || incomingProdId) && soldQty > 0) {
      var targetIndex = prodToIndex[incomingProdName];
      if (targetIndex === undefined && incomingProdName) {
        targetIndex = prodToIndex[incomingProdName.toLowerCase()];
      }
      if (targetIndex === undefined && incomingProdName) {
        targetIndex = prodToIndex[incomingProdName.replace(/[\s\u3000]/g, '').toLowerCase()];
      }
      if (targetIndex === undefined && incomingProdName) {
        targetIndex = prodToIndex[incomingProdName.replace(/[（(]/g, '(').replace(/[）)]/g, ')').toLowerCase()];
      }
      if (targetIndex === undefined && incomingProdId) {
        targetIndex = prodIdToIndex[incomingProdId] !== undefined
          ? prodIdToIndex[incomingProdId]
          : prodIdToIndex[incomingProdId.replace(/^id-/, '')];
      }
      if (targetIndex !== undefined) {
        var rawRow = rawValues[targetIndex];
        var isUnlimited = rawRow[headers.unlimitedIdx] !== undefined &&
                          rawRow[headers.unlimitedIdx] !== null &&
                          rawRow[headers.unlimitedIdx].toString().trim() === '1';

        var currentStockVal = rawRow[stockColIndex];
        var hasNumericStock = currentStockVal !== '' && currentStockVal !== undefined && currentStockVal !== null && !isNaN(parseFloat(currentStockVal));
        if (!isUnlimited || hasNumericStock) {
          var currentStock = safeParseNumber(currentStockVal);
          var newStock = currentStock - soldQty;
          rawValues[targetIndex][stockColIndex] = newStock;
          // Col AC is Column 29 (1-based: stockColIndex + 1)
          rawSheet.getRange(targetIndex + 1, stockColIndex + 1).setValue(newStock);
        }
      }
    }
  }
  SpreadsheetApp.flush();
}

/**
 * Replenish inventory quantities to 'raw' sheet based on deleted/reverted rows.
 * Explicitly targets Col AC (header as 'Stock', column 29) of 'raw' tab.
 */
function replenishInventoryInRaw(ss, rows) {
  var rawSheet = ss.getSheetByName('raw');
  if (!rawSheet || !rows || rows.length === 0) return;

  var rawValues = rawSheet.getDataRange().getValues();
  var headers = findRawSheetHeaders(rawValues);

  // Guarantee Col AC (1-based column 29, 0-indexed 28)
  var stockColIndex = headers.stockIdx !== undefined ? headers.stockIdx : 28;

  var prodToIndex = {};
  var prodIdToIndex = {};
  for (var rIdx = headers.headerRowIdx + 1; rIdx < rawValues.length; rIdx++) {
    var pName = rawValues[rIdx][headers.titleIdx];
    if (pName && pName.toString().trim()) {
      var tName = pName.toString().trim();
      prodToIndex[tName] = rIdx;
      prodToIndex[tName.toLowerCase()] = rIdx;
      prodToIndex[tName.replace(/[\s\u3000]/g, '').toLowerCase()] = rIdx;
      prodToIndex[tName.replace(/[（(]/g, '(').replace(/[）)]/g, ')').toLowerCase()] = rIdx;
    }
    var pId = rawValues[rIdx][headers.productIdIdx];
    if (pId && pId.toString().trim()) {
      var tId = pId.toString().trim();
      prodIdToIndex[tId] = rIdx;
      prodIdToIndex[tId.toLowerCase()] = rIdx;
      prodIdToIndex[tId.replace(/^id-/, '')] = rIdx;
    }
  }

  for (var i = 0; i < rows.length; i++) {
    var deletedRow = rows[i];
    if (deletedRow.length < 6) continue;
    var pName = (deletedRow[1] || '').toString().trim();
    var pId = (deletedRow[2] || '').toString().trim();
    var colD = deletedRow[3];
    var colF = deletedRow[5];

    var returnQty = safeParseNumber(colD) * safeParseNumber(colF);
    if ((pName || pId) && returnQty > 0) {
      var targetIndex = prodToIndex[pName];
      if (targetIndex === undefined && pName) {
        targetIndex = prodToIndex[pName.toLowerCase()];
      }
      if (targetIndex === undefined && pName) {
        targetIndex = prodToIndex[pName.replace(/[\s\u3000]/g, '').toLowerCase()];
      }
      if (targetIndex === undefined && pName) {
        targetIndex = prodToIndex[pName.replace(/[（(]/g, '(').replace(/[）)]/g, ')').toLowerCase()];
      }
      if (targetIndex === undefined && pId) {
        targetIndex = prodIdToIndex[pId] !== undefined
          ? prodIdToIndex[pId]
          : prodIdToIndex[pId.replace(/^id-/, '')];
      }
      if (targetIndex !== undefined) {
        var rawRow = rawValues[targetIndex];
        var isUnlimited = rawRow[headers.unlimitedIdx] !== undefined &&
                          rawRow[headers.unlimitedIdx] !== null &&
                          rawRow[headers.unlimitedIdx].toString().trim() === '1';

        var currentStockVal = rawRow[stockColIndex];
        var hasNumericStock = currentStockVal !== '' && currentStockVal !== undefined && currentStockVal !== null && !isNaN(parseFloat(currentStockVal));
        if (!isUnlimited || hasNumericStock) {
          var currentStock = safeParseNumber(currentStockVal);
          var newStock = currentStock + returnQty;
          rawValues[targetIndex][stockColIndex] = newStock;
          // Col AC is Column 29 (1-based: stockColIndex + 1)
          rawSheet.getRange(targetIndex + 1, stockColIndex + 1).setValue(newStock);
        }
      }
    }
  }
  SpreadsheetApp.flush();
}

/**
 * Locate header column indices in 'raw' sheet dynamically with robust fallbacks.
 * Specifically guarantees Col AC (0-indexed 28, column 29) with header 'Stock'.
 */
function findRawSheetHeaders(rawValues) {
  var headerRowIdx = 0;
  var titleIdx = 2; // Default Col C
  var productIdIdx = 1; // Default Col B
  var unlimitedIdx = 27; // Default Col AB (Column 28)
  var stockIdx = 28; // Default Col AC (Column 29, header 'Stock')

  for (var i = 0; i < Math.min(rawValues.length, 10); i++) {
    var row = rawValues[i];
    var isHeaderRow = false;
    for (var j = 0; j < row.length; j++) {
      var cell = (row[j] || '').toString().toLowerCase().trim();
      var normed = cell.replace(/[\s_-]/g, '');
      if (cell === 'title' || normed === 'productid' || normed === 'stock' || cell === 'sku') {
        isHeaderRow = true;
        break;
      }
    }
    if (isHeaderRow) {
      headerRowIdx = i;
      for (var j = 0; j < row.length; j++) {
        var cellStr = (row[j] || '').toString().toLowerCase().trim();
        var normed = cellStr.replace(/[\s_-]/g, '');
        if (cellStr === 'title' || cellStr === 'name' || cellStr === '貨品名稱' || cellStr === '產品名稱') titleIdx = j;
        else if (normed === 'productid' || cellStr === 'product id' || normed === 'sku') productIdIdx = j;
        else if (normed === 'unlimitedstock' || normed.indexOf('unlimitedstock') !== -1) unlimitedIdx = j;
        else if (normed === 'stock' || cellStr === 'stock') stockIdx = j;
      }
      // If Col AC (0-indexed 28, Column 29) header contains 'stock', strictly lock stockIdx to 28
      if (row.length > 28) {
        var colACCell = (row[28] || '').toString().toLowerCase().trim().replace(/[\s_-]/g, '');
        if (colACCell === 'stock') {
          stockIdx = 28;
        }
      }
      break;
    }
  }

  return {
    headerRowIdx: headerRowIdx,
    titleIdx: titleIdx,
    productIdIdx: productIdIdx,
    unlimitedIdx: unlimitedIdx,
    stockIdx: stockIdx
  };
}

/**
 * Handle Get Customers for GET requests.
 */
function handleGetCustomers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getCustomerCatSheet(ss);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  var customers = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[0]) {
      customers.push({
        name: row[0].toString().trim(),
        sales: (row[1] || "").toString().trim(),
        user: (row[1] || "").toString().trim(),
        grade: (row[2] || "").toString().trim(),
        district: (row[3] || "").toString().trim()
      });
    }
  }
  return customers;
}

/**
 * Handle Get Products for GET requests.
 */
function handleGetProducts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('raw');
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];

  var values = sheet.getDataRange().getValues();
  var headerRowIdx = 0;
  var titleIdx = 2; // Col C
  var productIdIdx = 1; // Col B
  var goldIdx = 17; // Col R
  var silverIdx = 18; // Col S
  var basicIdx = 19; // Col T
  var priceIdx = 14; // Col O
  var unlimitedIdx = 27; // Col AB
  var stockIdx = 28; // Col AC
  var categoriesIdx = 12; // Col M

  for (var i = 0; i < Math.min(values.length, 10); i++) {
    var row = values[i];
    var foundIdx = -1;
    for (var j = 0; j < row.length; j++) {
      if (row[j] && row[j].toString().toLowerCase().trim() === 'title') {
        foundIdx = j;
        break;
      }
    }
    if (foundIdx !== -1) {
      headerRowIdx = i;
      titleIdx = foundIdx;
      for (var j = 0; j < row.length; j++) {
        var cellStr = (row[j] || '').toString().toLowerCase().trim();
        var normed = cellStr.replace(/[\s_-]/g, '');
        if (normed === 'productid' || cellStr === 'product id' || normed === 'sku') productIdIdx = j;
        else if (cellStr.indexOf('gold') !== -1 || cellStr.indexOf('a價') !== -1 || cellStr === 'a' || cellStr === 'a價') goldIdx = j;
        else if (cellStr.indexOf('silver') !== -1 || cellStr.indexOf('b價') !== -1 || cellStr === 'b' || cellStr === 'b價') silverIdx = j;
        else if (cellStr.indexOf('basic') !== -1 || cellStr.indexOf('c價') !== -1 || cellStr === 'c' || cellStr === 'c價') basicIdx = j;
        else if (normed === 'price') priceIdx = j;
        else if (normed.indexOf('unlimitedstock') !== -1) unlimitedIdx = j;
        else if (normed === 'stock' || cellStr.indexOf('庫存') !== -1) stockIdx = j;
        else if (cellStr === 'categories' || cellStr === 'category' || cellStr.indexOf('分類') !== -1 || cellStr.indexOf('類別') !== -1) categoriesIdx = j;
      }
      break;
    }
  }

  var productsList = [];
  for (var rowIdx = headerRowIdx + 1; rowIdx < values.length; rowIdx++) {
    var row = values[rowIdx];
    var name = (row[titleIdx] || "").toString().trim();
    var sku = (row[productIdIdx] || row[1] || "").toString().trim();
    var id = sku || ("row-" + rowIdx);

    if (name) {
      var basePrice = safeParsePrice(row[priceIdx]);
      if (isNaN(basePrice)) basePrice = 0;

      var pA = safeParsePrice(row[goldIdx]);
      var pB = safeParsePrice(row[silverIdx]);
      var pC = safeParsePrice(row[basicIdx]);

      var priceA = !isNaN(pA) ? pA : basePrice;
      var priceB = !isNaN(pB) ? pB : basePrice;
      var priceC = !isNaN(pC) ? pC : basePrice;

      var alwaysStock = true;
      if (row[unlimitedIdx] !== undefined && row[unlimitedIdx] !== null) {
        alwaysStock = row[unlimitedIdx].toString().trim() === "1";
      }

      var sVal = 0;
      var secondaryStockCount = "";
      if (!alwaysStock) {
        sVal = safeParseNumber(row[stockIdx]);
        secondaryStockCount = sVal.toString();
      }

      var merchantRemark = row[29] || "";
      var categoryVal = (row[categoriesIdx] || row[12] || "").toString().trim();

      productsList.push({
        id: id,
        name: name,
        price: basePrice,
        priceA: priceA,
        priceB: priceB,
        priceC: priceC,
        prices: {
          A: priceA,
          B: priceB,
          C: priceC
        },
        unlimitedStock: alwaysStock,
        stock: !alwaysStock ? sVal : undefined,
        hasStock: true,
        alwaysStock: alwaysStock,
        secondaryStockCount: secondaryStockCount,
        extraAttributes: {
          "Categories": categoryVal || "Google Sheet Sync",
          "Merchant Remark": merchantRemark,
          "remarks": merchantRemark
        },
        category: categoryVal,
        categories: categoryVal,
        allValues: row.map(function(cell) { return cell.toString(); })
      });
    }
  }

  return productsList;
}

// ==========================================
// 5. Global Functions (Direct Apps Script Calls)
// ==========================================
// These allow external Apps Script files, triggers, or custom Google Sheets UI
// to invoke functions directly in Apps Script without going through HTTP.

function updateGrades(grades) {
  return handleUpdateGrades(grades);
}

function revertStockForOrders(orderIds) {
  return handleRevertStockForOrders(orderIds);
}

function deleteOrder(orderId, rows) {
  return handleDeleteOrder({ orderId: orderId, rows: rows });
}

function writeTradeLog(rows, targetSheet, isAdmin) {
  return handleWriteTradeLog({ rows: rows, targetSheet: targetSheet, isAdmin: isAdmin });
}

function addProduct(param) {
  return handleAddOrUpdateProduct(param);
}

function addCustomer(param) {
  return handleAddCustomer(param);
}

function getProducts() {
  return handleGetProducts();
}

function getCustomers() {
  return handleGetCustomers();
}
