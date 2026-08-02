/**
 * Google Apps Script receiver for the survey app.
 *
 * Paste this into Extensions -> Apps Script inside the Google Sheet that
 * should collect the answers, then Deploy -> New deployment -> Web app,
 * with "Execute as: Me" and "Who has access: Anyone".
 *
 * Copy the /exec URL it gives you into the survey JSON, under
 *   "submit": { "endpoint": "https://script.google.com/.../exec" }
 *
 * One spreadsheet row per rated passage. The header row is written the
 * first time data arrives, from the keys the app sends, so you do not
 * have to keep the two in sync by hand.
 */

var SHEET_NAME = 'responses';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // concurrent respondents must not interleave writes
  try {
    var payload = JSON.parse(e.postData.contents);
    var rows = payload.rows || [];
    if (!rows.length) return json({ ok: false, error: 'no rows' });

    var sheet = getSheet();
    var header = readHeader(sheet, rows[0]);

    var values = rows.map(function (row) {
      return header.map(function (key) {
        var v = row[key];
        return v === undefined || v === null ? '' : v;
      });
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, header.length).setValues(values);
    return json({ ok: true, written: values.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Visiting the /exec URL in a browser gives you a quick health check.
 *
 * With ?counts=1&survey=<id> it instead returns how many times each text
 * has been rated so far. The survey uses that to hand each respondent the
 * least-rated passages, so coverage stays even instead of drifting.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};

  if (params.counts) {
    return json({ ok: true, counts: itemCounts(params.survey || '') });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return json({
    ok: true,
    rows: Math.max(0, getSheet().getLastRow() - 1),
    spreadsheet: ss.getName(),
    url: ss.getUrl()
  });
}

/** { item_uid: times rated }, optionally limited to one survey. */
function itemCounts(surveyId) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  var counts = {};
  if (lastRow < 2) return counts;

  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var uidCol = header.indexOf('item_uid') + 1;
  if (!uidCol) return counts;
  var surveyCol = header.indexOf('survey_id') + 1;

  var n = lastRow - 1;
  var uids = sheet.getRange(2, uidCol, n, 1).getValues();
  var surveys = surveyCol ? sheet.getRange(2, surveyCol, n, 1).getValues() : null;

  for (var i = 0; i < n; i++) {
    if (surveyId && surveys && surveys[i][0] !== surveyId) continue;
    var uid = uids[i][0];
    if (uid) counts[uid] = (counts[uid] || 0) + 1;
  }
  return counts;
}

/**
 * Lost the spreadsheet? Select this function in the editor's toolbar,
 * press Run, and its URL is printed in the execution log. No redeploy
 * needed — Run uses the code in the editor, not the deployed version.
 */
function whereIsMySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Name: ' + ss.getName());
  Logger.log('URL:  ' + ss.getUrl());
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

/**
 * Returns the column order. Writes a header row on an empty sheet, and
 * appends any new columns the app has started sending.
 */
function readHeader(sheet, sampleRow) {
  var keys = Object.keys(sampleRow);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, keys.length).setValues([keys]);
    sheet.getRange(1, 1, 1, keys.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return keys;
  }

  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .filter(function (h) { return h !== ''; });

  var added = keys.filter(function (k) { return header.indexOf(k) === -1; });
  if (added.length) {
    sheet.getRange(1, header.length + 1, 1, added.length).setValues([added]);
    header = header.concat(added);
  }
  return header;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
