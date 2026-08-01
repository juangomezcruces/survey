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

/** Visiting the /exec URL in a browser gives you a quick health check. */
function doGet() {
  var sheet = getSheet();
  return json({ ok: true, rows: Math.max(0, sheet.getLastRow() - 1) });
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
