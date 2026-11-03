/**
 * เว็บแอพสืบสวนติดตามและขยายผล
 * กองร้อยตำรวจตระเวนชายแดนที่ 244
 *
 * เซิร์ฟเวอร์ Apps Script
 * - รหัสหน่วยอยู่ใน Script Properties เท่านั้น (แฮช) ไม่ใส่ในโค้ดไคลเอนต์
 * - ห้ามเปิดสเปรดชีตแดชบอร์ดเดิม
 * - งานเขียนใช้ LockService
 * - ไม่แชร์ไฟล์ออกนอกบัญชีเจ้าของ
 */
var Api = (function () {
  'use strict';

  var COLS = {
    cases: ['id', 'name', 'detail', 'status', 'nextStep', 'arrestRecordUrl', 'createdAt', 'createdById', 'createdByName', 'closedAt', 'driveFolderId', 'ext'],
    entries: ['id', 'caseId', 'entryDate', 'eventTime', 'text', 'stage', 'phones', 'plates', 'people', 'photoIds', 'authorId', 'authorName', 'createdAt'],
    targets: ['id', 'caseId', 'name', 'nickname', 'nationalId', 'birthDate', 'address', 'phones', 'roleNotes', 'photoId', 'createdAt', 'createdByName', 'driveFolderId', 'outcome', 'outcomeDate', 'outcomeNote', 'ext'],
    users: ['id', 'name', 'role', 'active'],
    log: ['id', 'at', 'userId', 'userName', 'action', 'detail']
  };

  var SESSION_TTL_MS = 12 * 60 * 60 * 1000;

  function props() {
    return PropertiesService.getScriptProperties();
  }

  function nowIso() {
    return Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss") + '+07:00';
  }

  function newId(prefix) {
    return prefix + '-' + Utilities.getUuid().slice(0, 8);
  }

  function assertEditor(onceKey) {
    var email = '';
    try {
      email = Session.getActiveUser().getEmail() || '';
    } catch (err) {
      email = '';
    }
    if (email) return email;
    // บัญชี Gmail ส่วนตัวอาจไม่คืนอีเมล: อนุญาตครั้งเดียวเมื่อมีคีย์ใน Script Properties (ใส่ได้เฉพาะเจ้าของ)
    if (onceKey && props().getProperty(onceKey)) return Session.getEffectiveUser().getEmail() || 'owner';
    throw new Error('คำสั่งนี้ใช้ได้เฉพาะจากตัวแก้ไขสคริปต์ โดยบัญชีเจ้าของโปรเจกต์');
  }

  function withLock(fn) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('มีคนกำลังบันทึกอยู่ ลองอีกครั้งในอีกครู่');
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  var dbMemo_ = null;
  function openDb() {
    if (dbMemo_) return dbMemo_;
    var id = CaseLogic.assertSpreadsheetAllowed(props().getProperty('SPREADSHEET_ID'));
    dbMemo_ = SpreadsheetApp.openById(id);
    return dbMemo_;
  }

  function safeText(value) {
    var s = value == null ? '' : String(value);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  }

  function cellString(value) {
    if (value instanceof Date && value.getFullYear() < 1900) return Utilities.formatDate(value, 'Asia/Bangkok', 'HH:mm');
    if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss") + '+07:00';
    if (value == null) return '';
    return String(value);
  }

  function readTable(name) {
    var sh = openDb().getSheetByName(name);
    if (!sh) throw new Error('ไม่พบแท็บ ' + name);
    var values = sh.getDataRange().getValues();
    if (!values.length) return [];
    var headers = values[0].map(function (header) { return String(header); });
    var rows = [];
    var r;
    for (r = 1; r < values.length; r += 1) {
      if (values[r][0] === '' || values[r][0] == null) continue;
      var obj = {};
      headers.forEach(function (header, index) {
        if (!header) return;
        obj[header] = cellString(values[r][index]);
      });
      rows.push(obj);
    }
    return rows;
  }

  function append(name, obj) {
    var cols = COLS[name];
    var sh = openDb().getSheetByName(name);
    var row = cols.map(function (key) {
      return safeText(obj[key]);
    });
    var at = sh.getLastRow() + 1;
    sh.getRange(at, 1, 1, cols.length).setNumberFormat('@').setValues([row]);
  }

  function update(name, id, patch) {
    var sh = openDb().getSheetByName(name);
    var cols = COLS[name];
    var values = sh.getDataRange().getValues();
    var r;
    for (r = 1; r < values.length; r += 1) {
      if (String(values[r][0]) !== String(id)) continue;
      Object.keys(patch).forEach(function (key) {
        var col = cols.indexOf(key);
        if (col < 0) return;
        sh.getRange(r + 1, col + 1).setNumberFormat('@').setValue(safeText(patch[key]));
      });
      return;
    }
    throw new Error('ไม่พบรายการ');
  }

  function ensureTabs(ss) {
    CaseLogic.SHEET_TABS.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) sh = ss.insertSheet(name);
      var cols = COLS[name];
      if (sh.getMaxColumns() < cols.length) {
        sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
      }
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, Math.min(sh.getMaxRows(), 500), cols.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#1b281c').setFontColor('#f3c663');
    });
    var leftover = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
    if (leftover && ss.getSheets().length > 1) ss.deleteSheet(leftover);
  }

  function seedUsers() {
    if (readTable('users').length) return;
    SampleData.users.forEach(function (user) { append('users', user); });
  }

  function ensureRoster() {
    var plan = CaseLogic.planRoster(readTable('users'), SampleData.roster, SampleData.placeholderUserIds);
    plan.append.forEach(function (person) { append('users', person); });
    plan.deactivate.forEach(function (id) { update('users', id, { active: '0' }); });
    (plan.rename || []).forEach(function (r) { update('users', r.id, { name: r.name }); });
  }

  function setup() {
    assertEditor('APP_PASSWORD');
    var bag = props();
    var existing = bag.getProperty('SPREADSHEET_ID');
    if (existing) CaseLogic.assertSpreadsheetAllowed(existing);
    var ss = existing ? SpreadsheetApp.openById(existing) : SpreadsheetApp.create(CaseLogic.APP_NAME);
    CaseLogic.assertSpreadsheetAllowed(ss.getId());
    if (!existing) bag.setProperty('SPREADSHEET_ID', ss.getId());
    ensureTabs(ss);

    var folderId = bag.getProperty('DRIVE_FOLDER_ID');
    if (!folderId) {
      var folder = DriveApp.createFolder(CaseLogic.APP_NAME);
      folderId = folder.getId();
      bag.setProperty('DRIVE_FOLDER_ID', folderId);
    }

    var plain = bag.getProperty('APP_PASSWORD');
    if (plain) {
      var salt = bag.getProperty('APP_PASSWORD_SALT') || Utilities.getUuid();
      bag.setProperty('APP_PASSWORD_SALT', salt);
      bag.setProperty('APP_PASSWORD_HASH', CaseLogic.hashPassword(plain, salt));
      bag.deleteProperty('APP_PASSWORD');
      bag.setProperty('SEED_ONCE', '1');
    } else if (!bag.getProperty('APP_PASSWORD_HASH') || !bag.getProperty('APP_PASSWORD_SALT')) {
      throw new Error('ตั้ง Script Property ชื่อ APP_PASSWORD ก่อนรัน setup() ระบบจะแฮชแล้วลบค่าเดิม');
    }
    if (!bag.getProperty('SESSION_SECRET')) {
      bag.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
    }
    seedUsers();
    return {
      appName: CaseLogic.APP_NAME,
      spreadsheetId: ss.getId(),
      folderId: folderId
    };
  }

  function seedSample() {
    var email = assertEditor('SEED_ONCE');
    props().deleteProperty('SEED_ONCE');
    return withLock(function () {
      var haveCases = {};
      var haveEntries = {};
      var haveTargets = {};
      readTable('cases').forEach(function (row) { haveCases[row.id] = true; });
      readTable('entries').forEach(function (row) { haveEntries[row.id] = true; });
      readTable('targets').forEach(function (row) { haveTargets[row.id] = true; });
      var added = 0;
      SampleData.cases.forEach(function (row) {
        if (haveCases[row.id]) return;
        append('cases', row);
        added += 1;
      });
      SampleData.entries.forEach(function (row) {
        if (haveEntries[row.id]) return;
        append('entries', {
          id: row.id,
          caseId: row.caseId,
          entryDate: row.entryDate,
          eventTime: row.eventTime || '',
          text: row.text,
          stage: row.stage,
          phones: row.phones || '',
          plates: row.plates || '',
          people: row.people || '',
          photoIds: '',
          authorId: row.authorId,
          authorName: row.authorName,
          createdAt: row.createdAt
        });
      });
      SampleData.targets.forEach(function (row) {
        if (haveTargets[row.id]) return;
        append('targets', {
          id: row.id,
          caseId: row.caseId,
          name: row.name,
          nickname: row.nickname || '',
          nationalId: row.nationalId || '',
          birthDate: row.birthDate || '',
          address: row.address || '',
          phones: row.phones || '',
          roleNotes: row.roleNotes || '',
          photoId: '',
          createdAt: row.createdAt,
          createdByName: row.createdByName || ''
        });
      });
      append('log', {
        id: newId('log'),
        at: nowIso(),
        userId: '',
        userName: email,
        action: 'seed-sample',
        detail: 'เพิ่มเคสตัวอย่าง ' + added + ' รายการ'
      });
      return { addedCases: added, appName: CaseLogic.APP_NAME };
    });
  }

  function isActive(user) {
    var flag = String(user && user.active != null ? user.active : '').trim().toLowerCase();
    if (!flag) return true;
    return flag !== '0' && flag !== 'false' && flag !== 'inactive' && flag !== 'ไม่ใช้งาน';
  }

  function listedUsers() {
    return readTable('users').filter(function (user) {
      return isActive(user) && String(user.name || '').trim();
    }).map(function (user) {
      var id = String(user.id || '').trim();
      var name = String(user.name || '').trim();
      return { id: id || name, name: name };
    });
  }

  function findListedUser(userId) {
    var key = String(userId || '').trim();
    return readTable('users').filter(function (row) {
      if (!isActive(row)) return false;
      var id = String(row.id || '').trim();
      var name = String(row.name || '').trim();
      return (id && id === key) || (!id && name === key);
    })[0];
  }

  function constantEqual(a, b) {
    var left = String(a || '');
    var right = String(b || '');
    if (left.length !== right.length) return false;
    var diff = 0;
    var i;
    for (i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return diff === 0;
  }

  function issueToken(user) {
    var secret = props().getProperty('SESSION_SECRET');
    if (!secret) throw new Error('ยังไม่ได้ตั้งค่าเซสชัน ให้ผู้ดูแลรัน setup()');
    var payload = CaseLogic.sessionPayload(user, Date.now(), SESSION_TTL_MS);
    var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
    var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret));
    return body + '.' + sig;
  }

  function readToken(token) {
    var raw = String(token || '');
    var parts = raw.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('กรุณาเข้าสู่ระบบ');
    var secret = props().getProperty('SESSION_SECRET') || '';
    var expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], secret));
    if (!constantEqual(parts[1], expected)) throw new Error('เซสชันไม่ถูกต้อง');
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8');
    var payload = JSON.parse(json);
    if (!CaseLogic.sessionValid(payload, Date.now())) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบ');
    return payload;
  }

  function requireUser(token) {
    var payload = readToken(token);
    if (String(payload.uid || '').indexOf('custom-') === 0) {
      return { id: payload.uid, name: payload.name, role: payload.role || 'officer' };
    }
    var user = readTable('users').filter(function (row) {
      return isActive(row) && row.id === payload.uid;
    })[0];
    if (!user) throw new Error('เซสชันไม่ถูกต้อง');
    return { id: user.id, name: user.name, role: user.role };
  }

  function requireBoss(user) {
    if (!user || user.role !== 'boss') throw new Error('เฉพาะผู้บังคับบัญชาที่ดาวน์โหลดรายงานได้');
  }

  function writeLog(user, action, detail) {
    append('log', {
      id: newId('log'),
      at: nowIso(),
      userId: user && user.id ? user.id : '',
      userName: user && user.name ? user.name : '',
      action: action,
      detail: String(detail || '').slice(0, 500)
    });
  }

  function collect() {
    return {
      cases: readTable('cases'),
      entries: readTable('entries'),
      targets: readTable('targets')
    };
  }

  function findCase(caseId) {
    var row = readTable('cases').filter(function (item) { return item.id === caseId; })[0];
    if (!row) throw new Error('ไม่พบเคส');
    return row;
  }

  function rootFolder() {
    var id = props().getProperty('DRIVE_FOLDER_ID');
    if (!id) throw new Error('ยังไม่มีโฟลเดอร์รูป ให้ผู้ดูแลรัน setup()');
    return DriveApp.getFolderById(id);
  }

  function caseFolder(caseRow) {
    if (caseRow.driveFolderId) {
      try {
        return DriveApp.getFolderById(caseRow.driveFolderId);
      } catch (err) {
        /* สร้างใหม่ถ้าโฟลเดอร์เดิมหาย */
      }
    }
    var folder;
    try { folder = findOrCreateChild(searchRoot(caseRow.name), cleanFolderName(caseRow.name) || caseRow.id); }
    catch (errS) { folder = rootFolder().createFolder(String(caseRow.id + ' ' + (caseRow.name || '')).slice(0, 80)); }
    update('cases', caseRow.id, { driveFolderId: folder.getId() });
    caseRow.driveFolderId = folder.getId();
    return folder;
  }


  /* ===== การจัดเก็บไฟล์ตามกติกา: เคสเปิด -> บันทึกสืบ/<ชื่อเป้าหมาย>, เคสปิด -> บันทึกการจับกุมปี <พ.ศ.> ===== */
  var SEARCH_ROOT_ID = '1dRQd26vIZCIWEH7c5Rx5j468a7xMcaN2';
  var ARREST_PARENT_ID = '1iOMIEdeJPU5dRVOllb_xsTBeOpgU8Wlo';
  var ARREST_YEAR_IDS = { '2569': '1gEfdDIUz4jz7Rjm0fk_OyYgLobhGxT-9' };

  function cleanFolderName(name) {
    return String(name || '').replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function findOrCreateChild(parent, name) {
    var it = parent.getFoldersByName(name);
    while (it.hasNext()) {
      var f = it.next();
      if (!f.isTrashed()) return f;
    }
    return parent.createFolder(name);
  }

  function ensureShortcut(folder, targetId) {
    if (!targetId || folder.getId() === targetId) return;
    var it = folder.getFilesByType(MimeType.SHORTCUT);
    while (it.hasNext()) {
      var f = it.next();
      try { if (!f.isTrashed() && f.getTargetId() === targetId) return; } catch (err) { /* ข้าม */ }
    }
    try {
      var parents = DriveApp.getFolderById(targetId).getParents();
      while (parents.hasNext()) { if (parents.next().getId() === folder.getId()) return; }
    } catch (err2) { /* เป้าหมายอาจเป็นไฟล์ */ }
    folder.createShortcut(targetId);
  }

  function isTestName(name) { return /^ทดสอบ_/.test(String(name || '').trim()); }
  function sandbox() { return findOrCreateChild(DriveApp.getFolderById(SEARCH_ROOT_ID), 'ทดสอบ_ลบได้'); }
  function searchRoot(caseName) { return isTestName(caseName) ? sandbox() : DriveApp.getFolderById(SEARCH_ROOT_ID); }

  function arrestYearFolder(iso, caseName) {
    if (isTestName(caseName)) return findOrCreateChild(sandbox(), 'บันทึกการจับกุม (ทดสอบ)');
    var year = String(Number(Utilities.formatDate(iso ? new Date(iso) : new Date(), 'Asia/Bangkok', 'yyyy')) + 543);
    if (ARREST_YEAR_IDS[year]) return DriveApp.getFolderById(ARREST_YEAR_IDS[year]);
    return findOrCreateChild(DriveApp.getFolderById(ARREST_PARENT_ID), 'บันทึกการจับกุมปี ' + year);
  }

  function driveIdFromUrl(url) {
    var m = String(url || '').match(/\/folders\/([A-Za-z0-9_-]{20,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{20,})/);
    return m ? m[1] : '';
  }

  function targetKey(target) {
    return cleanFolderName(target.name || target.nickname || target.phones || target.id);
  }

  function ensureTargetsHeader() {
    var sh = openDb().getSheetByName('targets');
    var cols = COLS.targets;
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    var head = sh.getRange(1, 1, 1, cols.length);
    var cur = head.getValues()[0];
    if (cur.join('|') !== cols.join('|')) head.setValues([cols]);
  }

  function targetFolder(caseRow, target) {
    if (target.driveFolderId) {
      try { return DriveApp.getFolderById(target.driveFolderId); } catch (err) { /* สร้างใหม่ */ }
    }
    return findOrCreateChild(caseFolder(caseRow), targetKey(target));
  }

  function folderForPeople(caseRow, peopleText) {
    var text = String(peopleText || '');
    if (!text) return null;
    var hit = readTable('targets').filter(function (t) {
      return t.caseId === caseRow.id && t.driveFolderId && t.name && text.indexOf(t.name) >= 0;
    })[0];
    if (!hit) return null;
    try { return DriveApp.getFolderById(hit.driveFolderId); } catch (err) { return null; }
  }

  function fileClosedCase(caseRow, arrestUrl, closedAt) {
    var linkedId = driveIdFromUrl(arrestUrl);
    var linked = null;
    if (linkedId) { try { linked = DriveApp.getFolderById(linkedId); } catch (err) { linked = null; } }
    var folder = null;
    if (caseRow.driveFolderId) { try { folder = DriveApp.getFolderById(caseRow.driveFolderId); } catch (err2) { folder = null; } }
    if (linked) {
      if (folder && folder.getId() !== linked.getId()) ensureShortcut(linked, folder.getId());
      return 'linked';
    }
    if (!folder) return 'none';
    var year = arrestYearFolder(closedAt, caseRow.name);
    try {
      folder.moveTo(year);
      return 'moved';
    } catch (err3) {
      ensureShortcut(year, folder.getId());
      return 'shortcut';
    }
  }

  function safeFiling(user, label, fn) {
    try { return fn(); } catch (err) {
      try { writeLog(user, 'filing-error', label + ': ' + String(err && err.message || err).slice(0, 200)); } catch (e2) { /* ข้าม */ }
      return null;
    }
  }

  function migrateFilingV1() {
    if (props().getProperty('FILING_V1_DONE')) return;
    ensureTargetsHeader();
    var ARREST = '1ztSQSAl0ks3klhUk7cjkkp9RoU38V_6s';
    var NETWORK = '1qCJhlVM1K-vWx13H2XdR9rLxwROdP84H';
    var root = searchRoot();
    var plan = [
      { caseId: 'case-162000', primary: 't-jakkrapong', folders: { 't-jakkrapong': 'นายจักรพงษ์ พานเหนือ', 't-rungarun': 'นายรุ่งอรุณ คำภู', 't-jamrat': 'นายจำรัส ล้วนวิเศษ' } },
      { caseId: 'case-laos-caller', primary: 't-laos', folders: { 't-laos': 'ผู้สั่งการ สปป.ลาว +69711984037116' } }
    ];
    var haveTargets = {};
    readTable('targets').forEach(function (t) { haveTargets[t.id] = true; });
    var haveCases = {};
    readTable('cases').forEach(function (c) { haveCases[c.id] = true; });
    plan.forEach(function (p) {
      var primaryId = '';
      Object.keys(p.folders).forEach(function (tid) {
        var f = findOrCreateChild(root, p.folders[tid]);
        ensureShortcut(f, ARREST);
        ensureShortcut(f, NETWORK);
        if (haveTargets[tid]) update('targets', tid, { driveFolderId: f.getId() });
        if (tid === p.primary) primaryId = f.getId();
      });
      if (haveCases[p.caseId]) update('cases', p.caseId, { driveFolderId: primaryId });
    });
    if (haveCases['case-closed-7925']) {
      update('cases', 'case-closed-7925', { driveFolderId: ARREST });
      var inside = false;
      var parents = DriveApp.getFolderById(ARREST).getParents();
      while (parents.hasNext()) { if (parents.next().getId() === ARREST_YEAR_IDS['2569']) inside = true; }
      if (!inside) ensureShortcut(DriveApp.getFolderById(ARREST_YEAR_IDS['2569']), ARREST);
    }
    props().setProperty('FILING_V1_DONE', nowIso());
  }


  function migrateFilingV2() {
    if (props().getProperty('FILING_V2_DONE')) return;
    var ARREST = '1ztSQSAl0ks3klhUk7cjkkp9RoU38V_6s';
    var NETWORK = '1qCJhlVM1K-vWx13H2XdR9rLxwROdP84H';
    var root = DriveApp.getFolderById(SEARCH_ROOT_ID);
    ['1o4d-leskR1TJBMMn2GZpOIoasiWGpxNZ', '14GDQz7atUAbMzH21sPytLt0X3sPBmOFw', '1VLbY2dnaIKKfDwz757Rj5B0jVcHIPDUc',
     '1TgsRIWJw4hbX4J3bIcYL-S9eyALFR5NF', '16DDyEcjX4ilQ8XcdpaD5MJ6AUcKjQz7M'].forEach(function (fid) {
      try { DriveApp.getFolderById(fid).setTrashed(true); } catch (e) { /* ข้าม */ }
    });
    var cases = {};
    readTable('cases').forEach(function (c) { cases[c.id] = c; });
    var plan = [
      { caseId: 'case-162000', fallback: 'ติดตามขยายผล ยาบ้า 162,000 เม็ด',
        targets: { 't-jakkrapong': 'นายจักรพงษ์ พานเหนือ', 't-rungarun': 'นายรุ่งอรุณ คำภู', 't-jamrat': 'นายจำรัส ล้วนวิเศษ' } },
      { caseId: 'case-laos-caller', fallback: 'ขยายผลผู้สั่งการ สปป.ลาว', targets: {}, selfTarget: 't-laos' }
    ];
    plan.forEach(function (p) {
      if (!cases[p.caseId]) return;
      var caseF = findOrCreateChild(root, cleanFolderName(cases[p.caseId].name) || p.fallback);
      ensureShortcut(caseF, ARREST);
      ensureShortcut(caseF, NETWORK);
      update('cases', p.caseId, { driveFolderId: caseF.getId() });
      Object.keys(p.targets).forEach(function (tid) {
        var tf = findOrCreateChild(caseF, p.targets[tid]);
        update('targets', tid, { driveFolderId: tf.getId() });
      });
      if (p.selfTarget) update('targets', p.selfTarget, { driveFolderId: caseF.getId() });
    });
    props().setProperty('FILING_V2_DONE', nowIso());
  }

  function cleanupTestSandboxV1() {
    if (props().getProperty('SANDBOX_CLEAN_V3_DONE')) return;
    var it = DriveApp.getFolderById(SEARCH_ROOT_ID).getFoldersByName('ทดสอบ_ลบได้');
    while (it.hasNext()) { try { it.next().setTrashed(true); } catch (e) { /* ข้าม */ } }
    props().setProperty('SANDBOX_CLEAN_V3_DONE', nowIso());
  }

  function runFilingMigration() {
    return withLock(function () { migrateFilingV1(); migrateFilingV2(); return props().getProperty('FILING_V2_DONE'); });
  }

  function savePhotos(folder, photos, prefix, keep) {
    var ids = [];
    (photos || []).slice(0, 4).forEach(function (photo, i) {
      if (!photo || !photo.base64) return;
      var mime = String(photo.mime || '');
      if (!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error('รองรับเฉพาะรูป jpeg png หรือ webp');
      var bytes = Utilities.base64Decode(String(photo.base64));
      if (bytes.length > 1.5 * 1024 * 1024) throw new Error('รูปใหญ่กว่า 1.5MB');
      var ext = mime === 'image/png' ? '.png' : (mime === 'image/webp' ? '.webp' : '.jpg');
      var name = prefix ? (prefix + '_' + (i + 1) + ext) : String(photo.name || 'photo.jpg');
      name = name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
      var file = folder.createFile(Utilities.newBlob(bytes, mime, name));
      ids.push(file.getId());
      if (keep) keep.push({ bytes: bytes, mime: mime, name: name });
    });
    return ids;
  }

  function photoOf(id) {
    if (!id) return null;
    try {
      var blob = DriveApp.getFileById(String(id).trim()).getBlob();
      return { bytes: blob.getBytes(), mime: blob.getContentType(), name: blob.getName() };
    } catch (err) { return null; }
  }

  function photoPrefix(caseRow, clean) {
    var who = (clean.people && clean.people[0]) || caseRow.name || caseRow.id;
    return clean.entryDate + '_ขั้น' + clean.stage + '_' + String(who).replace(/\s+/g, '').slice(0, 30);
  }

  function saveEntryMemo(caseRow, entry, user, shots) {
    entry = Object.assign({}, entry, { entryDate: String(entry.entryDate || '').slice(0, 10) });
    var label = CaseLogic.presentEntry(entry).stageLabel;
    var doc = Docx.entryMemo(caseRow, entry, label, user.name, shots);
    var name = 'บันทึกการสืบสวน_' + entry.entryDate + '_ขั้น' + entry.stage + '_' + String(entry.id).slice(-4) + '.docx';
    var file = caseFolder(caseRow).createFile(doc.toBlob(name));
    return file.getUrl();
  }

  function docxToPdf(blob, title) {
    var created;
    try {
      created = Drive.Files.insert({ title: title, mimeType: MimeType.GOOGLE_DOCS }, blob, { convert: true });
    } catch (err) {
      throw new Error('สร้าง PDF ไม่สำเร็จ ตรวจว่าเปิดบริการ Drive ขั้นสูงแล้ว');
    }
    try {
      var pdf = DriveApp.getFileById(created.id).getAs(MimeType.PDF);
      pdf.setName(title + '.pdf');
      return pdf;
    } finally {
      try { DriveApp.getFileById(created.id).setTrashed(true); } catch (err) { /* ไฟล์ชั่วคราว */ }
    }
  }

  function fileDataUrl(id) {
    if (!id) return '';
    try {
      var blob = DriveApp.getFileById(id).getBlob();
      if (blob.getBytes().length > 1.5 * 1024 * 1024) return '';
      var mime = blob.getContentType() || 'image/jpeg';
      if (mime.indexOf('image/') !== 0) return '';
      return 'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (err) {
      return '';
    }
  }

  function thumbDataUrl(id) {
    try {
      var blob = DriveApp.getFileById(id).getThumbnail();
      if (!blob) return '';
      var mime = blob.getContentType() || 'image/png';
      if (mime.indexOf('image/') !== 0) return '';
      return 'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) { return ''; }
  }

  function cachedDataUrl(id) {
    id = String(id || '').trim();
    if (!id) return '';
    var cache = CacheService.getScriptCache();
    var key = 'img1_' + id;
    var hit = null;
    try { hit = cache.get(key); } catch (e) { hit = null; }
    if (hit !== null) return hit;
    var url = thumbDataUrl(id) || fileDataUrl(id);
    try { if (url.length < 95000) cache.put(key, url, 21600); } catch (e2) { /* ใหญ่เกิน cache */ }
    return url;
  }

  function getCasePhotos(token, caseId) {
    requireUser(token);
    caseId = String(caseId || '');
    var out = { entries: {}, targets: {} };
    readTable('entries').forEach(function (e) {
      if (e.caseId !== caseId || !e.photoIds) return;
      out.entries[e.id] = String(e.photoIds).split(',').map(cachedDataUrl).filter(Boolean);
    });
    readTable('targets').forEach(function (t) {
      if (t.caseId !== caseId || !t.photoId) return;
      out.targets[t.id] = cachedDataUrl(t.photoId);
    });
    return out;
  }

  function updateEntry(token, caseId, entryId, input) {
    var user = requireUser(token);
    var clean = CaseLogic.validateEntry(input || {});
    return withLock(function () {
      var caseRow = findCase(String(caseId || ''));
      if (caseRow.status === 'closed') throw new Error('เคสนี้ปิดแล้ว แก้ขั้นตอนไม่ได้');
      if (CaseLogic.stageClosesCase(clean.stage)) throw new Error('ขั้น 5 (ปิดเคส) ให้บันทึกเป็นความคืบหน้าใหม่');
      var sh = openDb().getSheetByName('entries');
      var values = sh.getDataRange().getValues();
      var head = values[0].map(String);
      var r;
      for (r = 1; r < values.length; r += 1) {
        if (String(values[r][0]) !== String(entryId)) continue;
        if (String(values[r][head.indexOf('caseId')]) !== caseRow.id) throw new Error('ขั้นตอนนี้ไม่อยู่ในเคสนี้');
        var patch = {
          entryDate: clean.entryDate, eventTime: clean.eventTime, text: clean.text, stage: String(clean.stage),
          phones: clean.phones.join(', '), plates: clean.plates.join(', '), people: clean.people.join(', ')
        };
        var keys = ['entryDate', 'eventTime', 'text', 'stage', 'phones', 'plates', 'people'];
        var first = head.indexOf(keys[0]);
        var contiguous = first >= 0 && keys.every(function (k, i) { return head.indexOf(k) === first + i; });
        if (contiguous) {
          sh.getRange(r + 1, first + 1, 1, keys.length).setNumberFormat('@')
            .setValues([keys.map(function (k) { return safeText(patch[k]); })]);
        } else {
          keys.forEach(function (k) {
            var c = head.indexOf(k);
            if (c >= 0) sh.getRange(r + 1, c + 1).setNumberFormat('@').setValue(safeText(patch[k]));
          });
        }
        markCaseDirty(caseRow.id);
        writeLog(user, 'edit-entry', caseRow.id + ' ' + entryId + ' ขั้น ' + clean.stage);
        return { id: entryId };
      }
      throw new Error('ไม่พบขั้นตอนที่จะแก้');
    });
  }

  function hydrate(data) {
    data.entries.forEach(function (entry) {
      entry.photoSrcs = String(entry.photoIds || '').split(',').map(function (id) {
        return fileDataUrl(id.trim());
      }).filter(Boolean);
    });
    data.targets.forEach(function (target) {
      target.photoSrc = fileDataUrl(target.photoId);
    });
    return data;
  }

  function applyThaiFont(body) {
    var font = 'TH Sarabun New';
    var count = body.getNumChildren();
    var i;
    for (i = 0; i < count; i += 1) {
      var child = body.getChild(i);
      var type = child.getType();
      if (type === DocumentApp.ElementType.TABLE) {
        var table = child.asTable();
        var r;
        for (r = 0; r < table.getNumRows(); r += 1) {
          var row = table.getRow(r);
          var c;
          for (c = 0; c < row.getNumCells(); c += 1) {
            try { row.getCell(c).setFontFamily(font); } catch (err) { /* เซลล์ว่าง */ }
          }
        }
      } else {
        try { child.asParagraph().setFontFamily(font); } catch (err) {
          try { child.editAsText().setFontFamily(font); } catch (err2) { /* องค์ประกอบที่ไม่มีข้อความ */ }
        }
      }
    }
  }

  function htmlToPdf(html, title) {
    var blob = Utilities.newBlob(html, 'text/html', 'report.html');
    var created;
    try {
      created = Drive.Files.insert({ title: title, mimeType: MimeType.GOOGLE_DOCS }, blob);
    } catch (err) {
      throw new Error('สร้าง PDF ไม่สำเร็จ ตรวจว่าเปิดบริการ Drive ขั้นสูงแล้ว');
    }
    var docId = created.id;
    try {
      var doc = DocumentApp.openById(docId);
      var body = doc.getBody();
      try {
        body.setPageWidth(841.89);
        body.setPageHeight(595.28);
      } catch (err) { /* บางบัญชีตั้งขนาดหน้าไม่ได้ */ }
      applyThaiFont(body);
      doc.saveAndClose();
      var pdf = DriveApp.getFileById(docId).getAs(MimeType.PDF);
      pdf.setName(title + '.pdf');
      return pdf;
    } finally {
      try { DriveApp.getFileById(docId).setTrashed(true); } catch (err) { /* ไฟล์ชั่วคราว */ }
    }
  }

  function pdfPayload(blob, filename) {
    var bytes = blob.getBytes();
    if (!bytes || !bytes.length) throw new Error('ไฟล์ PDF ว่างเปล่า กรุณาลองใหม่');
    if (bytes.length > 35 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกินกว่าจะส่งผ่านเว็บได้ (รูปมากเกินไป)');
    return {
      filename: filename,
      mime: 'application/pdf',
      base64: Utilities.base64Encode(bytes)
    };
  }

  function getMeta() {
    return {
      appName: CaseLogic.APP_NAME,
      unitName: CaseLogic.UNIT_NAME,
      unitShort: CaseLogic.UNIT_SHORT,
      stages: CaseLogic.STAGES
    };
  }

  function passwordMatches(password) {
    var bag = props();
    return CaseLogic.verifyPassword(password, bag.getProperty('APP_PASSWORD_SALT'), bag.getProperty('APP_PASSWORD_HASH'));
  }

  function listUsersForPassword(password) {
    if (!passwordMatches(password)) throw new Error('รหัสผ่านไม่ถูกต้อง');
    return withLock(function () {
      ensureRoster();
      var active = readTable('users').filter(isActive);
      return { users: CaseLogic.visibleRoster(active, SampleData.roster, SampleData.placeholderUserIds) };
    });
  }

  function login(userId, password, customName) {
    if (!passwordMatches(password)) throw new Error('รหัสผ่านไม่ถูกต้อง');
    var sessionUser;
    if (String(userId || '') === '__other__') {
      var typed = String(customName || '').trim();
      if (!typed) throw new Error('กรอกชื่อ');
      if (typed.length > 200) throw new Error('ชื่อยาวกว่าที่กำหนด');
      sessionUser = {
        id: 'custom-' + CaseLogic.sha256Hex(typed).slice(0, 12),
        name: typed,
        role: 'officer'
      };
    } else {
      withLock(function () { ensureRoster(); });
      var user = findListedUser(userId);
      if (!user) throw new Error('ไม่พบชื่อในรายชื่อ');
      sessionUser = {
        id: String(user.id || '').trim() || String(user.name).trim(),
        name: String(user.name).trim(),
        role: user.role || 'officer'
      };
    }
    var token = issueToken(sessionUser);
    withLock(function () { writeLog(sessionUser, 'login', ''); });
    if (!props().getProperty('FILING_V2_DONE')) safeFiling(sessionUser, 'migrate-v1', runFilingMigration);
    if (!props().getProperty('SANDBOX_CLEAN_V3_DONE')) safeFiling(sessionUser, 'sandbox-clean', cleanupTestSandboxV1);
    return { token: token, user: sessionUser };
  }


  // ---- ข้อมูลเพิ่มเติมให้ตรงระบบ บช.ตชด. (เก็บเป็น JSON ในคอลัมน์ ext ท้ายแท็บ ไม่แตะคอลัมน์เดิม) ----
  function ensureExtCol(name) {
    var sh = openDb().getSheetByName(name);
    var cols = COLS[name];
    var n = cols.length;
    if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
    var cur = sh.getRange(1, 1, 1, n).getValues()[0].map(String);
    for (var i = 0; i < n - 1; i += 1) {
      if (cur[i] !== cols[i]) throw new Error('โครงสร้างแท็บ ' + name + ' ไม่ตรง (คอลัมน์ ' + (i + 1) + ') ยกเลิกเพื่อไม่ให้ข้อมูลเสีย');
    }
    if (cur[n - 1] === '') sh.getRange(1, n).setValue('ext');
    else if (cur[n - 1] !== 'ext') throw new Error('คอลัมน์ ext ของแท็บ ' + name + ' ถูกใช้แล้ว');
  }
  function extStr_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }
  var CASE_TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'U'];
  var EXT_STATUS = ['กำลังดำเนินการ', 'เสร็จสิ้น', 'ปิดคดีแล้ว'];
  var TITLES = ['นาย', 'นาง', 'นางสาว', 'ไม่ทราบ'];
  function cleanPerson_(p) {
    p = p || {};
    return { rank: extStr_(p.rank, 30), first: extStr_(p.first, 80), last: extStr_(p.last, 80), phone: extStr_(p.phone, 30) };
  }
  function cleanCaseExt(x) {
    x = x || {};
    var d = extStr_(x.startDate, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('วันที่เริ่มคดีไม่ถูกต้อง');
    var t = extStr_(x.caseType, 1).toUpperCase();
    if (t && CASE_TYPES.indexOf(t) < 0) throw new Error('ประเภทคดีไม่ถูกต้อง');
    var st = extStr_(x.extStatus, 30);
    if (st && EXT_STATUS.indexOf(st) < 0) throw new Error('สถานะคดีไม่ถูกต้อง');
    var vehicles = (Array.isArray(x.vehicles) ? x.vehicles : []).slice(0, 20).map(function (v) {
      v = v || {};
      return { make: extStr_(v.make, 60), model: extStr_(v.model, 60), color: extStr_(v.color, 40), plate: extStr_(v.plate, 60) };
    }).filter(function (v) { return v.make || v.model || v.color || v.plate; });
    return {
      startDate: d, caseType: t, linkedCaseId: extStr_(x.linkedCaseId, 100), bchCaseName: extStr_(x.bchCaseName, 200), vehicles: vehicles,
      targetPhones: extStr_(x.targetPhones, 500), bankAccounts: extStr_(x.bankAccounts, 500),
      gps: extStr_(x.gps, 300), evidenceLogo: extStr_(x.evidenceLogo, 300), extStatus: st,
      reporter: cleanPerson_(x.reporter), leader: cleanPerson_(x.leader)
    };
  }
  function cleanTargetExt(x) {
    x = x || {};
    var t = extStr_(x.title, 20);
    if (t && TITLES.indexOf(t) < 0) throw new Error('คำนำหน้าไม่ถูกต้อง');
    return { title: t, firstName: extStr_(x.firstName, 100), lastName: extStr_(x.lastName, 100) };
  }
  function parseExt_(s) { try { var o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

  function updateCaseExt(token, caseId, ext) {
    var user = requireUser(token);
    var clean = cleanCaseExt(ext);
    return withLock(function () {
      var caseRow = findCase(String(caseId || ''));
      ensureExtCol('cases');
      var old_ = parseExt_(caseRow.ext); if (old_.bchCaseId) clean.bchCaseId = old_.bchCaseId; if (old_.bchFiles) clean.bchFiles = old_.bchFiles;
      update('cases', caseRow.id, { ext: JSON.stringify(clean) });
      markCaseDirty(caseRow.id);
      writeLog(user, 'update-case-ext', caseRow.id);
      return { ok: true };
    });
  }
  function updateTargetExt(token, targetId, ext) {
    var user = requireUser(token);
    var clean = cleanTargetExt(ext);
    return withLock(function () {
      var row = readTable('targets').filter(function (t) { return t.id === String(targetId || ''); })[0];
      if (!row) throw new Error('ไม่พบเป้าหมาย');
      ensureExtCol('targets');
      update('targets', row.id, { ext: JSON.stringify(clean) });
      markCaseDirty(row.caseId);
      writeLog(user, 'update-target-ext', row.id);
      return { ok: true };
    });
  }

  function listCases(token, includeClosed) {
    requireUser(token);
    var data = collect();
    var cards = CaseLogic.buildHome(data, new Date(), !!includeClosed);
    var byId = {};
    data.cases.forEach(function (c) { byId[c.id] = c; });
    cards.forEach(function (card) { card.bchLinked = !!(byId[card.id] && bchMapFor_(byId[card.id])); });
    return { cards: cards };
  }

  function getCaseCard(token, caseId) {
    requireUser(token);
    var data = collect();
    var row = data.cases.filter(function (c) { return c.id === String(caseId || ''); })[0];
    if (!row) throw new Error('ไม่พบเคส');
    var entries = data.entries.filter(function (e) { return e.caseId === row.id; });
    var targets = data.targets.filter(function (t) { return t.caseId === row.id; });
    var card = CaseLogic.buildCaseCard(row, entries, targets, new Date());
    card.bchLinked = !!bchMapFor_(row);
    return card;
  }


  // ข้อมูลบุคคลชุดเดียว ใช้ทั้งหน้าเว็บและ PDF (เฉพาะเคสนี้เท่านั้น ไม่สร้างข้อมูลเพิ่ม)
  var PX_LABEL = { aka: 'ฉายา', alias: 'ฉายา', bank: 'บัญชีธนาคาร', bankAccounts: 'บัญชีธนาคาร', vehicle: 'ยานพาหนะ', vehicles: 'ยานพาหนะ', plate: 'ทะเบียนรถ', plates: 'ทะเบียนรถ', notes: 'หมายเหตุ', note: 'หมายเหตุ', social: 'โซเชียล', facebook: 'Facebook', line: 'LINE', job: 'อาชีพ', relation: 'ความสัมพันธ์', relations: 'ความสัมพันธ์' };
  function pxVal_(v) {
    if (v == null) return '';
    if (typeof v !== 'object') return String(v).trim();
    if (Array.isArray(v)) return v.map(pxVal_).filter(Boolean).join(', ');
    return Object.keys(v).map(function (k) { return pxVal_(v[k]); }).filter(Boolean).join(' ');
  }
  function pxAge_(d) { var b = new Date(d); if (isNaN(b)) return ''; var n = new Date(), a = n.getFullYear() - b.getFullYear() - ((n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) ? 1 : 0); return a >= 0 && a <= 120 ? a : ''; }
  function pxBare_(n) { return String(n || '').replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*/, '').trim(); }
  function casePersons_(bundle, snap, data) {
    var out = [], entries = bundle.entries || [], targets = bundle.targets || [];
    targets.forEach(function (t) {
      var L = [], age = t.birthDate ? pxAge_(t.birthDate) : '';
      L.push(['ชื่อเล่น', t.nickname], ['เลขประจำตัวประชาชน', t.nationalIdText], ['อายุ', age !== '' ? age + ' ปี' : ''], ['ที่อยู่', t.address], ['โทร', t.phones], ['บทบาท', t.roleNotes], ['สถานะ', t.outcomeLabel]);
      out.push({ id: t.id, name: t.name, src: 'ระบบติดตามคดี', arrested: !!t.arrested, lines: L.filter(function (x) { return x[1] && String(x[1]).trim(); }) });
    });
    var F = (snap && snap.fields) || {}, cl = function (v) { v = String(v == null ? '' : v).trim(); return v === '-' ? '' : v; };
    var nm = [cl(F.intelFName), cl(F.intelLName)].filter(Boolean).join(' ');
    if (nm) {
      var full = cl(F.intelTitle) && nm.indexOf(cl(F.intelTitle)) !== 0 ? cl(F.intelTitle) + nm : nm;
      var mine = targets.some(function (t) { return pxBare_(t.name) === pxBare_(full); });
      if (!mine) {
        var veh = [cl(F.intelVehBrand), cl(F.intelVehModel), cl(F.intelVehColor), cl(F.intelVehPlate)].filter(Boolean).join(' ');
        var L2 = [['ฉายา', cl(F.intelAlias)], ['เลขประจำตัวประชาชน', cl(F.intelIDCard)], ['ที่อยู่', cl(F.intelLocation)], ['โทร', cl(F.intelPhone)]];
        var elsewhere = (data.targets || []).filter(function (o) { return o.caseId !== bundle.card.id && pxBare_(o.name) === pxBare_(full); }).map(function (o) { var cr = (data.cases || []).filter(function (c) { return c.id === o.caseId; })[0]; return cr ? cr.name : o.caseId; });
        if (elsewhere.length) L2.push(['ข้อสังเกต', 'บช. ระบุบุคคลนี้เป็นเป้าหมายของคดีนี้ แต่ในระบบของเราเป็นเป้าหมายของคดี: ' + elsewhere.join(', ') + ' (โปรดตรวจสอบกับ บช.)']);
        out.push({ id: 'bch-intel', name: full, src: 'บช.', arrested: false, lines: L2.filter(function (x) { return x[1]; }) });
      }
    }
    return out;
  }

  function getCase(token, caseId) {
    requireUser(token);
    var data = collect();
    var bundle = CaseLogic.buildBundle(data, String(caseId || ''), new Date());
    if (!bundle) throw new Error('ไม่พบเคส');
    var cr = data.cases.filter(function (c) { return c.id === String(caseId || ''); })[0] || {};
    bundle.card.ext = parseExt_(cr.ext);
    bundle.card.createdAt = cr.createdAt || '';
    var tx = {};
    data.targets.forEach(function (t) { tx[t.id] = parseExt_(t.ext); });
    (bundle.targets || []).forEach(function (t) { t.ext = tx[t.id] || {}; });
    var br = bchDataRow_(cr.id), sn = {}; try { sn = JSON.parse(br && br.snapshot || '{}'); } catch (e) {}
    bundle.persons = casePersons_(bundle, sn, data);
    return bundle;
  }

  function createCase(token, input) {
    var user = requireUser(token);
    var clean = CaseLogic.validateCase(input || {});
    var ext = input && input.ext ? cleanCaseExt(input.ext) : null;
    return withLock(function () {
      if (ext) ensureExtCol('cases');
      var id = newId('case');
      var row = {
        id: id,
        name: clean.name,
        detail: clean.detail,
        status: 'open',
        nextStep: clean.nextStep,
        arrestRecordUrl: '',
        createdAt: nowIso(),
        createdById: user.id,
        createdByName: user.name,
        closedAt: '',
        driveFolderId: '',
        ext: ext ? JSON.stringify(ext) : ''
      };
      append('cases', row);
      var folder = safeFiling(user, 'create-case', function () {
        return findOrCreateChild(searchRoot(clean.name), cleanFolderName(clean.name) || id);
      }) || rootFolder().createFolder(id + ' ' + clean.name.slice(0, 60));
      update('cases', id, { driveFolderId: folder.getId() });
      writeLog(user, 'create-case', clean.name);
      bchRecord_('case', id, row, user, clean.detail);
      return { id: id };
    });
  }

  function addEntry(token, caseId, input) {
    var user = requireUser(token);
    var clean = CaseLogic.validateEntry(input || {});
    return withLock(function () {
      var caseRow = findCase(String(caseId || ''));
      if (caseRow.status === 'closed') throw new Error('เคสนี้ปิดแล้ว');
      if (CaseLogic.stageClosesCase(clean.stage) && !CaseLogic.caseClosable(readTable('targets').filter(function (t) { return t.caseId === caseRow.id; }))) {
        throw new Error('ปิดเคสได้เมื่อเป้าหมายทุกคนจับแล้ว หน่วยอื่นจับ หรือเสียชีวิต');
      }
      var folder = ((input || {}).photos && (input || {}).photos.length ? (safeFiling(user, 'entry-folder', function () { return folderForPeople(caseRow, clean.people.join(', ')); }) || caseFolder(caseRow)) : null);
      var shots = [];
      var photoIds = folder ? savePhotos(folder, (input || {}).photos, photoPrefix(caseRow, clean), shots) : [];
      var id = newId('entry');
      var entryRow = {
        id: id,
        caseId: caseRow.id,
        entryDate: clean.entryDate,
        eventTime: clean.eventTime,
        text: clean.text,
        stage: clean.stage,
        phones: clean.phones.join(', '),
        plates: clean.plates.join(', '),
        people: clean.people.join(', '),
        photoIds: photoIds.join(','),
        authorId: user.id,
        authorName: user.name,
        createdAt: nowIso()
      };
      append('entries', entryRow);
      var memoUrl = safeFiling(user, 'entry-memo', function () { return saveEntryMemo(caseRow, entryRow, user, shots); });
      if (CaseLogic.stageClosesCase(clean.stage)) {
        update('cases', caseRow.id, {
          status: 'closed',
          closedAt: nowIso(),
          arrestRecordUrl: clean.arrestRecordUrl
        });
        safeFiling(user, 'close-case', function () { return fileClosedCase(caseRow, clean.arrestRecordUrl, nowIso()); });
      }
      markCaseDirty(caseRow.id);
      writeLog(user, 'add-entry', caseRow.id + ' ขั้น ' + clean.stage);
      bchRecord_('entry', id, caseRow, user, clean.text);
      return { id: id, closed: CaseLogic.stageClosesCase(clean.stage), memoUrl: memoUrl || '' };
    });
  }

  function addTarget(token, caseId, input) {
    var user = requireUser(token);
    var clean = CaseLogic.validateTarget(input || {});
    var text = input && input.ext ? cleanTargetExt(input.ext) : null;
    return withLock(function () {
      if (text) ensureExtCol('targets');
      var caseRow = findCase(String(caseId || ''));
      if (caseRow.status === 'closed') throw new Error('เคสนี้ปิดแล้ว');
      var id = newId('target');
      caseFolder(caseRow);
      var tFolder = safeFiling(user, 'target-folder', function () {
        ensureTargetsHeader();
        return targetFolder(caseRow, { id: id, name: clean.name, nickname: clean.nickname, phones: clean.phones });
      });
      var photoId = '';
      if (input && input.photo && input.photo.base64) {
        var ids = savePhotos(tFolder || caseFolder(caseRow), [input.photo]);
        photoId = ids[0] || '';
      }
      append('targets', {
        id: id,
        caseId: caseRow.id,
        name: clean.name,
        nickname: clean.nickname,
        nationalId: clean.nationalId,
        birthDate: clean.birthDate,
        address: clean.address,
        phones: clean.phones,
        roleNotes: clean.roleNotes,
        photoId: photoId,
        createdAt: nowIso(),
        createdByName: user.name,
        driveFolderId: tFolder ? tFolder.getId() : '',
        ext: text ? JSON.stringify(text) : ''
      });
      markCaseDirty(caseRow.id);
      writeLog(user, 'add-target', caseRow.id + ' ' + clean.name);
      return { id: id };
    });
  }

  function updateTargetOutcome(token, targetId, input) {
    var user = requireUser(token);
    var clean = CaseLogic.validateOutcome(input || {});
    return withLock(function () {
      var target = readTable('targets').filter(function (t) { return t.id === String(targetId || ''); })[0];
      if (!target) throw new Error('ไม่พบเป้าหมาย');
      var caseRow = findCase(target.caseId);
      if (caseRow.status === 'closed') throw new Error('เคสนี้ปิดแล้ว');
      ensureTargetsHeader();
      update('targets', target.id, { outcome: clean.outcome, outcomeDate: clean.outcomeDate, outcomeNote: clean.outcomeNote });
      markCaseDirty(caseRow.id);
      writeLog(user, 'target-outcome', caseRow.id + ' ' + target.id + ' ' + clean.outcome);
      return { ok: true };
    });
  }

  function updateNextStep(token, caseId, text) {
    var user = requireUser(token);
    var nextStep = CaseLogic.validateNextStep(text);
    return withLock(function () {
      var caseRow = findCase(String(caseId || ''));
      if (caseRow.status === 'closed') throw new Error('เคสนี้ปิดแล้ว');
      update('cases', caseRow.id, { nextStep: nextStep });
      markCaseDirty(caseRow.id);
      writeLog(user, 'next-step', caseRow.id);
      return { ok: true };
    });
  }

  function updateArrestLink(token, caseId, url) {
    var user = requireUser(token);
    var link = CaseLogic.validateArrestLink(url);
    return withLock(function () {
      var caseRow = findCase(String(caseId || ''));
      if (caseRow.status !== 'closed') throw new Error('ใส่ลิงก์บันทึกการจับกุมได้เมื่อเคสปิดแล้ว');
      update('cases', caseRow.id, { arrestRecordUrl: link });
      safeFiling(user, 'arrest-link', function () { return fileClosedCase(caseRow, link, caseRow.closedAt); });
      markCaseDirty(caseRow.id);
      writeLog(user, 'arrest-link', caseRow.id);
      return { ok: true };
    });
  }

  function downloadSummaryPdf(token) {
    var user = requireUser(token);
    requireBoss(user);
    var data = collect();
    var now = new Date();
    var rows = CaseLogic.buildSummaryRows(data, now);
    var html = PdfTemplates.summaryHtml(rows, { nowText: CaseLogic.formatThaiDateTime(now) });
    var pdf = htmlToPdf(html, CaseLogic.APP_NAME + ' สรุปรวม');
    withLock(function () { writeLog(user, 'download-summary', String(rows.length)); });
    return pdfPayload(pdf, 'สรุปรวม.pdf');
  }

  function caseDocArgs(data, caseRow, now) {
    var bundle = CaseLogic.buildBundle(data, caseRow.id, now);
    var rawTargets = data.targets.filter(function (t) { return t.caseId === caseRow.id; });
    var rawEntries = {};
    data.entries.forEach(function (e) { rawEntries[e.id] = e; });
    var entries = bundle.entries.map(function (e) {
      var raw = rawEntries[e.id] || {};
      return {
        entryDate: raw.entryDate, eventTime: raw.eventTime, stage: e.stage, stageLabel: e.stageLabel,
        text: raw.text, people: raw.people, phones: raw.phones, plates: raw.plates, authorName: raw.authorName,
        photos: String(raw.photoIds || '').split(',').filter(Boolean).slice(0, 4).map(photoOf).filter(Boolean)
      };
    });
    var targets = rawTargets.map(function (t) {
      var pt = CaseLogic.presentTarget(t);
      pt.photo = photoOf(t.photoId);
      return pt;
    });
    var last = entries.length ? entries[entries.length - 1] : null;
    return {
      caseRow: caseRow,
      stageText: last ? 'ขั้น ' + last.stage + ' ' + last.stageLabel : '',
      nowText: CaseLogic.formatThaiDateTime(now),
      targets: targets,
      entries: entries
    };
  }

  function caseTitle(caseRow) { return String(caseRow.name || caseRow.id).replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60); }

  function memoFor(caseRow, entry) {
    entry = Object.assign({}, entry, { entryDate: String(entry.entryDate || '').slice(0, 10) });
    var label = CaseLogic.presentEntry(entry).stageLabel;
    var shots = String(entry.photoIds || '').split(',').filter(Boolean).slice(0, 4).map(photoOf).filter(Boolean);
    var doc = Docx.entryMemo(caseRow, entry, label, entry.authorName || '', shots);
    var name = 'บันทึกการสืบสวน_' + entry.entryDate + '_ขั้น' + entry.stage + '_' + String(entry.id).slice(-4) + '.docx';
    return { blob: doc.toBlob(name), name: name };
  }

  function storeOf() { return { get: function (k) { return props().getProperty(k); }, set: function (k, v) { props().setProperty(k, v); } }; }

  function readDriveFile(id) {
    try {
      var blob = DriveApp.getFileById(id).getBlob();
      return { bytes: blob.getBytes(), mime: blob.getContentType(), name: blob.getName() };
    } catch (err) { return null; }
  }

  function caseFilesEnv(caseRow, data) {
    var now = new Date();
    var args = null;
    var memoCache = {};
    var caseEntries = data.entries.filter(function (e) { return e.caseId === caseRow.id; });
    var title = caseTitle(caseRow);
    function argsOnce() { if (!args) args = caseDocArgs(data, caseRow, now); return args; }
    function memoOnce(e) { if (!memoCache[e.id]) memoCache[e.id] = memoFor(caseRow, e); return memoCache[e.id]; }
    return {
      store: storeOf(),
      now: nowIso,
      build: function (kind) {
        if (kind === 'memo') {
          var blobs = caseEntries.map(function (e) { var m = memoOnce(e); return m.blob.copyBlob().setName(m.name); });
          if (!blobs.length) {
            var d = Docx.create({});
            d.p(['ยังไม่มีบันทึกการสืบสวนของเคส ' + (caseRow.name || '')]);
            blobs = [d.toBlob('ยังไม่มีบันทึก.docx')];
          }
          var zn = 'บันทึกสืบ_' + title + '.zip';
          return { blob: Utilities.zip(blobs, zn), name: zn };
        }
        var slide = kind === 'slide';
        var a = Object.assign({}, argsOnce());
        a.logo = unitLogo();
        var doc = slide ? Docx.casePoster(a) : Docx.caseDeck(a);
        var t = (slide ? 'โปสเตอร์สรุป_' : 'สไลด์สรุป_') + title;
        var pdf = docxToPdf(doc.toBlob(t + '.docx'), t);
        return { blob: pdf, name: t + '.pdf' };
      },
      buildMemo: function (e) { return memoOnce(e); },
      upsert: function (fileId, name, blob, legacyMatch) {
        blob.setName(name);
        var folder = caseFolder(caseRow);
        if (!fileId && legacyMatch) {
          var it = folder.getFiles();
          while (it.hasNext()) { var f = it.next(); if (!f.isTrashed() && legacyMatch(f.getName())) { fileId = f.getId(); break; } }
        }
        if (fileId) {
          try {
            var cur = DriveApp.getFileById(fileId);
            if (!cur.isTrashed()) {
              Drive.Files.update({ title: name, mimeType: blob.getContentType() }, fileId, blob);
              return fileId;
            }
          } catch (err) { console.log('upsert fallback ' + err); }
        }
        return folder.createFile(blob).getId();
      },
      read: readDriveFile
    };
  }

  // ลายนิ้วมือข้อมูลเคส: ถ้าข้อมูลถูกแก้/เพิ่ม (แม้แก้ตรงในชีตหรือนำเข้าอัตโนมัติ) ไฟล์จะถูกอัปเดต
  function caseHash(caseRow, data) {
    var id = caseRow.id;
    var src = JSON.stringify(['tpl50-poster1-neon', caseRow,
      data.entries.filter(function (e) { return e.caseId === id; }),
      data.targets.filter(function (t) { return t.caseId === id; })]);
    return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, src, Utilities.Charset.UTF_8));
  }

  function markCaseDirty(caseId) {
    try { CaseFiles.markDirty(storeOf(), String(caseId)); } catch (err) { console.log('markDirty ' + err); }
  }

  function refreshNow(caseRow) {
    var cache = CacheService.getScriptCache();
    var busyKey = 'cfbusy_' + caseRow.id;
    if (cache.get(busyKey)) return null;
    cache.put(busyKey, '1', 300);
    try {
      var data = collect();
      var env = caseFilesEnv(caseRow, data);
      env.hash = caseHash(caseRow, data);
      return CaseFiles.refresh(env, caseRow.id, data.entries.filter(function (e) { return e.caseId === caseRow.id; }));
    } finally { cache.remove(busyKey); }
  }

  // เรียกจากหน้าเว็บแบบเบื้องหลังหลังบันทึกข้อมูล (ผู้ใช้ไม่ต้องรอ)
  function refreshCaseFiles(token, caseId) {
    var user = requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    var data = collect();
    var h = caseHash(caseRow, data);
    if (!CaseFiles.info(storeOf(), caseRow.id, h).dirty) return CaseFiles.info(storeOf(), caseRow.id, h);
    var res = refreshNow(caseRow);
    if (res) withLock(function () { writeLog(user, 'refresh-files', caseRow.id); });
    return CaseFiles.info(storeOf(), caseRow.id);
  }

  function getCaseFiles(token, caseId) {
    requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    var out = CaseFiles.info(storeOf(), caseRow.id, caseHash(caseRow, collect()));
    out.busy = !!CacheService.getScriptCache().get('cfbusy_' + caseRow.id);
    if (out.updatedAt) out.updatedText = CaseLogic.formatThaiDateTime(new Date(out.updatedAt));
    return out;
  }

  function downloadCaseFile(token, caseId, kind) {
    var user = requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    if (CaseFiles.KINDS.indexOf(kind) < 0) throw new Error('ไม่รู้จักชนิดไฟล์');
    var env = { store: storeOf(), read: readDriveFile, hash: caseHash(caseRow, collect()) };
    var f = CaseFiles.fileFor(env, caseRow.id, kind);
    if (!f) {
      refreshNow(caseRow);
      f = CaseFiles.fileFor(env, caseRow.id, kind);
    }
    if (!f) throw new Error('ไฟล์กำลังอัปเดตอยู่ กรุณาลองใหม่ในอีกสักครู่');
    if (f.bytes.length > 35 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกินกว่าจะส่งผ่านเว็บได้');
    withLock(function () { writeLog(user, 'download-' + kind, caseRow.id); });
    return { filename: f.name, mime: f.mime || 'application/octet-stream', base64: Utilities.base64Encode(f.bytes) };
  }

  // คงไว้เพื่อความเข้ากันได้
  function downloadCasePdf(token, caseId, kind) {
    return downloadCaseFile(token, caseId, kind === 'slide' ? 'slide' : 'report');
  }


  function unitLogo() {
    try {
      if (typeof UNIT_LOGO_PNG_B64 !== 'undefined' && UNIT_LOGO_PNG_B64) return { bytes: Utilities.base64Decode(UNIT_LOGO_PNG_B64), mime: 'image/png' };
      if (typeof UNIT_LOGO_B64 === 'undefined' || !UNIT_LOGO_B64) return null;
      return { bytes: Utilities.base64Decode(UNIT_LOGO_B64), mime: 'image/jpeg' };
    } catch (err) { console.log('logo ' + err); return null; }
  }

  function doGet() {
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle(CaseLogic.APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // สรุปรวมหลายคดี: เบราว์เซอร์รวม PDF ของแต่ละคดีแล้วส่งมาเก็บไฟล์เดียว (อัปเดตไฟล์เดิมทุกครั้ง)
  function saveCombinedPdf(token, base64, caseIds) {
    var user = requireUser(token);
    var bytes = Utilities.base64Decode(String(base64 || ''));
    if (!bytes.length) throw new Error('ไม่มีข้อมูลไฟล์');
    var name = 'สรุปรวมคดี_' + UNIT_SHORT_SAFE() + '.pdf';
    var blob = Utilities.newBlob(bytes, 'application/pdf', name);
    var bag = props(); var id = bag.getProperty('COMBINED_PDF_ID'); var ok = false;
    if (id) { try { if (!DriveApp.getFileById(id).isTrashed()) { Drive.Files.update({ title: name, mimeType: 'application/pdf' }, id, blob); ok = true; } } catch (err) { console.log('combined ' + err); } }
    if (!ok) { id = rootFolder().createFile(blob).getId(); bag.setProperty('COMBINED_PDF_ID', id); }
    withLock(function () { writeLog(user, 'download-combined', (caseIds || []).join(',')); });
    return { id: id, url: 'https://drive.google.com/file/d/' + id + '/view', name: name };
  }

  // โปสเตอร์แบบ 1 (นีออน): เซิร์ฟเวอร์ส่งข้อมูลจริง → เบราว์เซอร์วาด PNG → ส่งกลับมาเก็บทับไฟล์เดิม (ไม่ใช้ AI)
  function posterKey(id) { return 'PST_' + id; }
  function posterHash(caseRow, data, daysLabel) { return caseHash(caseRow, data) + '|' + daysLabel; }
  function dataUri(ph) { return ph ? 'data:' + (ph.mime || 'image/jpeg') + ';base64,' + Utilities.base64Encode(ph.bytes) : null; }
  function getPosterData(token, caseId) {
    requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    var data = collect(); var now = new Date();
    var bundle = CaseLogic.buildBundle(data, caseRow.id, now);
    var h = posterHash(caseRow, data, bundle.card.daysLabel);
    var name = 'โปสเตอร์สรุป_' + caseTitle(caseRow) + '.png';
    var st = null; try { st = JSON.parse(props().getProperty(posterKey(caseRow.id)) || 'null'); } catch (e) { st = null; }
    if (st && st.hash === h) {
      var f = readDriveFile(st.id);
      if (f) return { cached: true, filename: name, mime: 'image/png', base64: Utilities.base64Encode(f.bytes) };
    }
    var raw = {}; data.entries.forEach(function (e) { raw[e.id] = e; });
    var groups = {}, order = [];
    bundle.entries.forEach(function (e) {
      if (!groups[e.stage]) { groups[e.stage] = []; order.push(e.stage); }
      groups[e.stage].push(e);
    });
    order.sort(function (a, b) { return a - b; });
    var stages = order.slice(-4).map(function (n) {
      var es = groups[n], plates = {}, phones = [], ids = [];
      es.forEach(function (e) {
        (e.plates || []).forEach(function (p) { plates[p] = 1; });
        phones = phones.concat(e.phones || []);
        ids = ids.concat(String((raw[e.id] || {}).photoIds || '').split(',').filter(function (x) { return x.trim(); }));
      });
      return {
        n: n, label: es[0].stageLabel, date: String(es[0].entryDateText || '').split(' ').slice(0, 3).join(' '),
        texts: es.map(function (e) { return e.text; }), plates: Object.keys(plates).sort(), phones: phones.slice(0, 2),
        photos: ids.slice(0, 2).map(photoOf).map(dataUri).filter(Boolean)
      };
    });
    var targets = data.targets.filter(function (t) { return t.caseId === caseRow.id; }).slice(0, 6).map(function (t) {
      var pt = CaseLogic.presentTarget(t); var ph = photoOf(t.photoId); var dim = ph ? Docx.imageSize(ph.bytes, ph.mime) : null;
      return { name: pt.name, arrested: !!pt.arrested, outcomeLabel: pt.outcomeLabel, photo: dataUri(ph),
        reg: !!(dim && dim.w >= 800 && dim.h / dim.w > 1.33 && dim.h / dim.w < 1.5) };
    });
    var logo = unitLogo();
    return { cached: false, hash: h, filename: name, data: {
      logo: dataUri(logo), unitName: bundle.unitName, unitShort: bundle.unitShort, caseName: caseRow.name,
      stages: stages, targets: targets, nextStep: caseRow.nextStep || '', daysLabel: bundle.card.daysLabel, nowText: bundle.nowText } };
  }
  function savePosterPng(token, caseId, base64, hash) {
    var user = requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    var bytes = Utilities.base64Decode(String(base64 || ''));
    if (!bytes.length) throw new Error('ไม่มีข้อมูลไฟล์');
    var name = 'โปสเตอร์สรุป_' + caseTitle(caseRow) + '.png';
    var blob = Utilities.newBlob(bytes, 'image/png', name);
    var bag = props(); var st = null; try { st = JSON.parse(bag.getProperty(posterKey(caseRow.id)) || 'null'); } catch (e) { st = null; }
    var id = st && st.id, ok = false;
    if (id) { try { if (!DriveApp.getFileById(id).isTrashed()) { Drive.Files.update({ title: name, mimeType: 'image/png' }, id, blob); ok = true; } } catch (err) { console.log('poster ' + err); } }
    if (!ok) id = caseFolder(caseRow).createFile(blob).getId();
    bag.setProperty(posterKey(caseRow.id), JSON.stringify({ id: id, hash: String(hash || '') }));
    withLock(function () { writeLog(user, 'download-slide', caseRow.id); });
    return { id: id };
  }

  // ===== แจ้งเตือน/ติดตามการส่งเข้าระบบ บช.ตชด. (แท็บ bch_sync แยก ไม่แตะแท็บเดิม) =====
  var BCH_COLS = ['id', 'kind', 'caseId', 'caseName', 'authorName', 'text', 'createdAt', 'notifiedAt', 'sentAt', 'sentBy'];
  function bchSheet_() {
    var db = openDb(), sh = db.getSheetByName('bch_sync');
    if (!sh) { sh = db.insertSheet('bch_sync'); sh.getRange(1, 1, 1, BCH_COLS.length).setValues([BCH_COLS]); }
    return sh;
  }
  function bchRows_() {
    var v = bchSheet_().getDataRange().getValues(), out = [];
    for (var r = 1; r < v.length; r += 1) { if (!v[r][0]) continue; var o = { _row: r + 1 }; BCH_COLS.forEach(function (k, i) { o[k] = cellString(v[r][i]); }); out.push(o); }
    return out;
  }
  function bchRecord_(kind, id, caseRow, user, text) {
    try {
      if (bchRows_().some(function (x) { return x.id === id; })) return;
      var row = { id: id, kind: kind, caseId: caseRow.id, caseName: caseRow.name, authorName: user.name, text: String(text || '').slice(0, 300), createdAt: nowIso(), notifiedAt: '', sentAt: '', sentBy: '' };
      var sh = bchSheet_();
      sh.getRange(sh.getLastRow() + 1, 1, 1, BCH_COLS.length).setNumberFormat('@').setValues([BCH_COLS.map(function (k) { return safeText(row[k]); })]);
    } catch (e) { /* ไม่ให้การบันทึกหลักล้มเพราะส่วนนี้ */ }
  }
  function bchBase_() { return props().getProperty('TRACK_BASE_URL') || 'https://tchd244-portal-next.sloth244.workers.dev'; }
  function bchLink_(x) { return bchBase_() + '/track/?case=' + encodeURIComponent(x.caseId) + (x.kind === 'entry' ? '&bch=' + encodeURIComponent(x.id) : '&bch=case'); }
  // เรียกจาก worker หลังบันทึกสำเร็จ: คืนข้อความครั้งเดียวต่อรายการ (กันซ้ำ)
  function bchClaimNotify(token, id) {
    requireUser(token);
    return withLock(function () {
      var x = bchRows_().filter(function (r) { return r.id === String(id || ''); })[0];
      if (!x || x.notifiedAt) return { send: false };
      bchSheet_().getRange(x._row, BCH_COLS.indexOf('notifiedAt') + 1).setNumberFormat('@').setValue(nowIso());
      var cases = readTable('cases').filter(function (c) { return c.id === x.caseId; })[0] || {};
      var bchName = (parseExt_(cases.ext) || {}).bchCaseName || '';
      var head = x.kind === 'entry' ? '🔔 ความคืบหน้าใหม่' : '🆕 เคสใหม่';
      var mode = bchName ? 'อัปเดตเคสใน บช.: ' + bchName : 'ยังไม่ผูกเคส บช. (รายงานคดีใหม่)';
      var text = head + '\nเคส: ' + x.caseName + '\nโดย: ' + x.authorName + '\n' + (x.text ? '“' + x.text.slice(0, 120) + (x.text.length > 120 ? '…' : '') + '”\n' : '') + mode + '\nกดเพื่อเติมระบบ บช.: ' + bchLink_(x);
      return { send: true, text: text };
    });
  }
  function listBchPending(token) {
    requireUser(token);
    return bchRows_().filter(function (x) { return !x.sentAt; }).map(function (x) { return { id: x.id, kind: x.kind, caseId: x.caseId, caseName: x.caseName, authorName: x.authorName, createdAt: x.createdAt }; });
  }
  function getBchSync(token, caseId) {
    requireUser(token);
    var m = {};
    bchRows_().forEach(function (x) { if (x.caseId === String(caseId || '')) m[x.id] = { sentAt: x.sentAt, sentBy: x.sentBy }; });
    return m;
  }
  function markBchSent(token, id, sent, caseId) {
    var user = requireUser(token);
    return withLock(function () {
      var x = bchRows_().filter(function (r) { return r.id === String(id || ''); })[0];
      if (!x) {
        if (!sent) return { ok: true };
        var c = findCase(String(caseId || ''));
        bchRecord_(String(id).indexOf('case') === 0 ? 'case' : 'entry', String(id), c, user, '');
        x = bchRows_().filter(function (r) { return r.id === String(id || ''); })[0];
        if (!x) throw new Error('บันทึกสถานะไม่สำเร็จ');
      }
      bchSheet_().getRange(x._row, BCH_COLS.indexOf('sentAt') + 1, 1, 2).setNumberFormat('@').setValues([[sent ? nowIso() : '', sent ? user.name : '']]);
      writeLog(user, sent ? 'bch-sent' : 'bch-unsent', String(id));
      return { ok: true, sentAt: sent ? nowIso() : '', sentBy: sent ? user.name : '' };
    });
  }
  // สรุปรายสัปดาห์ (เรียกจาก cron ของ worker) ต้องมีคีย์ตรงกับ Script Property BCH_CRON_KEY
  function bchWeekly(key) {
    var want = props().getProperty('BCH_CRON_KEY');
    if (!want || String(key || '') !== want) throw new Error('ไม่อนุญาต');
    var list = bchRows_().filter(function (x) { return !x.sentAt; });
    if (!list.length) return { send: false, count: 0 };
    var lines = list.slice(0, 25).map(function (x, i) { return (i + 1) + '. ' + x.caseName + ' (' + (x.kind === 'entry' ? 'ความคืบหน้า' : 'เคสใหม่') + ' ' + String(x.createdAt).slice(0, 10) + ' โดย ' + x.authorName + ')\n' + bchLink_(x); });
    return { send: true, count: list.length, text: '📋 สรุปรายการที่ยังไม่ได้ส่ง บช. (' + list.length + ' รายการ)\n\n' + lines.join('\n') + (list.length > 25 ? '\n…และอีก ' + (list.length - 25) + ' รายการ' : '') };
  }
  function bchSetCronKey(token, key) {
    var user = requireUser(token);
    if (user.role !== 'boss' && user.id !== 'u-nattawut') throw new Error('ไม่อนุญาต');
    if (props().getProperty('BCH_CRON_KEY')) return { ok: true, already: true };
    if (!/^[a-f0-9]{32,}$/.test(String(key || ''))) throw new Error('คีย์ไม่ถูกต้อง');
    props().setProperty('BCH_CRON_KEY', String(key));
    return { ok: true };
  }
  // ===== ดึงข้อมูล บช. เฉพาะเมื่อกดปุ่มอัปเดตข้อมูลของเคสนั้น (อ่านอย่างเดียว, จับคู่ด้วย bchCaseId) =====
  var BCH_DEFAULT_MAP = { 'case-162000': 'A003-260213', 'case-15487498': 'A061-261001' };
  var BCH_PHOTO_FIELDS = { 'รูปผู้ต้องหา': 'suspect', 'รูปของกลาง': 'evidence', 'รูปรถ': 'vehicle', 'รูปภาพ (หัวหน้า)': 'leader', 'รูปภาพ (ผู้รายงาน)': 'reporter', 'ไฟล์ Timeline': 'timeline', 'ตราสัญลักษณ์': 'symbol' };
  var BCH_DATA_COLS = ['caseId', 'bchCaseId', 'pulledAt', 'hash', 'snapshot', 'files'];
  var BCH_HIST_COLS = ['at', 'caseId', 'bchCaseId', 'changed', 'bchUpdated', 'hash', 'newFiles', 'snapshot'];
  function bchTab_(name, cols) {
    var db = openDb(), sh = db.getSheetByName(name);
    if (!sh) { sh = db.insertSheet(name); sh.getRange(1, 1, 1, cols.length).setValues([cols]); }
    return sh;
  }
  function bchKeyOk_(key) { var k = props().getProperty('BCH_SYNC_KEY'); if (!k || String(key || '') !== k) throw new Error('คีย์ไม่ถูกต้อง'); }
  function bchMapFor_(caseRow) { return String(parseExt_(caseRow.ext).bchCaseId || BCH_DEFAULT_MAP[caseRow.id] || ''); }
  function bchDataRow_(caseId) {
    var sh = bchTab_('bch_data', BCH_DATA_COLS), v = sh.getDataRange().getValues();
    for (var r = 1; r < v.length; r += 1) if (String(v[r][0]) === caseId) {
      var o = { _row: r + 1 }; BCH_DATA_COLS.forEach(function (k, i) { o[k] = String(v[r][i] || ''); }); return o;
    }
    return null;
  }
  function bchSetKey(key) { // เรียกจาก box ครั้งแรก: ตั้งได้ครั้งเดียว
    if (props().getProperty('BCH_SYNC_KEY')) return { ok: true, already: true };
    if (!/^[A-Za-z0-9]{32,}$/.test(String(key || ''))) throw new Error('คีย์สั้นเกินไป');
    props().setProperty('BCH_SYNC_KEY', String(key)); return { ok: true };
  }
  function bchReadReq_() {
    try { return JSON.parse(props().getProperty('BCH_SYNC_REQ') || 'null'); } catch (e) { return null; }
  }
  function bchWriteReq_(cur) { props().setProperty('BCH_SYNC_REQ', JSON.stringify(cur)); }
  function bchKnownIndex_() {
    var v = bchTab_('bch_data', BCH_DATA_COLS).getDataRange().getValues(), out = [];
    for (var r = 1; r < v.length; r += 1) {
      if (!v[r][0]) continue;
      var snap = {}, files = {};
      try { snap = JSON.parse(v[r][4] || '{}'); } catch (e) { snap = {}; }
      try { files = JSON.parse(v[r][5] || '{}'); } catch (e2) { files = {}; }
      out.push({ caseId: String(v[r][0]), bchCaseId: String(v[r][1]), updated: String(snap.updated || ''), contentHash: String(snap.contentHash || ''), files: Object.keys(files) });
    }
    return out;
  }
  function bchQueuedItems_() {
    var items = {};
    readTable('cases').forEach(function (c) {
      var mapped = bchMapFor_(c);
      if (mapped) items[c.id] = { state: 'queued', bch: mapped };
    });
    return items;
  }
  function bchRequestSync(token, caseId, force) { return bchRequestSync_(requireUser(token), caseId, force); }
  function bchRequestSync_(user, caseId, force) {
    return { reqId: '', disabled: true, count: 0 };
  }
  function bchKick(key) {
    bchKeyOk_(key);
    return { ok: true, pulled: false, reason: 'manual-only' };
  }
  function bchSyncStatus(token, reqId) {
    requireUser(token);
    var cur = bchReadReq_();
    if (!cur || cur.id !== reqId) return { done: true, ok: false, err: 'คำขอหมดอายุ' };
    return { done: !!cur.doneAt, ok: !!cur.ok, err: cur.err || '', picked: !!cur.pickedAt };
  }
  function bchSyncProgress(token, reqId) {
    requireUser(token);
    var cur = bchReadReq_();
    if (!cur || cur.id !== reqId) return { done: true, ok: false, err: 'คำขอหมดอายุ', items: [] };
    var items = Object.keys(cur.items || {}).map(function (id) {
      var it = cur.items[id] || {};
      return { caseId: id, state: it.state || 'queued', changed: !!it.changed };
    });
    return { done: !!cur.doneAt, ok: cur.doneAt ? !!cur.ok : true, err: cur.err || '', items: items };
  }
  function bchMarkItem_(reqId, caseId, state, changed) {
    var cur = bchReadReq_();
    if (!cur || cur.id !== reqId || !caseId) return;
    cur.items = cur.items || {};
    if (!cur.items[caseId]) cur.items[caseId] = {};
    cur.items[caseId].state = state;
    if (changed != null) cur.items[caseId].changed = !!changed;
    bchWriteReq_(cur);
  }
  function bchSyncMark(key, reqId, caseId, state) {
    bchKeyOk_(key);
    var allowed = { done: 1, unchanged: 1, absent: 1, error: 1 };
    if (!allowed[state]) state = 'done';
    bchMarkItem_(reqId, String(caseId || ''), state, state === 'done');
    return { ok: true };
  }
  function bchSyncPending(key, force) {
    bchKeyOk_(key);
    return { pending: false };
  }
  function bchSyncFail(key, reqId, err) {
    bchKeyOk_(key);
    var cur = bchReadReq_();
    if (cur && cur.id === reqId) { cur.doneAt = nowIso(); cur.ok = false; cur.err = String(err || '').slice(0, 200); bchWriteReq_(cur); }
    return { ok: true };
  }
  function bchFindCases_(full) {
    var short = String(full || '').split('-').slice(0, 2).join('-');
    return readTable('cases').filter(function (c) { var m = bchMapFor_(c); return m && (m === short || m === full); });
  }
  function bchSyncIngestOne(key, reqId, payload) {
    bchKeyOk_(key);
    var p = typeof payload === 'string' ? JSON.parse(payload) : payload;
    var full = String(p.bchCaseId || '');
    return withLock(function () {
      var crs = bchFindCases_(full);
      if (crs.length !== 1) return { ok: true, skipped: crs.length ? 'ผูกกับหลายเคส' : 'ไม่มีเคสที่ผูก', bch: full, caseIds: crs.map(function (c) { return c.id; }) };
      var cr = crs[0], short = full.split('-').slice(0, 2).join('-'), blobs = p.blobs || {};
      if (p.unchanged && !Object.keys(blobs).length) {
        bchMarkItem_(reqId, cr.id, 'unchanged', false);
        return { ok: true, caseId: cr.id, unchanged: true };
      }
      var res = bchIngestCase_(cr, short, p.ongoing || {}, p.dash || {}, blobs, p.contentHash);
      delete res.snap;
      bchMarkItem_(reqId, cr.id, 'done', !!res.changed);
      return { ok: true, caseId: cr.id, result: res };
    });
  }
  function bchReadRender_() {
    try { return JSON.parse(props().getProperty('BCH_RENDER_REQ') || 'null'); } catch (e) { return null; }
  }
  function bchWriteRender_(cur) { props().setProperty('BCH_RENDER_REQ', JSON.stringify(cur)); }
  function bchRequestRender(token, caseId, kind) {
    var user = requireUser(token);
    if (kind !== 'progress' && kind !== 'suep') throw new Error('ไม่รู้จักชนิดไฟล์');
    var caseRow = findCase(String(caseId || ''));
    var cur = bchReadRender_();
    if (cur && !cur.doneAt && cur.caseId === caseRow.id && cur.kind === kind && Date.now() - cur.ms < 3 * 60 * 1000) return { reqId: cur.id };
    var req = { id: newId('brn'), ms: Date.now(), at: nowIso(), by: user.name, caseId: caseRow.id, kind: kind };
    bchWriteRender_(req);
    return { reqId: req.id };
  }
  function bchRenderStatus(token, reqId) {
    requireUser(token);
    var cur = bchReadRender_();
    if (!cur || cur.id !== reqId) return { done: true, ok: false, err: 'คำขอหมดอายุ' };
    return { done: !!cur.doneAt, ok: !!cur.ok, err: cur.err || '' };
  }
  function bchRenderDone(key, reqId) {
    bchKeyOk_(key);
    var cur = bchReadRender_();
    if (cur && cur.id === reqId) { cur.doneAt = nowIso(); cur.ok = true; bchWriteRender_(cur); }
    return { ok: true };
  }
  function bchRenderFail(key, reqId, err) {
    bchKeyOk_(key);
    var cur = bchReadRender_();
    if (cur && cur.id === reqId) { cur.doneAt = nowIso(); cur.ok = false; cur.err = String(err || '').slice(0, 200); bchWriteRender_(cur); }
    return { ok: true };
  }
  function bchReadUpdate_() {
    try { return JSON.parse(props().getProperty('BCH_UPDATE_REQ') || 'null'); } catch (e) { return null; }
  }
  function bchWriteUpdate_(cur) { props().setProperty('BCH_UPDATE_REQ', JSON.stringify(cur)); }
  function bchRequestUpdate(token, caseId) {
    var user = requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    var bchId = bchMapFor_(caseRow);
    if (!bchId) throw new Error('เคสนี้ยังไม่ได้ผูก bchCaseId จึงไม่ดึงข้อมูล');
    var cur = bchReadUpdate_();
    if (cur && !cur.doneAt && cur.caseId === caseRow.id && Date.now() - cur.ms < 4 * 60 * 1000) return { reqId: cur.id, joined: true, bchCaseId: bchId };
    var index = bchKnownIndex_().filter(function (row) { return row.caseId === caseRow.id; });
    var req = { id: newId('bup'), ms: Date.now(), at: nowIso(), by: user.name, caseId: caseRow.id, bchCaseId: bchId, index: index };
    bchWriteUpdate_(req);
    return { reqId: req.id, bchCaseId: bchId };
  }
  function bchUpdateStatus(token, reqId) {
    requireUser(token);
    var cur = bchReadUpdate_();
    if (!cur || cur.id !== reqId) return { done: true, ok: false, err: 'คำขอหมดอายุ', files: [] };
    var files = [];
    if (cur.doneAt && cur.ok) {
      try { files = caseOutputFiles_(findCase(cur.caseId)); } catch (err) { files = []; }
    }
    return { done: !!cur.doneAt, ok: cur.doneAt ? !!cur.ok : true, err: cur.err || '', files: files };
  }
  function bchUpdateDone(key, reqId) {
    bchKeyOk_(key);
    var cur = bchReadUpdate_();
    if (cur && cur.id === reqId) { cur.doneAt = nowIso(); cur.ok = true; delete cur.err; bchWriteUpdate_(cur); }
    return { ok: true };
  }
  function bchUpdateFail(key, reqId, err) {
    bchKeyOk_(key);
    var cur = bchReadUpdate_();
    if (cur && cur.id === reqId) { cur.doneAt = nowIso(); cur.ok = false; cur.err = String(err || '').slice(0, 200); bchWriteUpdate_(cur); }
    return { ok: true };
  }
  function bchWorkPending(key) {
    bchKeyOk_(key);
    var job = bchReadUpdate_();
    if (job && !job.doneAt) {
      if (!job.pickedAt) { job.pickedAt = nowIso(); bchWriteUpdate_(job); }
      return { kind: 'update', reqId: job.id, caseId: job.caseId, bchCaseId: job.bchCaseId, index: job.index || [] };
    }
    return { kind: 'idle' };
  }
  function bchFileId_(u) { var m = String(u || '').match(/(?:id=|\/d\/)([A-Za-z0-9_-]{20,})/); return m ? m[1] : ''; }
  function bchIngestCase_(caseRow, bchId, ongo, dash, blobs, contentHash) {
    var folderId = caseRow.driveFolderId;
    if (!folderId) throw new Error('เคส ' + caseRow.id + ' ไม่มี driveFolderId');
    var folder = DriveApp.getFolderById(folderId);
    var row = bchDataRow_(caseRow.id);
    var files = {}; try { files = JSON.parse(row && row.files || '{}'); } catch (e) { files = {}; }
    var ext = parseExt_(caseRow.ext); (ext.bchFiles || []).forEach(function (f) { if (f && f.id && !files[f.id]) files[f.id] = f; });
    var newFiles = [], photos = {};
    Object.keys(BCH_PHOTO_FIELDS).forEach(function (field) {
      var fid = bchFileId_(dash && dash[field]); if (!fid) return;
      var type = BCH_PHOTO_FIELDS[field];
      if (!files[fid]) {
        var b64 = (blobs || {})[fid]; if (!b64) { console.log('bch photo missing ' + fid); return; }
        var mime = b64.mime || 'application/octet-stream', blob = Utilities.newBlob(Utilities.base64Decode(b64.data), mime, 'x');
        var extn = /png/.test(mime) ? '.png' : /pdf/.test(mime) ? '.pdf' : /jpe?g/.test(mime) ? '.jpg' : '';
        var saved = folder.createFile(blob.setName('BCH_' + type + '_' + fid.slice(0, 8) + extn));
        files[fid] = { id: fid, type: type, field: field, savedId: saved.getId(), name: saved.getName(), mime: mime, at: nowIso() };
        newFiles.push(files[fid].name);
      }
      photos[type] = files[fid].savedId;
    });
    var sortedF = {}; Object.keys(ongo).sort().forEach(function (k) { sortedF[k] = ongo[k]; });
    var snap = { bchCaseId: String(ongo.caseId || bchId), fields: sortedF, updated: String(dash && dash['อัปเดตล่าสุด'] || ''), reporter: [dash && dash['ยศ (ผู้รายงาน)'], dash && dash['ชื่อ (ผู้รายงาน)'], dash && dash['สกุล (ผู้รายงาน)']].filter(function (x) { return x && x !== '-'; }).join(' '), caseType: String(dash && dash['ประเภทคดี'] || ''), photos: photos };
    if (contentHash) snap.contentHash = String(contentHash);
    else if (row) { try { var prevSnap = JSON.parse(row.snapshot || '{}'); if (prevSnap.contentHash) snap.contentHash = prevSnap.contentHash; } catch (e2) { /* keep empty */ } }
    var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(snap), Utilities.Charset.UTF_8));
    // hash รวมข้อมูล บช. + บันทึกของเรา (เก็บในคอลัมน์ hash เพื่อให้ v61 ยังใช้ได้)
    var local = bchCaseLocal_(caseRow.id);
    var fh = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, hash + JSON.stringify(local) + 'r4', Utilities.Charset.UTF_8));
    hash = fh;
    var changed = !row || row.hash !== hash;
    var now = nowIso(), sh = bchTab_('bch_data', BCH_DATA_COLS);
    var vals = [caseRow.id, bchId, now, hash, JSON.stringify(snap), JSON.stringify(files)].map(safeText);
    if (row) sh.getRange(row._row, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
    var hs = bchTab_('bch_history', BCH_HIST_COLS);
    hs.getRange(hs.getLastRow() + 1, 1, 1, BCH_HIST_COLS.length).setNumberFormat('@').setValues([[now, caseRow.id, bchId, changed ? 'yes' : 'no', snap.updated, hash, newFiles.join(','), changed ? JSON.stringify(snap) : ''].map(safeText)]);
    // ผูก ext.bchCaseId และ ext.bchFiles (ไม่ลบช่องเดิม)
    ext.bchCaseId = bchId; ext.bchFiles = Object.keys(files).map(function (k) { return { id: k, type: files[k].type, savedId: files[k].savedId }; });
    ensureExtCol('cases'); update('cases', caseRow.id, { ext: JSON.stringify(ext) });
    props().setProperty('BCH_FH_' + caseRow.id, fh);
    var need = function (k) { var st = null; try { st = JSON.parse(props().getProperty(k + caseRow.id) || 'null'); } catch (e) { st = null; } return !st || st.hash !== fh; };
    return { caseId: caseRow.id, caseName: caseRow.name, changed: changed, newFiles: newFiles, hash: fh, needPdf: need('BPDF_'), needSuep: need('BSUEP_'), snap: snap };
  }
  function bchSyncIngest(key, reqId, payload) {
    bchKeyOk_(key);
    var p = typeof payload === 'string' ? JSON.parse(payload) : payload;
    var out = [];
    withLock(function () {
      var cases = readTable('cases');
      (p.ongoing || []).forEach(function (o) {
        var full = String(o.caseId || ''), short = full.split('-').slice(0, 2).join('-');
        var crs = cases.filter(function (c) { return bchMapFor_(c) && (bchMapFor_(c) === short || bchMapFor_(c) === full); });
        if (crs.length > 1) { out.push({ bch: full, skipped: 'ผูกกับหลายเคส: ' + crs.map(function (c) { return c.id; }).join(',') }); return; }
        var cr = crs[0];
        if (!cr) { out.push({ bch: full, skipped: 'ไม่มีเคสที่ผูก' }); return; }
        var d = (p.dash || []).filter(function (r) { return String(r[''] || r['รหัสคดี'] || '') === full; })[0] || {}; // จับคู่ด้วยรหัสคดี บช. เท่านั้น ห้ามจับด้วยชื่อ
        out.push(bchIngestCase_(cr, short, o, d, p.blobs));
      });
      writeLog({ id: 'box', name: 'bch-sync' }, 'bch-pull', JSON.stringify(out).slice(0, 480));
    });
    return { ok: true, results: out };
  }
  function bchCaseLocal_(caseId) {
    var ent = readTable('entries').filter(function (e) { return e.caseId === caseId; }).map(function (e) {
      return { id: e.id, entryDate: cellString(e.entryDate), eventTime: cellString(e.eventTime), text: String(e.text || ''), stage: String(e.stage || ''), people: String(e.people || ''), phones: String(e.phones || ''), plates: String(e.plates || ''), photoIds: String(e.photoIds || ''), authorName: String(e.authorName || ''), createdAt: cellString(e.createdAt) };
    }).sort(function (a, b) { return (a.entryDate + a.eventTime + a.createdAt) < (b.entryDate + b.eventTime + b.createdAt) ? -1 : 1; });
    var tg = readTable('targets').filter(function (t) { return t.caseId === caseId; }).map(function (t) {
      return { id: t.id, name: String(t.name || ''), nickname: String(t.nickname || ''), phones: String(t.phones || ''), address: String(t.address || ''), roleNotes: String(t.roleNotes || ''), outcome: String(t.outcome || ''), photoId: String(t.photoId || '') };
    });
    return { entries: ent, targets: tg };
  }
  // box ดึงข้อมูลเคสของเรา + รูป (data URL) ไปสร้างไฟล์ — อ่านอย่างเดียว
  function bchCaseBundle(key, caseId) {
    bchKeyOk_(key);
    var caseRow = findCase(String(caseId || ''));
    var local = bchCaseLocal_(caseRow.id), ph = { entries: {}, targets: {}, bch: {} };
    local.entries.forEach(function (e) { if (e.photoIds) ph.entries[e.id] = e.photoIds.split(',').map(cachedDataUrl).filter(Boolean); });
    local.targets.forEach(function (t) { if (t.photoId) { var u = cachedDataUrl(t.photoId); if (u) ph.targets[t.id] = u; } });
    var row = bchDataRow_(caseRow.id), snap = {}; try { snap = JSON.parse(row && row.snapshot || '{}'); } catch (e) {}
    Object.keys(snap.photos || {}).forEach(function (t) { var u = cachedDataUrl(snap.photos[t]); if (u) ph.bch[t] = u; });
    // แหล่งเดียวกับหน้าเว็บ (getCase): ลำดับบันทึก + ข้อมูลบุคคล
    var data = collect(), wb = CaseLogic.buildBundle(data, caseRow.id, new Date());
    var tx = {}; data.targets.forEach(function (t) { tx[t.id] = parseExt_(t.ext); });
    (wb.targets || []).forEach(function (t) { t.ext = tx[t.id] || {}; });
    var byId = {}; local.entries.forEach(function (e) { byId[e.id] = e; });
    local.entries = (wb.entries || []).map(function (e) { var o = byId[e.id] || {}; return { id: e.id, entryDate: e.entryDate, eventTime: e.eventTime, entryDateText: e.entryDateText, text: e.text, stage: String(e.stage || ''), stageLabel: e.stageLabel, people: (e.people || []).join(', '), phones: (e.phones || []).join(', '), plates: (e.plates || []).join(', '), photoIds: o.photoIds || '', authorName: e.authorName }; });
    return { caseId: caseRow.id, caseName: caseRow.name, title: caseTitle(caseRow), ext: parseExt_(caseRow.ext), local: local, photos: ph, snap: snap, persons: casePersons_(wb, snap, data), pageCount: { entries: (wb.entries || []).length, targets: (wb.targets || []).length } };
  }
  function bchSyncDone(key, reqId) {
    bchKeyOk_(key);
    var cur = null; try { cur = JSON.parse(props().getProperty('BCH_SYNC_REQ') || 'null'); } catch (e) { cur = null; }
    if (cur && cur.id === reqId) { cur.doneAt = nowIso(); cur.ok = true; props().setProperty('BCH_SYNC_REQ', JSON.stringify(cur)); }
    return { ok: true };
  }
  function bchSavePdf(key, caseId, b64, hash, kind) {
    bchKeyOk_(key);
    var caseRow = findCase(String(caseId || ''));
    if (!caseRow.driveFolderId) throw new Error('เคสนี้ไม่มีโฟลเดอร์');
    var suep = kind === 'suep';
    var P = suep ? 'BSUEP_' : 'BPDF_', name = suep ? suepName_(caseRow) : progressName_(caseRow);
    var mime = suep ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
    var blob = Utilities.newBlob(Utilities.base64Decode(String(b64 || '')), mime, name);
    var bag = props(), st = null; try { st = JSON.parse(bag.getProperty(P + caseRow.id) || 'null'); } catch (e) { st = null; }
    var folder = DriveApp.getFolderById(caseRow.driveFolderId);
    var id = st && st.id, ok = false;
    if (id) { try { if (!DriveApp.getFileById(id).isTrashed()) { Drive.Files.update({ title: name, mimeType: mime }, id, blob); ok = true; } } catch (err) { console.log('ppdf ' + err); } }
    if (!ok) {
      id = null;
      var named = folder.getFilesByName(name);
      while (named.hasNext()) { var existing = named.next(); if (!existing.isTrashed()) { id = existing.getId(); break; } }
      if (id) { try { Drive.Files.update({ title: name, mimeType: mime }, id, blob); ok = true; } catch (err2) { console.log('ppdf name ' + err2); id = null; } }
    }
    if (!ok) id = folder.createFile(blob).getId();
    bag.setProperty(P + caseRow.id, JSON.stringify({ id: id, hash: String(hash || '') }));
    return { id: id, name: name, mime: mime };
  }
  // บันทึกสืบแยกรายครั้ง (.docx) + PDF รวม: เขียนทับไฟล์ชื่อเดิมในโฟลเดอร์เคส ไม่ลบไฟล์อื่น
  function bchSaveSuepFiles(key, caseId, files) {
    bchKeyOk_(key);
    var caseRow = findCase(String(caseId || ''));
    if (!caseRow.driveFolderId) throw new Error('เคสนี้ไม่มีโฟลเดอร์');
    var folder = DriveApp.getFolderById(caseRow.driveFolderId), list = [];
    (files || []).forEach(function (f) {
      var name = String(f.name || ''), mime = String(f.mime || 'application/octet-stream');
      if (!name) return;
      var blob = Utilities.newBlob(Utilities.base64Decode(String(f.b64 || '')), mime, name);
      var it = folder.getFilesByName(name), id = null;
      while (it.hasNext()) { var x = it.next(); if (!x.isTrashed()) { id = x.getId(); break; } }
      if (id) { try { Drive.Files.update({ title: name, mimeType: mime }, id, blob); } catch (err) { console.log('suep ' + err); id = null; } }
      if (!id) id = folder.createFile(blob).getId();
      list.push({ id: id, name: name, mime: mime });
    });
    props().setProperty('BSUEP_' + caseRow.id, JSON.stringify({ files: list, at: nowIso() }));
    return { files: list };
  }
  // ผู้ใช้อนุมัติ: ย้ายไฟล์ PDF ความคืบหน้า/บันทึกสืบ เก่าในโฟลเดอร์เคสไปถังขยะ แล้วล้างตัวชี้
  function bchTrashCasePdfs(key, caseId) {
    bchKeyOk_(key);
    var caseRow = findCase(String(caseId || '')), out = [];
    if (!caseRow.driveFolderId) return { trashed: out };
    var it = DriveApp.getFolderById(caseRow.driveFolderId).getFiles();
    while (it.hasNext()) { var f = it.next(); var n = f.getName(); if (/^(ความคืบหน้า|บันทึกสืบ)_/.test(n) && (f.getMimeType() === 'application/pdf' || /wordprocessingml/.test(f.getMimeType()) || /\.docx$/.test(n))) { f.setTrashed(true); out.push({ id: f.getId(), name: n }); } }
    props().deleteProperty('BPDF_' + caseRow.id); props().deleteProperty('BSUEP_' + caseRow.id);
    return { trashed: out };
  }
  function bchClean_(v) { v = String(v == null ? '' : v).trim(); return v === '-' ? '' : v; }
  function getBchData(token, caseId) {
    requireUser(token);
    var row = bchDataRow_(String(caseId || ''));
    if (!row) return null;
    var snap = JSON.parse(row.snapshot || '{}');
    var hs = bchTab_('bch_history', BCH_HIST_COLS).getDataRange().getValues(), hist = [];
    for (var r = 1; r < hs.length; r += 1) if (String(hs[r][1]) === row.caseId && String(hs[r][3]) === 'yes') hist.push({ at: cellString(hs[r][0]), updated: String(hs[r][4]), newFiles: String(hs[r][6]) });
    return { pulledAt: row.pulledAt, snap: snap, history: hist.slice(-10).reverse() };
  }
  function progressName_(caseRow) { return 'ความคืบหน้า_' + caseTitle(caseRow) + '.pdf'; }
  function suepName_(caseRow) { return 'บันทึกสืบ_' + caseTitle(caseRow) + '.docx'; }
  function driveFileLinks_(id, name, mime) {
    return {
      id: id,
      filename: name,
      mime: mime || 'application/octet-stream',
      url: 'https://drive.google.com/file/d/' + id + '/view',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id
    };
  }
  function caseOutputFiles_(caseRow) {
    var files = [], pdf = null, suep = null;
    try { pdf = JSON.parse(props().getProperty('BPDF_' + caseRow.id) || 'null'); } catch (e) { pdf = null; }
    if (pdf && pdf.id) files.push(driveFileLinks_(pdf.id, progressName_(caseRow), 'application/pdf'));
    try { suep = JSON.parse(props().getProperty('BSUEP_' + caseRow.id) || 'null'); } catch (e2) { suep = null; }
    if (suep && suep.files && suep.files.length) {
      suep.files.forEach(function (x) { if (x && x.id) files.push(driveFileLinks_(x.id, x.name, x.mime)); });
    } else if (suep && suep.id) {
      files.push(driveFileLinks_(suep.id, suepName_(caseRow), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    }
    return files;
  }
  function getCaseOutputFiles(token, caseId) {
    requireUser(token);
    return { files: caseOutputFiles_(findCase(String(caseId || ''))) };
  }
  function getProgressData(token, caseId, kind) {
    var user = requireUser(token);
    var caseRow = findCase(String(caseId || ''));
    var suep = kind === 'suep';
    var st = null; try { st = JSON.parse(props().getProperty((suep ? 'BSUEP_' : 'BPDF_') + caseRow.id) || 'null'); } catch (e) { st = null; }
    if (suep && st && st.files && st.files.length) {
      withLock(function () { writeLog(user, 'download-suep', caseRow.id); });
      return { files: st.files.map(function (x) { var d = readDriveFile(x.id); return { filename: x.name, mime: x.mime, base64: d ? Utilities.base64Encode(d.bytes) : '', url: 'https://drive.google.com/file/d/' + x.id + '/view' }; }) };
    }
    var f = st && st.id ? readDriveFile(st.id) : null;
    if (!f) throw new Error('ยังสร้างไฟล์ไม่เสร็จ ลองกดอีกครั้ง');
    withLock(function () { writeLog(user, suep ? 'download-suep' : 'download-progress', caseRow.id); });
    return {
      filename: suep ? suepName_(caseRow) : progressName_(caseRow),
      mime: f.mime || (suep ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
      base64: Utilities.base64Encode(f.bytes),
      url: 'https://drive.google.com/file/d/' + st.id + '/view'
    };
  }
  function UNIT_SHORT_SAFE() { return 'ร้อย ตชด.244'; }

  return {
    setup: setup,
    seedSample: seedSample,
    getMeta: getMeta,
    listUsersForPassword: listUsersForPassword,
    login: login,
    listCases: listCases,
    getCase: getCase,
    bchTrashCasePdfs: bchTrashCasePdfs,
    updateCaseExt: updateCaseExt,
    updateTargetExt: updateTargetExt,
    getCasePhotos: getCasePhotos,
    updateEntry: updateEntry,
    updateTargetOutcome: updateTargetOutcome,
    createCase: createCase,
    addEntry: addEntry,
    addTarget: addTarget,
    updateNextStep: updateNextStep,
    updateArrestLink: updateArrestLink,
    downloadSummaryPdf: downloadSummaryPdf,
    downloadCasePdf: downloadCasePdf,
    downloadCaseFile: downloadCaseFile,
    getCaseFiles: getCaseFiles,
    refreshCaseFiles: refreshCaseFiles,
    saveCombinedPdf: saveCombinedPdf,
    getPosterData: getPosterData,
    savePosterPng: savePosterPng,
    doGet: doGet,
    bchSetKey: bchSetKey, bchRequestSync: bchRequestSync, bchSyncStatus: bchSyncStatus, bchSyncProgress: bchSyncProgress, bchSyncPending: bchSyncPending, bchSyncFail: bchSyncFail, bchSyncIngest: bchSyncIngest, bchSyncIngestOne: bchSyncIngestOne, bchSyncMark: bchSyncMark, bchKick: bchKick, bchWorkPending: bchWorkPending, bchRequestUpdate: bchRequestUpdate, bchUpdateStatus: bchUpdateStatus, bchUpdateDone: bchUpdateDone, bchUpdateFail: bchUpdateFail, getCaseOutputFiles: getCaseOutputFiles, bchRequestRender: bchRequestRender, bchRenderStatus: bchRenderStatus, bchRenderDone: bchRenderDone, bchRenderFail: bchRenderFail, getBchData: getBchData, getProgressData: getProgressData, bchSyncDone: bchSyncDone, bchSavePdf: bchSavePdf, bchSaveSuepFiles: bchSaveSuepFiles, bchCaseBundle: bchCaseBundle, getCaseCard: getCaseCard,
    bchClaimNotify: bchClaimNotify, listBchPending: listBchPending, getBchSync: getBchSync, markBchSent: markBchSent, bchWeekly: bchWeekly, bchSetCronKey: bchSetCronKey
  };
})();

function setup() { return Api.setup(); }
function seedSample() { return Api.seedSample(); }
function getMeta() { return Api.getMeta(); }
function listUsersForPassword(password) { return Api.listUsersForPassword(password); }
function login(userId, password, customName) { return Api.login(userId, password, customName); }
function listCases(token, includeClosed) { return Api.listCases(token, includeClosed); }
function getCase(token, caseId) { return Api.getCase(token, caseId); }
function updateCaseExt(token, caseId, ext) { return Api.updateCaseExt(token, caseId, ext); }
function updateTargetExt(token, targetId, ext) { return Api.updateTargetExt(token, targetId, ext); }
function getCasePhotos(token, caseId) { return Api.getCasePhotos(token, caseId); }
function updateEntry(token, caseId, entryId, input) { return Api.updateEntry(token, caseId, entryId, input); }
function updateTargetOutcome(token, targetId, input) { return Api.updateTargetOutcome(token, targetId, input); }
function createCase(token, input) { return Api.createCase(token, input); }
function addEntry(token, caseId, input) { return Api.addEntry(token, caseId, input); }
function addTarget(token, caseId, input) { return Api.addTarget(token, caseId, input); }
function updateNextStep(token, caseId, text) { return Api.updateNextStep(token, caseId, text); }
function updateArrestLink(token, caseId, url) { return Api.updateArrestLink(token, caseId, url); }
function downloadSummaryPdf(token) { return Api.downloadSummaryPdf(token); }
function downloadCasePdf(token, caseId, kind) { return Api.downloadCasePdf(token, caseId, kind); }
function downloadCaseFile(token, caseId, kind) { return Api.downloadCaseFile(token, caseId, kind); }
function getCaseFiles(token, caseId) { return Api.getCaseFiles(token, caseId); }
function refreshCaseFiles(token, caseId) { return Api.refreshCaseFiles(token, caseId); }
function doGet(e) { return Api.doGet(e); }
function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }


function saveCombinedPdf(token, base64, caseIds) { return Api.saveCombinedPdf(token, base64, caseIds); }

function getPosterData(token, caseId) { return Api.getPosterData(token, caseId); }
function savePosterPng(token, caseId, base64, hash) { return Api.savePosterPng(token, caseId, base64, hash); }
function bchClaimNotify(token, id) { return Api.bchClaimNotify(token, id); }
function listBchPending(token) { return Api.listBchPending(token); }
function getBchSync(token, caseId) { return Api.getBchSync(token, caseId); }
function markBchSent(token, id, sent, caseId) { return Api.markBchSent(token, id, sent, caseId); }
function bchWeekly(key) { return Api.bchWeekly(key); }
function bchSetCronKey(token, key) { return Api.bchSetCronKey(token, key); }

function bchSetKey(key) { return Api.bchSetKey(key); }
function bchRequestSync(token, caseId, force) { return Api.bchRequestSync(token, caseId, force); }
function bchSyncStatus(token, reqId) { return Api.bchSyncStatus(token, reqId); }
function bchSyncPending(key, force) { return Api.bchSyncPending(key, force); }
function bchSyncFail(key, reqId, err) { return Api.bchSyncFail(key, reqId, err); }
function bchSyncIngest(key, reqId, payload) { return Api.bchSyncIngest(key, reqId, payload); }
function getBchData(token, caseId) { return Api.getBchData(token, caseId); }
function getProgressData(token, caseId, kind) { return Api.getProgressData(token, caseId, kind); }
function bchCaseBundle(key, caseId) { return Api.bchCaseBundle(key, caseId); }
function bchTrashCasePdfs(key, caseId) { return Api.bchTrashCasePdfs(key, caseId); }
function bchSyncDone(key, reqId) { return Api.bchSyncDone(key, reqId); }
function bchSavePdf(key, caseId, b64, hash, kind) { return Api.bchSavePdf(key, caseId, b64, hash, kind); }
function bchSaveSuepFiles(key, caseId, files) { return Api.bchSaveSuepFiles(key, caseId, files); }
function getCaseCard(token, caseId) { return Api.getCaseCard(token, caseId); }
function bchSyncProgress(token, reqId) { return Api.bchSyncProgress(token, reqId); }
function bchSyncIngestOne(key, reqId, payload) { return Api.bchSyncIngestOne(key, reqId, payload); }
function bchSyncMark(key, reqId, caseId, state) { return Api.bchSyncMark(key, reqId, caseId, state); }
function bchKick(key) { return Api.bchKick(key); }
function bchWorkPending(key) { return Api.bchWorkPending(key); }
function bchRequestUpdate(token, caseId) { return Api.bchRequestUpdate(token, caseId); }
function bchUpdateStatus(token, reqId) { return Api.bchUpdateStatus(token, reqId); }
function bchUpdateDone(key, reqId) { return Api.bchUpdateDone(key, reqId); }
function bchUpdateFail(key, reqId, err) { return Api.bchUpdateFail(key, reqId, err); }
function getCaseOutputFiles(token, caseId) { return Api.getCaseOutputFiles(token, caseId); }
function bchRequestRender(token, caseId, kind) { return Api.bchRequestRender(token, caseId, kind); }
function bchRenderStatus(token, reqId) { return Api.bchRenderStatus(token, reqId); }
function bchRenderDone(key, reqId) { return Api.bchRenderDone(key, reqId); }
function bchRenderFail(key, reqId, err) { return Api.bchRenderFail(key, reqId, err); }
