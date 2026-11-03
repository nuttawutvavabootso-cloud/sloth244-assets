/**
 * เว็บแอพสืบสวนติดตามและขยายผล
 * HTML ของ PDF สรุปรวม (A4 แนวนอน) และไทม์ไลน์รายเคส
 * ฟอนต์: Sarabun / TH Sarabun New
 */
var PdfTemplates = (function () {
  'use strict';

  function logic() {
    if (typeof globalThis !== 'undefined' && globalThis.CaseLogic) return globalThis.CaseLogic;
    if (typeof CaseLogic !== 'undefined') return CaseLogic;
    if (typeof require === 'function') return require('./Logic.js');
    throw new Error('ไม่พบ CaseLogic');
  }

  function esc(value) {
    return logic().escapeHtml(value);
  }

  function stageBar(stage) {
    var html = '<div class="bar" aria-hidden="true">';
    var i;
    for (i = 1; i <= 5; i += 1) {
      html += '<span class="' + (i <= stage ? 'on' : '') + '">' + i + '</span>';
    }
    html += '</div>';
    return html;
  }

  function chips(items) {
    if (!items || !items.length) return '';
    return '<div class="chips">' + items.map(function (item) {
      return '<span>' + esc(item) + '</span>';
    }).join('') + '</div>';
  }

  function shell(title, body, extraCss) {
    return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
      '<title>' + esc(title) + '</title><style>' + BASE_CSS + (extraCss || '') +
      '</style></head><body>' + body + '</body></html>';
  }

  function tape() {
    return '<footer class="tape"><span>WARNING</span><span>DO NOT CROSS</span><span>ภายในหน่วยเท่านั้น</span><span>ห้ามเผยแพร่</span><span>' +
      esc(logic().UNIT_SHORT) + '</span></footer>';
  }

  function summaryHtml(rows, meta) {
    meta = meta || {};
    var body = '<article class="sheet">' +
      '<header class="head">' +
      (meta.logoSrc ? '<img class="logo" src="' + esc(meta.logoSrc) + '" alt="">' : '<div class="logo ph">' + esc(logic().UNIT_SHORT) + '</div>') +
      '<div><h1>' + esc(logic().APP_NAME) + '</h1>' +
      '<h2>' + esc(logic().UNIT_NAME) + '</h2>' +
      '<p>สรุปรวมเคสที่ยังติดตาม · จัดทำเมื่อ ' + esc(meta.nowText || '') + '</p></div></header>' +
      '<table><thead><tr>' +
      '<th>เคส</th><th>เป้าหมาย</th><th>ขั้น</th><th>อัปเดตล่าสุด</th><th>ขั้นต่อไป</th><th>ธง</th>' +
      '</tr></thead><tbody>';
    (rows || []).forEach(function (row) {
      body += '<tr class="' + (row.stale ? 'stale' : '') + '" data-case="' + esc(row.caseId) + '" data-stale="' + (row.stale ? '1' : '0') + '">' +
        '<td>' + esc(row.caseName) + '</td>' +
        '<td>' + esc(row.targets) + '</td>' +
        '<td>' + stageBar(row.stage) + '<div class="sub">' + esc(row.stageLabel) + '</div></td>' +
        '<td><b>' + esc(row.lastUpdateText) + '</b><div class="sub">' + esc(row.latestNote) + '</div></td>' +
        '<td>' + esc(row.nextStep) + '</td>' +
        '<td></td></tr>';
    });
    if (!rows || !rows.length) {
      body += '<tr><td colspan="6">ไม่มีเคสที่เปิดอยู่</td></tr>';
    }
    body += '</tbody></table>' +
      '<p class="legend">ขั้น: 1 ได้ข่าว · 2 พิสูจน์ทราบตัวบุคคล · 3 เฝ้าติดตาม · 4 รวบรวมหลักฐาน/ขอหมายจับ · 5 จับกุมแล้ว · แถบส้ม = เคสที่ยังเปิด</p>' +
      tape() + '</article>';
    return shell(logic().APP_NAME + ' — สรุปรวม', body, (meta.extraCss || '') + SUMMARY_CSS);
  }

  function caseHtml(bundle, meta) {
    meta = meta || {};
    if (!bundle) return shell(logic().APP_NAME, '<p>ไม่พบเคส</p>', meta.extraCss || '');
    var card = bundle.card;
    var people = (bundle.targets || []).map(function (target) {
      var photo = target.photoSrc
        ? '<img src="' + esc(target.photoSrc) + '" alt="">'
        : '<div class="nophoto">ไม่มีรูป</div>';
      return '<article class="person' + (target.arrested ? '' : ' live') + '">' + photo +
        '<div><strong>' + esc(target.name) + '</strong>' +
        (target.nickname ? '<div>ชื่อเล่น: ' + esc(target.nickname) + '</div>' : '') +
        (target.nationalIdText ? '<div>เลขประจำตัวประชาชน: ' + esc(target.nationalIdText) + '</div>' : '') +
        (target.birthDateText ? '<div>เกิด: ' + esc(target.birthDateText) + '</div>' : '') +
        (target.address ? '<div>ที่อยู่: ' + esc(target.address) + '</div>' : '') +
        (target.phones ? '<div>โทร: ' + esc(target.phones) + '</div>' : '') +
        (target.roleNotes ? '<div class="role">' + esc(target.roleNotes) + '</div>' : '') +
        '</div></article>';
    }).join('');

    var timeline = (bundle.entries || []).map(function (entry) {
      var photos = (entry.photoSrcs || []).map(function (src) {
        return '<img class="shot" src="' + esc(src) + '" alt="">';
      }).join('');
      return '<article class="step"><div class="when">' + esc(entry.entryDateText) + '</div><div class="dot"></div>' +
        '<h3>ขั้น ' + esc(entry.stage) + ' · ' + esc(entry.stageLabel) + '</h3>' +
        '<p>' + esc(entry.text) + '</p>' +
        chips(entry.phones) + chips(entry.plates) + chips(entry.people) +
        (photos ? '<div class="shots">' + photos + '</div>' : '') +
        '<p class="by">' + esc(entry.authorName) + ' · บันทึก ' + esc(entry.createdAtText) + '</p></article>';
    }).join('');

    var body = '<article class="board">' +
      '<header class="head">' +
      (meta.logoSrc ? '<img class="logo" src="' + esc(meta.logoSrc) + '" alt="">' : '<div class="logo ph">244</div>') +
      '<div class="titles"><h1>' + esc(logic().APP_NAME) + '</h1>' +
      '<h2>' + esc(logic().UNIT_NAME) + '</h2>' +
      '<p>' + esc(card.name) + '</p>' +
      (card.detail ? '<p class="detail">' + esc(card.detail) + '</p>' : '') +
      '</div></header>' +
      '<div class="cols"><section class="timeline">' + (timeline || '<p>ยังไม่มีความคืบหน้า</p>') + '</section>' +
      '<aside><section class="panel"><h3>บุคคลเป้าหมาย</h3>' + (people || '<p>ยังไม่มีเป้าหมาย</p>') + '</section>' +
      '<section class="panel"><h3>สถานะ</h3>' + stageBar(card.stage) +
      '<p class="stage-name">' + esc(card.stageLabel) + ' · ' + esc(card.statusLabel) + '</p>' +
      '<h3>ขั้นต่อไป</h3><p>' + esc(card.nextStep || '—') + '</p>' +
      '<p class="meta">' + 'อัปเดตล่าสุด ' + esc(card.lastUpdateText) + '</p>' +
      (card.arrestRecordUrl ? '<p>บันทึกการจับกุม: ' + esc(card.arrestRecordUrl) + '</p>' : '') +
      '<p class="meta">จัดทำเมื่อ ' + esc(bundle.nowText || meta.nowText || '') + '</p></section></aside></div>' +
      tape() + '</article>';
    return shell(logic().APP_NAME + ' — ' + card.name, body, (meta.extraCss || '') + CASE_CSS);
  }

  var BASE_CSS = [
    '@page { size: A4 landscape; margin: 8mm; }',
    '* { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; background: #111812; color: #f8fafc; font-family: Sarabun, "TH Sarabun New", sans-serif; }',
    'body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    'h1, h2, h3, p { margin: 0; }',
    '.head { display: flex; gap: 12px; align-items: center; padding: 10px 12px; background: linear-gradient(90deg,#1b281c,#253827 50%,#1b281c); border-bottom: 3px solid #c5a059; }',
    '.head h1 { font-size: 22px; font-weight: 800; }',
    '.head h2 { font-size: 16px; color: #f3c663; font-weight: 700; margin-top: 2px; }',
    '.head p { font-size: 13px; margin-top: 2px; }',
    '.logo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px dashed #c5a059; flex: none; }',
    '.logo.ph { display: flex; align-items: center; justify-content: center; color: #ffd700; font-size: 11px; text-align: center; background: rgba(74,20,140,.35); }',
    '.bar { display: flex; gap: 3px; }',
    '.bar span { flex: 1; text-align: center; border: 1px solid #4a6b4d; border-radius: 3px; color: #94a3b8; font-size: 10px; font-weight: 700; }',
    '.bar span.on { background: #f3c663; color: #1b1404; border-color: #f3c663; }',
    '.tape { display: flex; justify-content: space-around; align-items: center; height: 22px; margin-top: 8px;',
    'background: repeating-linear-gradient(-45deg,#eab308,#eab308 16px,#111827 16px,#111827 32px); font-weight: 800; font-size: 11px; color: #000; }',
    '.tape span { background: #eab308; padding: 0 8px; }'
  ].join('');

  var SUMMARY_CSS = [
    '.sheet { background: radial-gradient(circle at center,#1e2d1f,#0f1710); min-height: 100vh; padding-bottom: 8px; }',
    'table { width: calc(100% - 16px); margin: 8px; border-collapse: collapse; font-size: 12px; }',
    'th, td { border: 1px solid #4a6b4d; padding: 5px 6px; vertical-align: top; text-align: left; }',
    'th { background: #1b281c; color: #f3c663; }',
    'tr.stale td { background: rgba(251,146,60,.16); }',
    '.sub { color: #d6e0d2; margin-top: 3px; }',
    '.legend { padding: 0 12px 8px; color: #d6e0d2; font-size: 11px; }'
  ].join('');

  var CASE_CSS = [
    '.board { background: radial-gradient(circle at center,#1e2d1f,#0f1710); min-height: 100vh; }',
    '.detail { color: #d6e0d2; }',
    '.cols { display: grid; grid-template-columns: 1.15fr .85fr; gap: 12px; padding: 12px 12px 8px; }',
    '.timeline { position: relative; margin-left: 108px; }',
    '.timeline:before { content: ""; position: absolute; left: -18px; top: 8px; bottom: 8px; width: 3px; background: #f3c663; }',
    '.step { position: relative; background: rgba(28,45,29,.92); border: 1px solid #4a6b4d; border-radius: 8px; padding: 8px 10px; margin: 0 0 10px; }',
    '.when { position: absolute; left: -118px; width: 92px; text-align: right; font-weight: 700; font-size: 13px; }',
    '.dot { position: absolute; left: -24px; top: 12px; width: 12px; height: 12px; border-radius: 50%; background: #f3c663; border: 2px solid #111812; }',
    '.step h3 { color: #f3c663; font-size: 15px; border-bottom: 1px solid rgba(243,198,99,.4); padding-bottom: 3px; margin-bottom: 4px; }',
    '.step p { font-size: 13px; line-height: 1.45; white-space: pre-wrap; }',
    '.by { color: #d6e0d2; font-size: 11px !important; margin-top: 4px; }',
    '.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }',
    '.chips span { background: rgba(0,0,0,.35); color: #ffd700; border-left: 3px solid #f3c663; padding: 2px 6px; font-weight: 700; font-size: 12px; }',
    '.shots { display: flex; gap: 6px; margin-top: 6px; }',
    '.shot { width: 120px; height: 78px; object-fit: cover; border-radius: 6px; border: 1px solid #4a6b4d; }',
    '.panel { background: rgba(25,35,45,.92); border: 1px solid #64748b; border-radius: 8px; padding: 8px; margin-bottom: 10px; }',
    '.panel h3 { text-align: center; background: rgba(51,65,85,.8); border-radius: 4px; padding: 4px; margin-bottom: 6px; font-size: 14px; }',
    '.person { display: flex; gap: 8px; background: rgba(15,23,42,.65); border: 1px solid #475569; border-radius: 8px; padding: 6px; margin-bottom: 6px; font-size: 12px; line-height: 1.4; }',
    '.person.live { border-color: #4ade80; }',
    '.person img, .nophoto { width: 58px; height: 74px; object-fit: cover; border-radius: 4px; flex: none; background: #1e293b; }',
    '.nophoto { display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; }',
    '.person strong { color: #fde047; }',
    '.role { color: #4ade80; }',
    '.stage-name, .meta { margin-top: 6px; font-size: 13px; }'
  ].join('');

  return {
    summaryHtml: summaryHtml,
    caseHtml: caseHtml,
    stageBar: stageBar
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PdfTemplates;
}
