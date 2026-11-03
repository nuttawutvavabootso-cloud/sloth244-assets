/**
 * เว็บแอพสืบสวนติดตามและขยายผล
 * กองร้อยตำรวจตระเวนชายแดนที่ 244
 *
 * ตรรกะล้วน ไม่เปิดสเปรดชีต ไม่รู้จักรหัสผ่านจริง
 * ไฟล์นี้รันได้ทั้งใน Apps Script (V8) และใน Node สำหรับหน่วยทดสอบ
 */
var CaseLogic = (function () {
  'use strict';

  var APP_NAME = 'เว็บแอพสืบสวนติดตามและขยายผล';
  var UNIT_NAME = 'กองร้อยตำรวจตระเวนชายแดนที่ 244';
  var UNIT_SHORT = 'ร้อย ตชด.244';
  var FORBIDDEN_SPREADSHEET_ID = '1dWKrHhkumOWbl-0hiNgNK2wWgQpITaJhWjL_lF_sf9k';
  var STALE_AFTER_DAYS = 14;
  var SHEET_TABS = ['cases', 'entries', 'targets', 'users', 'log'];

  var STAGES = [
    { id: 1, label: 'ได้ข่าว' },
    { id: 2, label: 'พิสูจน์ทราบตัวบุคคล' },
    { id: 3, label: 'เฝ้าติดตาม' },
    { id: 4, label: 'รวบรวมหลักฐาน/ขอหมายจับ' },
    { id: 5, label: 'จับกุมแล้ว' }
  ];

  var OUTCOMES = [
    { id: 'tracking', label: 'ยังติดตาม' },
    { id: 'caught_us', label: 'จับแล้ว-หน่วยเรา' },
    { id: 'caught_other', label: 'หน่วยอื่นจับ' },
    { id: 'dead', label: 'เสียชีวิต' }
  ];

  var THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function sha256Hex(message) {
    var bytes = (function (s) {
      var u = unescape(encodeURIComponent(s));
      var out = new Uint8Array(u.length);
      for (var i = 0; i < u.length; i++) out[i] = u.charCodeAt(i);
      return out;
    })(String(message));
    var bitLen = bytes.length * 8;
    var zeroCount = (56 - ((bytes.length + 1) % 64) + 64) % 64;
    var buf = new Uint8Array(bytes.length + 1 + zeroCount + 8);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    var view = new DataView(buf.buffer);
    var lenPos = buf.length - 8;
    view.setUint32(lenPos, Math.floor(bitLen / 0x100000000));
    view.setUint32(lenPos + 4, bitLen >>> 0);

    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    var w = new Uint32Array(64);
    var i;
    var t;
    for (i = 0; i < buf.length; i += 64) {
      for (t = 0; t < 16; t += 1) w[t] = view.getUint32(i + t * 4);
      for (t = 16; t < 64; t += 1) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0];
      var b = H[1];
      var c = H[2];
      var d = H[3];
      var e = H[4];
      var f = H[5];
      var g = H[6];
      var h = H[7];
      for (t = 0; t < 64; t += 1) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (n) {
      return ('00000000' + n.toString(16)).slice(-8);
    }).join('');
  }

  function hashPassword(password, salt) {
    return sha256Hex(String(salt) + ':' + String(password));
  }

  function verifyPassword(password, salt, expectedHash) {
    if (!salt || !expectedHash) return false;
    var got = hashPassword(password, salt);
    var expect = String(expectedHash);
    if (got.length !== expect.length) return false;
    var diff = 0;
    var i;
    for (i = 0; i < got.length; i += 1) diff |= got.charCodeAt(i) ^ expect.charCodeAt(i);
    return diff === 0;
  }

  function assertSpreadsheetAllowed(id) {
    var clean = String(id || '').trim();
    if (!clean) {
      throw new Error('ยังไม่ได้ตั้งค่ารหัสสเปรดชีต ให้ผู้ดูแลรัน setup()');
    }
    if (clean === FORBIDDEN_SPREADSHEET_ID) {
      throw new Error('ห้ามใช้สเปรดชีตของแดชบอร์ดเดิม');
    }
    return clean;
  }

  function stageById(id) {
    var n = Number(id);
    var i;
    for (i = 0; i < STAGES.length; i += 1) {
      if (STAGES[i].id === n) return STAGES[i];
    }
    return null;
  }

  function caseStage(entries) {
    var max = 0;
    (entries || []).forEach(function (entry) {
      var n = Number(entry.stage);
      if (n >= 1 && n <= 5 && n > max) max = n;
    });
    return max;
  }

  function stageClosesCase(stage) {
    return Number(stage) === 5;
  }

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? '0' + s : s;
  }

  function bangkokParts(input) {
    if (input == null || input === '') return null;
    var s = String(input);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)), hh: 0, mm: 0 };
    }
    var date = input instanceof Date ? input : new Date(s);
    if (isNaN(date.getTime())) return null;
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    var parts = fmt.formatToParts(date);
    function pick(type) {
      var found = parts.filter(function (p) { return p.type === type; })[0];
      return found ? found.value : '';
    }
    var hh = Number(pick('hour'));
    if (hh === 24) hh = 0;
    return {
      y: Number(pick('year')),
      m: Number(pick('month')),
      d: Number(pick('day')),
      hh: hh,
      mm: Number(pick('minute'))
    };
  }

  function calendarDayNumber(input) {
    var p = bangkokParts(input);
    if (!p) return null;
    return Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  }

  function daysBetween(from, to) {
    var a = calendarDayNumber(from);
    var b = calendarDayNumber(to);
    if (a == null || b == null) return 0;
    return b - a;
  }

  function formatThaiDate(input, fullYear) {
    var p = bangkokParts(input);
    if (!p) return '';
    var be = p.y + 543;
    var yearText = fullYear ? String(be) : pad2(be % 100);
    return p.d + ' ' + THAI_MONTHS[p.m - 1] + ' ' + yearText;
  }

  function formatThaiDateTime(input) {
    var p = bangkokParts(input);
    if (!p) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(input))) return formatThaiDate(input);
    return formatThaiDate(input) + ' ' + pad2(p.hh) + ':' + pad2(p.mm) + ' น.';
  }

  function oneLine(text, max) {
    var limit = max || 90;
    var line = String(text || '').split(/\r?\n/)[0].replace(/\s+/g, ' ').trim();
    if (line.length > limit) return line.slice(0, limit - 1) + '…';
    return line;
  }

  function compareEntries(a, b) {
    var byDate = String(a.entryDate || '').localeCompare(String(b.entryDate || ''));
    if (byDate) return byDate;
    var byTime = String(a.eventTime || '').localeCompare(String(b.eventTime || ''));
    if (byTime) return byTime;
    var byCreated = String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    if (byCreated) return byCreated;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function sortedEntries(entries) {
    return (entries || []).slice().sort(compareEntries);
  }

  function latestEntry(entries) {
    var list = sortedEntries(entries);
    return list.length ? list[list.length - 1] : null;
  }

  function lastUpdateIso(caseRow, entries) {
    var latest = latestEntry(entries);
    if (latest && latest.entryDate) return latest.entryDate;
    return (caseRow && caseRow.createdAt) || '';
  }

  function isStale(caseRow, entries, now) {
    if (!caseRow || caseRow.status === 'closed') return false;
    var last = lastUpdateIso(caseRow, entries);
    if (!last) return false;
    return daysBetween(last, now) > STALE_AFTER_DAYS;
  }

  function idleDays(caseRow, entries, now) {
    var last = lastUpdateIso(caseRow, entries);
    if (!last) return 0;
    var n = daysBetween(last, now);
    return n < 0 ? 0 : n;
  }

  function daysTracked(caseRow, now) {
    if (!caseRow || !caseRow.createdAt) return 0;
    var end = caseRow.status === 'closed' && caseRow.closedAt ? caseRow.closedAt : now;
    var n = daysBetween(caseRow.createdAt, end);
    return n < 0 ? 0 : n;
  }

  function daysLabel(n, status) {
    if (status === 'closed' && !n) return 'ปิดในวันเดียวกัน';
    if (!n) return 'เริ่มติดตามวันนี้';
    return 'ติดตามมา ' + n + ' วัน';
  }

  function outcomeOf(target) {
    var id = String((target || {}).outcome || '');
    if (OUTCOMES.some(function (o) { return o.id === id; })) return id;
    return isArrestedRoleRaw((target || {}).roleNotes) ? 'caught_us' : 'tracking';
  }

  function outcomeLabel(id) {
    var hit = OUTCOMES.filter(function (o) { return o.id === id; })[0];
    return hit ? hit.label : OUTCOMES[0].label;
  }

  function targetResolved(target) { return outcomeOf(target) !== 'tracking'; }

  function caseClosable(targets) {
    var list = targets || [];
    return list.length > 0 && list.every(targetResolved);
  }

  function validateOutcome(input) {
    var outcome = String(input.outcome || '');
    if (!OUTCOMES.some(function (o) { return o.id === outcome; })) throw new Error('เลือกสถานะเป้าหมาย');
    var date = String(input.outcomeDate || '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
    var note = String(input.outcomeNote || '').trim().slice(0, 500);
    return { outcome: outcome, outcomeDate: date, outcomeNote: note };
  }

  function isArrestedRoleRaw(roleNotes) {
    return /จับกุมแล้ว|ถูกจับกุม/.test(String(roleNotes || ''));
  }

  function isArrestedRole(roleNotes) {
    return /จับกุมแล้ว|ถูกจับกุม/.test(String(roleNotes || ''));
  }

  function mainTarget(targets) {
    var list = targets || [];
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (!targetResolved(list[i])) return list[i];
    }
    return list[0] || null;
  }

  function sortCases(cards) {
    return cards.slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      if (!!a.stale !== !!b.stale) return a.stale ? -1 : 1;
      if (a.stale && b.stale) return String(a.lastUpdateIso || '').localeCompare(String(b.lastUpdateIso || ''));
      return String(b.lastUpdateIso || '').localeCompare(String(a.lastUpdateIso || ''));
    });
  }

  function buildCaseCard(caseRow, entries, targets, now) {
    var stage = caseStage(entries);
    var stageInfo = stageById(stage);
    var latest = latestEntry(entries);
    var target = mainTarget(targets);
    var days = daysTracked(caseRow, now);
    var stale = isStale(caseRow, entries, now);
    return {
      id: caseRow.id,
      name: caseRow.name,
      detail: caseRow.detail || '',
      status: caseRow.status,
      statusLabel: caseRow.status === 'closed' ? 'ปิดแล้ว' : 'กำลังติดตาม',
      mainTarget: target ? target.name : 'ยังไม่ระบุเป้าหมาย',
      stage: stage,
      stageLabel: stageInfo ? stageInfo.label : 'ยังไม่บันทึกขั้น',
      lastUpdateIso: lastUpdateIso(caseRow, entries),
      lastUpdateText: latest ? formatThaiDate(latest.entryDate) : formatThaiDate(caseRow.createdAt),
      latestNote: latest ? oneLine(latest.text, 90) : 'ยังไม่มีความคืบหน้า',
      daysTracked: days,
      daysLabel: daysLabel(days, caseRow.status),
      idleDays: idleDays(caseRow, entries, now),
      stale: stale,
      nextStep: caseRow.nextStep || '',
      arrestRecordUrl: caseRow.arrestRecordUrl || '',
      openedText: formatThaiDate(caseRow.createdAt)
    };
  }

  function normalizeList(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return String(item).trim(); }).filter(Boolean).slice(0, 20);
    }
    return String(value || '')
      .split(/[,|\n]/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean)
      .slice(0, 20);
  }

  function formatNationalId(id) {
    var digits = String(id || '').replace(/\D/g, '');
    if (!/^\d{13}$/.test(digits)) return String(id || '');
    return digits[0] + '-' + digits.slice(1, 5) + '-' + digits.slice(5, 10) + '-' + digits.slice(10, 12) + '-' + digits[12];
  }

  function presentEntry(entry) {
    var stage = Number(entry.stage) || 0;
    var info = stageById(stage);
    var when = formatThaiDate(entry.entryDate);
    if (entry.eventTime) when += ' ' + entry.eventTime + ' น.';
    return {
      id: entry.id,
      entryDate: entry.entryDate,
      eventTime: entry.eventTime || '',
      photoCount: String(entry.photoIds || '').split(',').filter(function (x) { return x.trim(); }).length,
      entryDateText: when,
      createdAtText: formatThaiDateTime(entry.createdAt),
      text: entry.text || '',
      stage: stage,
      stageLabel: info ? info.label : '',
      phones: normalizeList(entry.phones),
      plates: normalizeList(entry.plates),
      people: normalizeList(entry.people),
      authorName: entry.authorName || '',
      photoSrcs: entry.photoSrcs || [],
      photoFiles: entry.photoFiles || []
    };
  }

  function presentTarget(target) {
    return {
      id: target.id,
      name: target.name || '',
      nickname: target.nickname || '',
      nationalId: String(target.nationalId || '').replace(/\D/g, ''),
      nationalIdText: formatNationalId(target.nationalId),
      birthDate: target.birthDate || '',
      birthDateText: target.birthDate ? formatThaiDate(target.birthDate, true) : '',
      address: target.address || '',
      phones: normalizeList(target.phones).join(', '),
      roleNotes: target.roleNotes || '',
      arrested: targetResolved(target),
      outcome: outcomeOf(target),
      outcomeLabel: outcomeLabel(outcomeOf(target)),
      outcomeDate: target.outcomeDate || '',
      outcomeDateText: target.outcomeDate ? formatThaiDate(target.outcomeDate) : '',
      outcomeNote: target.outcomeNote || '',
      photoSrc: target.photoSrc || '',
      photoFile: target.photoFile || '',
      ext: (function () { try { var x = JSON.parse(target.ext || '{}'); return x && typeof x === 'object' ? x : {}; } catch (e) { return {}; } })()
    };
  }

  function entriesOf(data, caseId) {
    return (data.entries || []).filter(function (entry) { return entry.caseId === caseId; });
  }

  function targetsOf(data, caseId) {
    return (data.targets || []).filter(function (target) { return target.caseId === caseId; });
  }

  function buildHome(data, now, includeClosed) {
    var cards = (data.cases || []).map(function (caseRow) {
      return buildCaseCard(caseRow, entriesOf(data, caseRow.id), targetsOf(data, caseRow.id), now);
    });
    if (!includeClosed) cards = cards.filter(function (card) { return card.status === 'open'; });
    return sortCases(cards);
  }

  function buildSummaryRows(data, now) {
    var cards = buildHome(data, now, false);
    return cards.map(function (card) {
      var targets = targetsOf(data, card.id);
      return {
        caseId: card.id,
        caseName: card.name,
        targets: targets.map(function (target) { return target.name; }).filter(Boolean).join(', ') || '—',
        stage: card.stage,
        stageLabel: card.stageLabel,
        lastUpdateText: card.lastUpdateText,
        latestNote: card.latestNote,
        daysTracked: card.daysTracked,
        daysLabel: card.daysLabel,
        nextStep: oneLine(card.nextStep, 300) || '—',
        stale: card.stale,
        idleDays: card.idleDays
      };
    });
  }

  function buildBundle(data, caseId, now) {
    var caseRow = (data.cases || []).filter(function (item) { return item.id === caseId; })[0];
    if (!caseRow) return null;
    var entries = sortedEntries(entriesOf(data, caseId));
    var targets = targetsOf(data, caseId);
    return {
      appName: APP_NAME,
      unitName: UNIT_NAME,
      unitShort: UNIT_SHORT,
      nowText: formatThaiDateTime(now),
      card: buildCaseCard(caseRow, entries, targets, now),
      entries: entries.map(presentEntry),
      targets: targets.map(presentTarget),
      closable: caseClosable(targets),
      outcomes: OUTCOMES
    };
  }

  function planRoster(existing, roster, placeholderIds) {
    var have = {};
    (existing || []).forEach(function (row) {
      have[String(row.id)] = row;
    });
    var append = [];
    var rename = [];
    (roster || []).forEach(function (person) {
      var cur = have[person.id];
      if (cur) {
        if (String(cur.name || '').trim() !== person.name) rename.push({ id: person.id, name: person.name });
        return;
      }
      append.push({ id: person.id, name: person.name, role: person.role, active: '1' });
    });
    var deactivate = [];
    (placeholderIds || []).forEach(function (id) {
      var row = have[id];
      if (row && String(row.active) !== '0') deactivate.push(id);
    });
    return { append: append, deactivate: deactivate, rename: rename };
  }

  function visibleRoster(rows, roster, placeholderIds) {
    var blocked = {};
    (placeholderIds || []).forEach(function (id) { blocked[id] = true; });
    var byId = {};
    (rows || []).forEach(function (row) {
      if (!row || blocked[row.id]) return;
      if (!String(row.name || '').trim()) return;
      byId[String(row.id)] = row;
    });
    var out = [];
    var seen = {};
    (roster || []).forEach(function (person) {
      var row = byId[person.id];
      if (!row) return;
      seen[person.id] = true;
      out.push({ id: person.id, name: person.name });
    });
    (rows || []).forEach(function (row) {
      if (!row || seen[row.id] || blocked[row.id]) return;
      if (!String(row.name || '').trim()) return;
      out.push({ id: String(row.id), name: String(row.name).trim() });
    });
    return out;
  }

  function requireText(value, label, max) {
    var text = String(value || '').trim();
    if (!text) throw new Error('กรอก' + label);
    if (text.length > max) throw new Error(label + 'ยาวกว่าที่กำหนด');
    return text;
  }

  function optionalText(value, label, max) {
    var text = String(value || '').trim();
    if (text.length > max) throw new Error(label + 'ยาวกว่าที่กำหนด');
    return text;
  }

  function validateStage(stage) {
    var info = stageById(stage);
    if (!info) throw new Error('ขั้นของคดีไม่ถูกต้อง');
    return info.id;
  }

  function validateCase(input) {
    input = input || {};
    return {
      name: requireText(input.name, 'ชื่อเคส', 200),
      detail: optionalText(input.detail, 'รายละเอียด', 2000),
      nextStep: optionalText(input.nextStep, 'ขั้นต่อไป', 1000)
    };
  }

  function validateEntry(input) {
    input = input || {};
    var text = requireText(input.text, 'ความคืบหน้า', 4000);
    var entryDate = String(input.entryDate || input.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('วันที่ไม่ถูกต้อง');
    var eventTime = String(input.eventTime || '').trim();
    if (eventTime && !/^\d{2}:\d{2}$/.test(eventTime)) throw new Error('เวลาไม่ถูกต้อง');
    var stage = validateStage(input.stage);
    var arrest = optionalText(input.arrestRecordUrl, 'ลิงก์บันทึกการจับกุม', 500);
    if (arrest && !/^https?:\/\//i.test(arrest)) throw new Error('ลิงก์บันทึกการจับกุมต้องขึ้นต้นด้วย http');
    return {
      entryDate: entryDate,
      eventTime: eventTime,
      text: text,
      stage: stage,
      phones: normalizeList(input.phones),
      plates: normalizeList(input.plates),
      people: normalizeList(input.people),
      arrestRecordUrl: stage === 5 ? arrest : ''
    };
  }

  function validateTarget(input) {
    input = input || {};
    var nationalId = String(input.nationalId || '').replace(/\D/g, '');
    if (nationalId && !/^\d{13}$/.test(nationalId)) throw new Error('เลขประจำตัวประชาชนต้องมี 13 หลัก');
    var birthDate = String(input.birthDate || '').trim();
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error('วันเกิดไม่ถูกต้อง');
    return {
      name: requireText(input.name, 'ชื่อเป้าหมาย', 200),
      nickname: optionalText(input.nickname, 'ชื่อเล่น', 100),
      nationalId: nationalId,
      birthDate: birthDate,
      address: optionalText(input.address, 'ที่อยู่', 500),
      phones: normalizeList(input.phones).join(', '),
      roleNotes: optionalText(input.roleNotes, 'บทบาท', 500)
    };
  }

  function validateNextStep(text) {
    return optionalText(text, 'ขั้นต่อไป', 1000);
  }

  function validateArrestLink(url) {
    var arrest = optionalText(url, 'ลิงก์บันทึกการจับกุม', 500);
    if (arrest && !/^https?:\/\//i.test(arrest)) throw new Error('ลิงก์บันทึกการจับกุมต้องขึ้นต้นด้วย http');
    return arrest;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sessionPayload(user, nowMs, ttlMs) {
    return {
      uid: user.id,
      name: user.name,
      role: user.role,
      exp: nowMs + ttlMs
    };
  }

  function sessionValid(payload, nowMs) {
    return !!(payload && payload.uid && payload.name && payload.exp && nowMs < payload.exp);
  }

  function safeHttpUrl(url) {
    var text = String(url || '').trim();
    if (!/^https?:\/\//i.test(text)) return '';
    return text;
  }

  return {
    APP_NAME: APP_NAME,
    UNIT_NAME: UNIT_NAME,
    UNIT_SHORT: UNIT_SHORT,
    FORBIDDEN_SPREADSHEET_ID: FORBIDDEN_SPREADSHEET_ID,
    STALE_AFTER_DAYS: STALE_AFTER_DAYS,
    SHEET_TABS: SHEET_TABS,
    STAGES: STAGES,
    OUTCOMES: OUTCOMES,
    caseClosable: caseClosable,
    validateOutcome: validateOutcome,
    outcomeOf: outcomeOf,
    sha256Hex: sha256Hex,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    assertSpreadsheetAllowed: assertSpreadsheetAllowed,
    stageById: stageById,
    caseStage: caseStage,
    stageClosesCase: stageClosesCase,
    formatThaiDate: formatThaiDate,
    formatThaiDateTime: formatThaiDateTime,
    daysBetween: daysBetween,
    oneLine: oneLine,
    latestEntry: latestEntry,
    isStale: isStale,
    daysTracked: daysTracked,
    mainTarget: mainTarget,
    sortCases: sortCases,
    buildCaseCard: buildCaseCard,
    buildHome: buildHome,
    buildSummaryRows: buildSummaryRows,
    buildBundle: buildBundle,
    planRoster: planRoster,
    visibleRoster: visibleRoster,
    presentEntry: presentEntry,
    presentTarget: presentTarget,
    normalizeList: normalizeList,
    formatNationalId: formatNationalId,
    validateCase: validateCase,
    validateEntry: validateEntry,
    validateTarget: validateTarget,
    validateNextStep: validateNextStep,
    validateArrestLink: validateArrestLink,
    escapeHtml: escapeHtml,
    sessionPayload: sessionPayload,
    sessionValid: sessionValid,
    safeHttpUrl: safeHttpUrl,
    isArrestedRole: isArrestedRole
  };
})();

if (typeof globalThis !== 'undefined') globalThis.CaseLogic = CaseLogic;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CaseLogic;
}
