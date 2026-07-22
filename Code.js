// ============================================================
// BFG Special Events — Apps Script Backend
// Deploy as Web App (Execute as: Me, Access: Anyone)
// ============================================================

var CONFIG = {
  AT_BASE:       'appnsTUTkpXhgycnG',
  AT_TOKEN:      PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN'),
  SE_TABLE:      'tblY9l3p3RB4JGxrg',   // Special Events
  AG_TABLE:      'tblcLSQQYNQt0UkG3',   // Special Events Agreements
  HOUSES_TABLE:  'tbl7Cbf4tX6BtF4WX',   // Houses
  LOGO_FILE_ID: '1Do6Ddj6E3dd5_TpiBRFrPLXXaAfmvcGq',
  EVENTS_FOLDER: '18jtYERlV2KhDzOBvPiUgRLA5TbpHJybI',
  CHRISTINA:     'cheers@bestfedgreeks.com',
  CHAT_WEBHOOK:  PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK'),
};

// ── Entry point ───────────────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var result = processSpecialEvent(data);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Main ──────────────────────────────────────────────────────
function processSpecialEvent(d) {
  Logger.log('Processing: ' + JSON.stringify(d));

  // 1. Look up House record ID
  var houseRecId = lookupHouseId(d.house);
  Logger.log('House record ID: ' + houseRecId);

  // 2. Check agreement status
  var agResult = checkAgreement(houseRecId, d.schoolYear, d.eventType);
  Logger.log('Agreement: ' + JSON.stringify(agResult));

  // 3. Create Google Doc
  var docResult = createEventDoc(d, agResult.status);
  Logger.log('Doc URL: ' + docResult.url);

  // 4. Write to Airtable
  addEventRecord(d, houseRecId, agResult.recordId, agResult.status, docResult.url);
  Logger.log('Airtable record written');

  // 5. Notifications
  try {
    sendChatNotification(d, agResult.status, docResult.url);
  } catch (e) {
    logDebugToDoc_(docResult.url, 'Chat notification EXCEPTION: ' + e.message);
  }

  return { success: true, docUrl: docResult.url, agreementStatus: agResult.status };
}

// ── Airtable helper ───────────────────────────────────────────
function atFetch(tableId, method, params, body) {
  method = method || 'GET';
  var url = 'https://api.airtable.com/v0/' + CONFIG.AT_BASE + '/' + tableId;
  if (params) url += '?' + params;
  var opts = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + CONFIG.AT_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  if (body) opts.payload = JSON.stringify(body);
  var res  = UrlFetchApp.fetch(url, opts);
  var text = res.getContentText();
  Logger.log('AT response (' + tableId + ' ' + method + '): ' + text.slice(0,300));
  return JSON.parse(text);
}

// ── Look up House record ID ───────────────────────────────────
function lookupHouseId(houseName) {
  if (!houseName) return null;
  var formula = encodeURIComponent(
    "AND({Name}='" + houseName.replace(/'/g, "\\'") + "',{Contract Status}='Active')"
  );
  var data = atFetch(CONFIG.HOUSES_TABLE, 'GET', 'filterByFormula=' + formula);
  if (data.records && data.records.length > 0) return data.records[0].id;
  Logger.log('No house found for: ' + houseName);
  return null;
}

// ── Check agreement status ────────────────────────────────────
var EVENT_TYPE_FIELD_MAP = {
  'Philanthropic': { included: 'Philanthropic Included', used: 'Philanthropic Used' },
  'Steak Dinner':  { included: 'Steak Dinner Included',  used: 'Steak Dinner Used' },
  'Special Event': { included: 'Special Event Included', used: 'Special Event Used' }
};

function checkAgreement(houseRecId, schoolYear, eventType) {
  if (!houseRecId) return { status: 'Extra Billable', recordId: null };

  var houseFormula = encodeURIComponent("RECORD_ID()='" + houseRecId + "'");
  var houseData = atFetch(CONFIG.HOUSES_TABLE, 'GET', 'filterByFormula=' + houseFormula);
  var houseName = houseData && houseData.records && houseData.records[0] ? houseData.records[0].fields['Name'] : null;
  if (!houseName) return { status: 'Extra Billable', recordId: null };

  var formula = encodeURIComponent(
    "AND(FIND('" + houseName + "',ARRAYJOIN({House},',')),{School Year}='" + schoolYear + "')"
  );
  var data = atFetch(CONFIG.AG_TABLE, 'GET', 'filterByFormula=' + formula);

  if (!data.records || data.records.length === 0) {
    return { status: 'Extra Billable', recordId: null };
  }

  var rec = data.records[0];

  // "Other" (and anything not in the map) has no pre-set entitlement —
  // always billable.
  var typeFields = EVENT_TYPE_FIELD_MAP[eventType];
  if (!typeFields) {
    Logger.log('No entitlement bucket for event type "' + eventType + '" — Extra Billable');
    return { status: 'Extra Billable', recordId: rec.id };
  }

  var included = rec.fields[typeFields.included] || 0;
  var used     = rec.fields[typeFields.used] || 0;
  var status   = (used < included) ? 'In Agreement' : 'Extra Billable';
  Logger.log('Agreement (' + eventType + '): included=' + included + ' used=' + used + ' status=' + status);
  return { status: status, recordId: rec.id };
}

// ── Write Special Events record ───────────────────────────────
function addEventRecord(d, houseRecId, agRecId, agreementStatus, docUrl) {
  var fields = {
    'Event Name':      d.eventName      || '',
    'Event Type':      d.eventType      || '',
    'Event Date':      d.eventDate      || '',
    'Submission Date': new Date().toISOString().slice(0,10),
    'School Year':     d.schoolYear     || '',
    'Status':          'Received',
    'Doc Link':        docUrl           || ''
  };
  if (agreementStatus === 'In Agreement' || agreementStatus === 'Extra Billable') {
    fields['In-Agreement?'] = agreementStatus;
  }
  if (houseRecId) fields['House']     = [houseRecId];
  if (agRecId)    fields['Agreement'] = [agRecId];

var result;
  try {
    result = atFetch(CONFIG.SE_TABLE, 'POST', null, { fields: fields });
  } catch (err) {
    throw err;
  }

  if (!result.id) {
    throw new Error('Airtable write failed: ' + JSON.stringify(result));
  }
  Logger.log('SE record created: ' + result.id);
}

function logDebugToDoc_(docUrl, message) {
  try {
    if (!docUrl) return;
    var doc = DocumentApp.openByUrl(docUrl);
    var body = doc.getBody();
    body.appendParagraph('--- DEBUG ---');
    body.appendParagraph(message);
    doc.saveAndClose();
  } catch (e) {
    // last resort, nothing else we can do
  }
}

// ── Create Google Doc ─────────────────────────────────────────
function createEventDoc(d, agreementStatus) {
  var title = d.house + ' \u2014 ' + (d.eventType || 'Special Event') + ' \u2014 ' + d.eventDate;
  var doc   = DocumentApp.create(title);
  var body  = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(54).setMarginRight(54);

// Logo
  try {
    var logoBlob = DriveApp.getFileById(CONFIG.LOGO_FILE_ID).getBlob();
    var logoPara = body.appendParagraph('');
    logoPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    logoPara.appendInlineImage(logoBlob).setWidth(360).setHeight(80);
  } catch(e) { Logger.log('Logo error: ' + e.message); }

  // Title block
  var titlePara = body.appendParagraph('Special Event Request');
  titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  titlePara.setSpacingBefore(16).setSpacingAfter(2);
  titlePara.editAsText().setForegroundColor('#1a1a1a').setBold(true).setFontSize(20);

  var subtitlePara = body.appendParagraph(d.house + '  \u00B7  ' + d.eventDate);
  subtitlePara.editAsText().setForegroundColor('#888888').setBold(false).setFontSize(11);
  subtitlePara.setSpacingAfter(4);

  var isInAgreement = (agreementStatus === 'In Agreement');
  var agColor = isInAgreement ? '#1A7F3C' : '#CC0000';
  var agPara = body.appendParagraph('Agreement Status:  ' + agreementStatus);
  agPara.setSpacingAfter(16);
  var agText = agPara.editAsText();
  agText.setFontSize(11).setBold(false).setForegroundColor('#000000');
  var labelLen = 'Agreement Status:  '.length;
  agText.setBold(labelLen, agPara.getText().length - 1, true);
  agText.setForegroundColor(labelLen, agPara.getText().length - 1, agColor);

  function section(title) {
    var p = body.appendParagraph(title.toUpperCase());
    p.setSpacingBefore(20).setSpacingAfter(6);
    p.editAsText().setForegroundColor('#c9a84c').setBold(true).setFontSize(9);
    body.appendParagraph('').setSpacingAfter(8);
  }

  function row(label, val) {
    if (!val || val === 'undefined' || val === 'null') val = '\u2014';
    var p = body.appendParagraph('');
    p.setSpacingBefore(0).setSpacingAfter(3);
    var t = p.editAsText();
    var text = label + '\t' + val;
    t.insertText(0, text);
    t.setFontSize(10).setForegroundColor('#000000').setBold(false);
    t.setBold(0, label.length - 1, true);
    t.setForegroundColor(0, label.length - 1, '#333333');
    t.setForegroundColor(label.length, text.length - 1, '#444444');
  }

  section('Event Details');
  row('Event Name',  d.eventName);
  row('Event Type',  d.eventType);
  row('House',       d.house);
  row('Date',        d.eventDate);
  row('Time',        d.eventTime);
  row('Location',    d.location);
  row('Guests',      d.numGuests);
  row('School Year', d.schoolYear);

  section('Contact Information');
  row('Event Contact',  d.eventContact);
  row('Phone',          d.contactPhone);
  row('Contact Email',  d.contactEmail);
  row('Invoice To',     d.invoiceTo);
  row('Chef Email',     d.chefEmail);
  row('Submitted By',   d.submittedBy);

  section('Budget');
  row('Food Budget',     d.foodBudget     ? '$' + d.foodBudget     : '\u2014');
  row('Estimated Total', d.estimatedTotal ? '$' + d.estimatedTotal : '\u2014');
  row('Overtime Hours',  d.overtimeHours);

  section('Event Planning');
  row('Menu',        d.menu);
  row('Dietary',     d.dietary);
  row('Equipment',   d.equipment);
  row('Responsible', d.responsible);
  row('Staffing',    d.staffing);
  row('Timeline',    d.timeline);

  if (d.additionalNotes && d.additionalNotes.trim()) {
    section('Additional Notes');
    var notesPara = body.appendParagraph(d.additionalNotes);
    notesPara.setSpacingBefore(0).setSpacingAfter(0);
    notesPara.editAsText().setForegroundColor('#444444').setBold(false).setFontSize(10);
  }

  body.appendParagraph('').setSpacingBefore(24);
  var footer = body.appendParagraph('Best Fed Greeks  \u00B7  cheers@bestfedgreeks.com  \u00B7  bestfedgreeks.com');
  footer.editAsText().setForegroundColor('#aaaaaa').setFontSize(8).setBold(false);
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  doc.saveAndClose();

  var file = DriveApp.getFileById(doc.getId());
  DriveApp.getFolderById(CONFIG.EVENTS_FOLDER).addFile(file);
  try { DriveApp.getRootFolder().removeFile(file); } catch(e) {}

  if (d.chefEmail)   file.addEditor(d.chefEmail);
  if (d.submittedBy) file.addEditor(d.submittedBy);
  file.addEditor(CONFIG.CHRISTINA);

  return { url: doc.getUrl(), id: doc.getId() };
}

// ── Chat notification ─────────────────────────────────────────
function sendChatNotification(d, agreementStatus, docUrl) {
  var emoji = agreementStatus === 'Extra Billable' ? '🔴' : '🟢';
  var text  = [
    '📋 *New Special Event Submitted*',
    emoji + ' *' + agreementStatus + '*',
    '',
    '*' + d.eventName + '*',
    d.house + ' · ' + d.eventDate + ' at ' + d.eventTime,
    d.location + ' · ' + d.numGuests + ' guests',
    'School Year: ' + d.schoolYear,
    '',
    'Chef: ' + (d.chefEmail   || '—'),
    'Submitted by: ' + (d.submittedBy || '—'),
    '',
    docUrl
  ].join('\n');

  try {
    UrlFetchApp.fetch(CONFIG.CHAT_WEBHOOK, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch(e) {
    Logger.log('Chat error: ' + e.message);
  }
}
