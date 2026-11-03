/**
 * Docx: สร้างไฟล์ Word (.docx) แบบไม่ต้องใช้สิทธิ์เพิ่ม
 * ใช้ทำบันทึกการสืบสวนรายขั้น และรายงานความคืบหน้าเคส (แปลงเป็น PDF ต่อ)
 */
var Docx = (function () {
  var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  var RED = 'C00000';
  var FULL_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var UNIT = 'กองร้อยตำรวจตระเวนชายแดนที่ 244';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
  function u8(b) { return b & 0xff; }

  function imageSize(bytes, mime) {
    if (/png/.test(mime)) {
      return { w: (u8(bytes[16]) << 24 | u8(bytes[17]) << 16 | u8(bytes[18]) << 8 | u8(bytes[19])) >>> 0,
        h: (u8(bytes[20]) << 24 | u8(bytes[21]) << 16 | u8(bytes[22]) << 8 | u8(bytes[23])) >>> 0 };
    }
    if (/jpe?g/.test(mime)) {
      var i = 2;
      while (i + 9 < bytes.length) {
        if (u8(bytes[i]) !== 0xff) { i += 1; continue; }
        var m = u8(bytes[i + 1]);
        var len = u8(bytes[i + 2]) << 8 | u8(bytes[i + 3]);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: u8(bytes[i + 5]) << 8 | u8(bytes[i + 6]), w: u8(bytes[i + 7]) << 8 | u8(bytes[i + 8]) };
        }
        i += 2 + len;
      }
    }
    return null;
  }

  function create(opt) {
    opt = opt || {};
    var font = opt.font || 'TH Sarabun New';
    var size = opt.size || 32;
    var body = [];
    var media = [];
    var picId = 0;

    function rPr(run) {
      var sz = run.sz || size;
      return '<w:rPr><w:rFonts w:ascii="' + esc(font) + '" w:hAnsi="' + esc(font) + '" w:cs="' + esc(font) + '" w:eastAsia="' + esc(font) + '"/>' +
        (run.b ? '<w:b/><w:bCs/>' : '') + (run.i ? '<w:i/><w:iCs/>' : '') + (run.u ? '<w:u w:val="single"/>' : '') +
        (run.color ? '<w:color w:val="' + run.color + '"/>' : '') +
        '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/><w:lang w:bidi="th-TH"/></w:rPr>';
    }
    function runXml(run) {
      if (typeof run === 'string') run = { t: run };
      if (run.img) return run.img;
      if (run.tab) return '<w:r>' + rPr(run) + '<w:tab/></w:r>';
      if (run.br) return '<w:r>' + rPr(run) + '<w:br/></w:r>';
      return '<w:r>' + rPr(run) + '<w:t xml:space="preserve">' + esc(run.t) + '</w:t></w:r>';
    }
    function pXml(runs, o) {
      o = o || {};
      var ppr = '<w:pPr>' + (o.keepNext ? '<w:keepNext/>' : '') + (o.keepLines ? '<w:keepLines/>' : '') +
        (o.pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
        (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="' + (o.border === true ? '000000' : o.border) + '"/></w:pBdr>' : '') +
        (o.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shade + '"/>' : '') +
        (o.tabs ? '<w:tabs>' + o.tabs.map(function (t) { return '<w:tab w:val="' + (t.align || 'left') + '" w:pos="' + t.pos + '"/>'; }).join('') + '</w:tabs>' : '') +
        '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 0 : o.after) + '"/>' +
        '<w:ind w:left="' + (o.left || 0) + '" w:right="' + (o.right || 0) + '"' + (o.first ? ' w:firstLine="' + o.first + '"' : '') + (o.hanging ? ' w:hanging="' + o.hanging + '"' : '') + '/>' +
        '<w:jc w:val="' + (o.align || 'left') + '"/>' + rPr({ sz: (o.sz || size) }) + '</w:pPr>';
      return '<w:p>' + ppr + (runs || []).map(runXml).join('') + '</w:p>';
    }
    function image(bytes, mime, maxW, maxH, crop) {
      mime = String(mime || '');
      if (!/^image\/(jpeg|png)$/.test(mime)) return null;
      var dim = imageSize(bytes, mime);
      if (!dim || !dim.w || !dim.h) return null;
      var emu = 9525;
      var c = crop || { l: 0, t: 0, r: 0, b: 0 };
      var w = dim.w * (1 - c.l - c.r) * emu;
      var h = dim.h * (1 - c.t - c.b) * emu;
      var src = crop ? '<a:srcRect l="' + Math.round(c.l * 1e5) + '" t="' + Math.round(c.t * 1e5) + '" r="' + Math.round(c.r * 1e5) + '" b="' + Math.round(c.b * 1e5) + '"/>' : '';
      var scale = Math.min(1, maxW / w, maxH / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      picId += 1;
      var ext = /png/.test(mime) ? 'png' : 'jpeg';
      var rid = 'rIdImg' + picId;
      media.push({ path: 'word/media/image' + picId + '.' + ext, bytes: bytes, rid: rid, target: 'media/image' + picId + '.' + ext });
      return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + w + '" cy="' + h + '"/>' +
        '<wp:docPr id="' + picId + '" name="Picture ' + picId + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
        '<pic:nvPicPr><pic:cNvPr id="' + picId + '" name="image' + picId + '.' + ext + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="' + rid + '"/>' + src + '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    function table(rows, widths, o) {
      o = o || {};
      var total = widths.reduce(function (a, b) { return a + b; }, 0);
      var bc = o.borderColor || '808080';
      var bv = o.noBorder ? 'nil' : 'single';
      var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
        '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
          return '<w:' + s + ' w:val="' + bv + '" w:sz="4" w:space="0" w:color="' + bc + '"/>';
        }).join('') + '</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
        '<w:tblGrid>' + widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
      rows.forEach(function (row) {
        xml += '<w:tr><w:trPr><w:cantSplit/>' + (row.header ? '<w:tblHeader/>' : '') + (row.h ? '<w:trHeight w:val="' + row.h + '" w:hRule="exact"/>' : '') + '</w:trPr>';
        row.cells.forEach(function (cell, ci) {
          var paras = cell.paras && cell.paras.length ? cell.paras : [pXml([''])];
          xml += '<w:tc><w:tcPr><w:tcW w:w="' + widths[ci] + '" w:type="dxa"/>' + (cell.shade ? '<w:shd w:val="clear" w:color="auto" w:fill="' + cell.shade + '"/>' : '') +
            '<w:vAlign w:val="' + (cell.valign || 'top') + '"/></w:tcPr>' + paras.join('') + '</w:tc>';
        });
        xml += '</w:tr>';
      });
      return xml + '</w:tbl>';
    }

    var api = {
      p: function (runs, o) { body.push(pXml(runs, o)); return api; },
      pXml: pXml,
      raw: function (xml) { body.push(xml); return api; },
      image: image,
      table: function (rows, widths, o) { body.push(table(rows, widths, o)); body.push(pXml([''], { sz: 8 })); return api; },
      files: function () {
        var m = opt.margins || { top: 1418, right: 1134, bottom: 1134, left: 1701 };
        var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '>' + (opt.bg ? '<w:background w:color="' + opt.bg + '"/>' : '') + '<w:body>' + body.join('') +
          '<w:sectPr><w:pgSz w:w="' + ((opt.page || {}).w || 11906) + '" w:h="' + ((opt.page || {}).h || 16838) + '"' + (opt.page && opt.page.w > opt.page.h ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="' + m.top + '" w:right="' + m.right + '" w:bottom="' + m.bottom + '" w:left="' + m.left + '" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
        var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:docDefaults><w:rPrDefault>' + rPr({}).replace('<w:lang w:bidi="th-TH"/>', '<w:lang w:val="th-TH" w:bidi="th-TH"/>') + '</w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
        var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          (opt.bg ? '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' : '') +
          media.map(function (f) { return '<Relationship Id="' + f.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + f.target + '"/>'; }).join('') +
          '</Relationships>';
        var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
          '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
          (opt.bg ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : '') + '</Types>';
        var root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
        var out = [
          { path: '[Content_Types].xml', text: types },
          { path: '_rels/.rels', text: root },
          { path: 'word/document.xml', text: doc },
          { path: 'word/styles.xml', text: styles },
          { path: 'word/_rels/document.xml.rels', text: rels }
        ];
        if (opt.bg) out.push({ path: 'word/settings.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:displayBackgroundShape/></w:settings>' });
        media.forEach(function (f) { out.push({ path: f.path, bytes: f.bytes }); });
        return out;
      },
      toBlob: function (name) {
        var blobs = api.files().map(function (f) {
          return f.text != null ? Utilities.newBlob(f.text, 'application/xml', f.path) : Utilities.newBlob(f.bytes, 'application/octet-stream', f.path);
        });
        var zip = Utilities.zip(blobs, name);
        return Utilities.newBlob(zip.getBytes(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name);
      }
    };
    return api;
  }

  /* ---------- วันที่ไทย ---------- */
  function parts(iso) {
    var s = String(iso || '');
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    if (/T/.test(s)) {
      var d = new Date(s);
      if (isNaN(d.getTime())) return null;
      var b = new Date(d.getTime() + 7 * 3600 * 1000);
      return { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate(), hh: b.getUTCHours(), mm: b.getUTCMinutes() };
    }
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function fullDate(iso) {
    var p = parts(iso);
    return p ? p.d + ' ' + FULL_MONTHS[p.m - 1] + ' ' + (p.y + 543) : '';
  }
  function timeText(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    return m ? (m[1].length < 2 ? '0' + m[1] : m[1]) + '.' + m[2] + ' น.' : '';
  }
  function list(s) { return String(s || '').split(/\s*,\s*/).filter(Boolean); }

  /* ---------- บันทึกการสืบสวนรายขั้น (Word) ---------- */
  function entryMemo(c, e, stageLabel, recorder, photos) {
    var d = create({ font: 'TH Sarabun New', size: 32 });
    var R = function (t) { return { t: t, color: RED }; };
    var B = function (t, sz) { return { t: t, b: true, sz: sz }; };
    var IND = 1418;
    d.p([B('บันทึกข้อความ', 58)], { align: 'center', after: 120 });
    d.p([B('ส่วนราชการ', 40), ' ชุดปฏิบัติการข่าว (ชปข.) ' + UNIT], { border: true, after: 60 });
    d.p([B('ที่', 40), ' ', R('ตชด.244 (ชปข.)/.............'), { tab: true }, B('วันที่', 40), ' ' + fullDate(e.createdAt)], { tabs: [{ pos: 4536 }], border: true, after: 60 });
    d.p([B('เรื่อง', 40), ' รายงานผลการสืบสวน กรณี' + c.name], { border: true, after: 200 });
    d.p([B('เรียน'), ' ', R('ผบ.ร้อย ตชด.244')], { after: 200 });
    d.p(['ตามที่ ชุดปฏิบัติการข่าว ' + UNIT + ' ได้ดำเนินการสืบสวนติดตามกรณี' + c.name + ' นั้น'], { first: IND, align: 'thaiDistribute' });
    var when = 'เมื่อวันที่ ' + fullDate(e.entryDate) + (e.eventTime ? ' เวลา ' + timeText(e.eventTime) : '');
    d.p(['บัดนี้ ได้ดำเนินการสืบสวนในขั้นที่ ' + e.stage + ' (' + stageLabel + ') ' + when + ' ผลการสืบสวนปรากฏดังนี้'], { first: IND, align: 'thaiDistribute', after: 60 });
    String(e.text || '').split(/\r?\n/).filter(function (l) { return l.trim(); }).forEach(function (line) {
      d.p([line.trim()], { first: IND, align: 'thaiDistribute' });
    });
    var n = 0;
    var facts = [];
    if (list(e.people).length) facts.push(['บุคคลที่เกี่ยวข้อง', list(e.people).join(', ')]);
    if (list(e.phones).length) facts.push(['หมายเลขโทรศัพท์ที่เกี่ยวข้อง', list(e.phones).join(', ')]);
    if (list(e.plates).length) facts.push(['ทะเบียนรถที่เกี่ยวข้อง', list(e.plates).join(', ')]);
    if (facts.length) {
      d.p(['ข้อมูลที่ตรวจพบ'], { first: IND, before: 120 });
      facts.forEach(function (f) { n += 1; d.p([n + '. ' + f[0] + ' : ' + f[1]], { left: IND + 284, hanging: 284 }); });
    }
    var shots = (photos || []).filter(Boolean);
    if (shots.length) {
      d.p(['ภาพถ่ายประกอบ จำนวน ' + shots.length + ' ภาพ (จัดเก็บต้นฉบับไว้ในโฟลเดอร์เคส)'], { first: IND, before: 120, keepNext: true });
      shots.forEach(function (ph, i) {
        var img = d.image(ph.bytes, ph.mime, 4.2 * 914400, 3.2 * 914400);
        if (img) d.p([{ img: img }], { align: 'center', before: 80, keepNext: true });
        d.p([{ t: 'ภาพที่ ' + (i + 1) + ' : ' + ph.name, sz: 26 }], { align: 'center', after: 60 });
      });
    }
    d.p(['จึงเรียนมาเพื่อโปรดทราบ'], { first: IND, before: 200, after: 480 });
    var sig = { left: 3969, align: 'center', keepNext: true };
    d.p(['(ลงชื่อ) ..................................................'], sig);
    d.p(recorder ? ['( ' + recorder + ' )'] : ['( ', R('.................................................. ยังไม่ระบุชื่อผู้บันทึก'), ' )'], sig);
    d.p(['ตำแหน่ง ', R('..................................................')], sig);
    d.p(['ผู้บันทึก'], { left: 3969, align: 'center' });
    d.p([{ t: 'ข้อความสีแดง = ยังไม่ได้ยืนยัน ให้ตรวจแก้ก่อนใช้งาน · สร้างจากระบบติดตามเคส เมื่อ ' + fullDate(e.createdAt) + (parts(e.createdAt) ? ' ' + timeText(('0' + parts(e.createdAt).hh).slice(-2) + ':' + ('0' + parts(e.createdAt).mm).slice(-2)) : ''), sz: 22, color: '7F7F7F' }], { before: 480 });
    return d;
  }

  function isCaught(t) { return /^caught/.test(String((t || {}).outcome || '')); }
  function arrestBand(d, sz) {
    return d.pXml([{ t: 'จับกุมแล้ว', b: true, sz: sz, color: 'FFFFFF' }], { align: 'center', shade: 'DC2626' });
  }

  /* ---------- รายงานความคืบหน้าเคส (แปลงเป็น PDF) ---------- */
  function caseReport(b) {
    var d = create({ font: 'Sarabun', size: 26, margins: { top: 1134, right: 1021, bottom: 1021, left: 1134 } });
    var GREEN = '1E7B34';
    var AMBER = 'B45309';
    d.p([{ t: UNIT, b: true, sz: 34 }], { align: 'center' });
    d.p([{ t: 'ชุดปฏิบัติการข่าว (ชปข.)', sz: 26 }], { align: 'center', border: '1F3B2D', after: 160 });
    d.p([{ t: 'รายงานความคืบหน้าการสืบสวนติดตาม', b: true, sz: 36 }], { align: 'center', after: 120 });
    var c = b.caseRow;
    var rowsInfo = [
      ['ชื่อเคส', c.name || ''],
      ['สถานะ', (c.status === 'closed' ? 'ปิดเคสแล้ว' : 'กำลังติดตาม') + (b.stageText ? ' · ขั้นล่าสุด: ' + b.stageText : '')],
      ['เปิดเคสเมื่อ', fullDate(c.createdAt) + (c.status === 'closed' && c.closedAt ? ' · ปิดเมื่อ ' + fullDate(c.closedAt) : '')],
      ['รายละเอียด', c.detail || '-'],
      ['ขั้นต่อไป', c.nextStep || '-']
    ];
    d.table(rowsInfo.map(function (r) {
      return { cells: [{ shade: 'EEF3EF', paras: [d.pXml([{ t: r[0], b: true }])] }, { paras: [d.pXml([r[1]])] }] };
    }), [2000, 7751]);
    d.p([{ t: '1. เป้าหมาย (' + b.targets.length + ' ราย)', b: true, sz: 30 }], { before: 160, after: 80, keepNext: true, border: 'A0A0A0' });
    if (!b.targets.length) d.p(['- ยังไม่มีเป้าหมาย -']);
    b.targets.forEach(function (t, i) {
      var dim = t.photo ? imageSize(t.photo.bytes, t.photo.mime) : null;
      var isRegistry = dim && dim.w >= 800 && dim.h / dim.w > 1.33 && dim.h / dim.w < 1.5;
      var img = t.photo ? d.image(t.photo.bytes, t.photo.mime, 1.25 * 914400, 1.6 * 914400, isRegistry ? { l: 0.36, t: 0.085, r: 0.38, b: 0.745 } : null) : null;
      var resolved = t.outcome && t.outcome !== 'tracking';
      var lines = [d.pXml([{ t: (i + 1) + '. ' + t.name + (t.nickname ? ' (' + t.nickname + ')' : ''), b: true, sz: 28 }])];
      lines.push(d.pXml([{ t: 'สถานะ: ', b: true }, { t: t.outcomeLabel + (t.outcomeDateText ? ' (' + t.outcomeDateText + ')' : ''), b: true, color: resolved ? GREEN : AMBER }, t.outcomeNote ? ' · ' + t.outcomeNote : '']));
      [['เลขบัตร', t.nationalIdText], ['เกิด', t.birthDateText], ['ที่อยู่', t.address], ['โทร', t.phones], ['บทบาท/หมายเหตุ', t.roleNotes]].forEach(function (f) {
        if (f[1]) lines.push(d.pXml([{ t: f[0] + ': ', b: true }, String(f[1])]));
      });
      d.table([{ cells: [{ valign: 'center', paras: [d.pXml(img ? [{ img: img }] : [{ t: 'ไม่มีรูป', color: '7F7F7F', sz: 22 }], { align: 'center' })].concat(img && isCaught(t) ? [arrestBand(d, 22)] : []) }, { paras: lines }] }], [2000, 7751]);
    });
    d.p([{ t: '2. ลำดับเหตุการณ์ (Timeline) ' + b.entries.length + ' รายการ', b: true, sz: 30 }], { before: 160, after: 80, keepNext: true, border: 'A0A0A0' });
    if (!b.entries.length) d.p(['- ยังไม่มีบันทึก -']);
    b.entries.forEach(function (e) {
      var head = fullDate(e.entryDate) + (e.eventTime ? ' เวลา ' + timeText(e.eventTime) : '');
      d.p([{ t: head, b: true }, { tab: true }, { t: 'ขั้นที่ ' + e.stage + ' ' + e.stageLabel, b: true, color: '1F3B2D' }], { shade: 'EEF3EF', tabs: [{ pos: 9700, align: 'right' }], before: 120, keepNext: true });
      String(e.text || '').split(/\r?\n/).filter(function (l) { return l.trim(); }).forEach(function (l) { d.p([l.trim()], { left: 227, align: 'thaiDistribute', keepLines: true, keepNext: true }); });
      [['บุคคล', e.people], ['โทร', e.phones], ['ทะเบียนรถ', e.plates]].forEach(function (f) {
        if (list(f[1]).length) d.p([{ t: f[0] + ': ', b: true, sz: 24 }, { t: list(f[1]).join(', '), sz: 24 }], { left: 227, keepNext: true });
      });
      var imgs = (e.photos || []).map(function (ph) { return d.image(ph.bytes, ph.mime, 1.75 * 914400, 1.6 * 914400); }).filter(Boolean);
      if (imgs.length) {
        var runs = [];
        imgs.forEach(function (x, k) { if (k) runs.push(' '); runs.push({ img: x }); });
        d.p(runs, { left: 227, before: 60, keepNext: true });
      }
      d.p([{ t: 'บันทึกโดย ' + (e.authorName || '-'), sz: 22, color: '595959' }], { left: 227, after: 60 });
    });
    d.p([{ t: 'พิมพ์เมื่อ ' + b.nowText + ' · เอกสารสำหรับใช้ภายในหน่วย', sz: 22, color: '7F7F7F' }], { before: 240, align: 'right' });
    return d;
  }


  /* ---------- สไลด์สรุป 1 หน้า 16:9 ---------- */
  function cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  var REG_CROP = { l: 0.36, t: 0.085, r: 0.38, b: 0.745 };
  function faceCrop(ph) {
    var dim = ph ? imageSize(ph.bytes, ph.mime) : null;
    return dim && dim.w >= 800 && dim.h / dim.w > 1.33 && dim.h / dim.w < 1.5 ? REG_CROP : null;
  }
  function caseSlide(b) {
    var W = 19200, H = 10800, M = 400, CW = W - 2 * M;
    var d = create({ font: 'Sarabun', size: 22, page: { w: W, h: H }, margins: { top: M, right: M, bottom: 200, left: M } });
    var DARK = '1F3B2D', WHITE = 'FFFFFF';
    var OC = { tracking: 'B45309', caught_us: '1E7B34', caught_other: '1D4ED8', dead: '6B7280' };
    var c = b.caseRow;
    var logo = b.logo ? d.image(b.logo.bytes, b.logo.mime, 0.75 * 914400, 0.75 * 914400) : null;
    d.table([{ h: 1150, cells: [
      { shade: DARK, valign: 'center', paras: [d.pXml(logo ? [{ img: logo }] : [''], { align: 'center' })] },
      { shade: DARK, valign: 'center', paras: [
        d.pXml([{ t: UNIT + ' · ชุดปฏิบัติการข่าว (ชปข.)', sz: 24, color: 'D9E6DC' }]),
        d.pXml([{ t: 'สรุปความคืบหน้าการสืบสวน: ' + cut(c.name, 70), b: true, sz: 40, color: WHITE }])] },
      { shade: DARK, valign: 'center', paras: [
        d.pXml([{ t: c.status === 'closed' ? 'ปิดเคสแล้ว' : 'กำลังติดตาม', b: true, sz: 30, color: c.status === 'closed' ? '86EFAC' : 'FCD34D' }], { align: 'right' }),
        d.pXml([{ t: cut(b.stageText || 'ยังไม่มีความคืบหน้า', 40), sz: 24, color: WHITE }], { align: 'right' })] }
    ] }], [1300, CW - 1300 - 3600, 3600], { noBorder: true });
    // targets strip
    var ts = b.targets.slice(0, 7);
    var more = b.targets.length - ts.length;
    var n = Math.max(ts.length, 1);
    var tw = Math.floor(CW / n);
    var pw = Math.min(1.1, (tw / 1440) * 0.5);
    var nameSz = n > 5 ? 24 : 28;
    if (ts.length) {
      d.p([{ t: 'เป้าหมาย ' + b.targets.length + ' ราย' + (more > 0 ? ' (แสดง 7 รายแรก)' : ''), b: true, sz: 26, color: DARK }], { before: 60, after: 40 });
      d.table([{ h: 2450, cells: ts.map(function (t) {
        var img = t.photo ? d.image(t.photo.bytes, t.photo.mime, pw * 914400, 0.95 * 914400, faceCrop(t.photo)) : null;
        var col = OC[t.outcome] || OC.tracking;
        return { valign: 'center', paras: [
          d.pXml(img ? [{ img: img }] : [{ t: 'ไม่มีรูป', sz: 18, color: '9CA3AF' }], { align: 'center' }),
          img && isCaught(t) ? arrestBand(d, 22) : '',
          d.pXml([{ t: cut(t.name, 26), b: true, sz: nameSz }], { align: 'center' }),
          d.pXml([{ t: ' ' + t.outcomeLabel + ' ', b: true, sz: nameSz - 2, color: WHITE }], { align: 'center', shade: col })] };
      }) }], ts.map(function () { return tw; }), { borderColor: 'C8D3CB' });
    }
    // timeline + photos
    var es = b.entries.slice(-6);
    var lineSz = es.length > 4 ? 22 : 28;
    var maxChars = es.length > 4 ? 85 : 150;
    var left = [d.pXml([{ t: 'ไทม์ไลน์' + (b.entries.length > es.length ? ' (6 รายการล่าสุดจาก ' + b.entries.length + ')' : ''), b: true, sz: 26, color: DARK }], { after: 40 })];
    if (!es.length) left.push(d.pXml([{ t: '- ยังไม่มีบันทึก -', color: '7F7F7F' }]));
    es.forEach(function (e) {
      left.push(d.pXml([{ t: 'ขั้น ' + e.stage + ' ', b: true, sz: lineSz, color: DARK }, { t: shortDate(e.entryDate) + '  ', b: true, sz: lineSz }, { t: cut(e.text, maxChars), sz: lineSz }], { after: 50, left: 0 }));
    });
    var rightW = 6600;
    var feat = [];
    for (var i = b.entries.length - 1; i >= 0 && feat.length < 3; i -= 1) {
      (b.entries[i].photos || []).forEach(function (ph) { if (feat.length < 3 && ph) feat.push(ph); });
    }
    var right = [d.pXml([{ t: 'ภาพประกอบเด่น', b: true, sz: 26, color: DARK }], { after: 40 })];
    var runs = [];
    feat.forEach(function (ph, k) { var x = d.image(ph.bytes, ph.mime, ((rightW - 500) / feat.length / 1440) * 0.92 * 914400, 1.75 * 914400); if (x) { if (runs.length) runs.push(' '); runs.push({ img: x }); } });
    right.push(d.pXml(runs.length ? runs : [{ t: '- ไม่มีภาพ -', color: '7F7F7F' }], { align: 'center' }));
    d.table([{ h: ts.length ? 3500 : 6100, cells: [{ paras: left }, { paras: right }] }], [CW - rightW, rightW], { borderColor: 'C8D3CB' });
    d.table([{ h: 1000, cells: [
      { shade: 'FEF3C7', valign: 'center', paras: [d.pXml([{ t: 'ขั้นต่อไป', b: true, sz: 28, color: '92400E' }], { align: 'center' })] },
      { shade: 'FFFBEB', valign: 'center', paras: [d.pXml([{ t: cut(c.nextStep || '-', 260), sz: 24 }])] }
    ] }], [1800, CW - 1800], { borderColor: 'F59E0B' });
    d.p([{ t: 'พิมพ์เมื่อ ' + b.nowText + ' · เอกสารสำหรับใช้ภายในหน่วย', sz: 16, color: '7F7F7F' }], { align: 'right' });
    return d;
  }
  /* ---------- แบบ 1 กรมท่า-ทอง: ชุดสไลด์หลายหน้า (PDF) และโปสเตอร์ 1 หน้า ---------- */
  var NV = { bg: '0B2545', card: '13315C', gold: 'D4A017', white: 'FFFFFF', soft: 'C9D6EA', ok: '2E8B57', no: 'C0392B', grey: '6B7280' };
  var NV_OC = { tracking: NV.no, caught_us: NV.ok, caught_other: '1D4ED8', dead: NV.grey };
  function navyDoc() {
    var W = 19200, H = 10800, M = 500;
    var d = create({ font: 'Sarabun', size: 24, page: { w: W, h: H }, margins: { top: M, right: M, bottom: 300, left: M }, bg: NV.bg });
    d.CW = W - 2 * M;
    return d;
  }
  function navyHead(d, b, title, first) {
    var logo = b.logo ? d.image(b.logo.bytes, b.logo.mime, 0.7 * 914400, 0.7 * 914400) : null;
    d.raw(d.pXml([''], { pageBreakBefore: !first, sz: 4 }));
    d.table([{ cells: [
      { valign: 'center', paras: [d.pXml(logo ? [{ img: logo }] : [''], { align: 'center' })] },
      { valign: 'center', paras: [d.pXml([{ t: UNIT + ' · ชุดปฏิบัติการข่าว (ชปข.)', sz: 22, color: NV.soft }]),
        d.pXml([{ t: title, b: true, sz: 38, color: NV.gold }])] }
    ] }], [1300, d.CW - 1300], { noBorder: true });
    d.p([''], { border: NV.gold, sz: 6, after: 120 });
  }
  function navyFoot(d, b) {
    d.p([{ t: 'เอกสารสำหรับใช้ภายในหน่วย · ข้อมูล ณ ' + b.nowText, sz: 16, color: NV.soft }], { align: 'right', before: 80 });
  }
  function statusText(c) { return c.status === 'closed' ? 'ปิดเคสแล้ว' : 'กำลังติดตาม'; }
  function navyCards(d, ts, perRow, photoIn, nameSz, detail) {
    for (var s = 0; s < ts.length; s += perRow) {
      var row = ts.slice(s, s + perRow);
      var tw = Math.floor(d.CW / perRow);
      d.table([{ cells: row.map(function (t) {
        var img = t.photo ? d.image(t.photo.bytes, t.photo.mime, photoIn * 914400, photoIn * 1.1 * 914400, faceCrop(t.photo)) : null;
        var paras = [d.pXml(img ? [{ img: img }] : [{ t: 'ไม่มีรูป', sz: 18, color: NV.soft }], { align: 'center', before: 60 })];
        if (img && isCaught(t)) paras.push(arrestBand(d, 22));
        paras.push(d.pXml([{ t: cut(t.name, 30) + (t.nickname ? ' (' + cut(t.nickname, 14) + ')' : ''), b: true, sz: nameSz, color: NV.white }], { align: 'center', before: 60 }));
        paras.push(d.pXml([{ t: ' ' + t.outcomeLabel + (t.outcomeDateText ? ' ' + t.outcomeDateText : '') + ' ', b: true, sz: nameSz - 4, color: NV.white }], { align: 'center', shade: NV_OC[t.outcome] || NV.no, before: 40 }));
        if (detail) [['บทบาท', t.roleNotes], ['ที่อยู่', t.address], ['โทร', t.phones]].forEach(function (f) {
          if (f[1]) paras.push(d.pXml([{ t: f[0] + ': ', b: true, sz: 18, color: NV.gold }, { t: cut(f[1], 90), sz: 18, color: NV.soft }], { before: 30 }));
        });
        return { shade: NV.card, paras: paras };
      }).concat(row.length < perRow ? [{ paras: [d.pXml([''])] }] : []) }],
      row.map(function () { return tw; }).concat(row.length < perRow ? [tw * (perRow - row.length)] : []), { borderColor: NV.bg });
    }
  }
  function navyTimeline(d, es, maxChars, sz) {
    d.table(es.map(function (e) {
      return { cells: [
        { shade: NV.card, valign: 'center', paras: [d.pXml([{ t: ' ขั้น ' + e.stage + ' ', b: true, sz: sz, color: '000000' }], { align: 'center', shade: NV.gold }),
          d.pXml([{ t: shortDate(e.entryDate), sz: sz - 4, color: NV.soft }], { align: 'center', before: 20 })] },
        { shade: NV.card, valign: 'center', paras: [d.pXml([{ t: cut(e.text, maxChars), sz: sz, color: NV.white }])] }
      ] };
    }), [1900, d.CW - 1900], { borderColor: NV.bg });
  }
  function featPhotos(b, n) {
    var feat = [];
    for (var i = b.entries.length - 1; i >= 0 && feat.length < n; i -= 1) {
      (b.entries[i].photos || []).forEach(function (ph) { if (feat.length < n && ph) feat.push(ph); });
    }
    return feat;
  }
  function caseDeck(b) {
    var d = navyDoc(), c = b.caseRow;
    // หน้า 1 ปก
    var logo = b.logo ? d.image(b.logo.bytes, b.logo.mime, 2.1 * 914400, 2.1 * 914400) : null;
    d.p(logo ? [{ img: logo }] : [''], { align: 'center', before: 900 });
    d.p([{ t: UNIT + ' · ชุดปฏิบัติการข่าว (ชปข.)', sz: 30, color: NV.soft }], { align: 'center', before: 240 });
    d.p([{ t: 'สรุปความคืบหน้าการสืบสวน: ' + cut(c.name, 110), b: true, sz: 52, color: NV.gold }], { align: 'center', before: 200, left: 800, right: 800 });
    d.p([{ t: '  ' + statusText(c) + (b.stageText ? ' · ' + b.stageText : '') + '  ', b: true, sz: 30, color: '000000' }], { align: 'center', before: 300, left: 5200, right: 5200, shade: NV.gold });
    d.p([{ t: 'เอกสารสำหรับใช้ภายในหน่วย · ข้อมูล ณ ' + b.nowText, sz: 18, color: NV.soft }], { align: 'center', before: 900 });
    // หน้าเป้าหมาย (5 รายต่อหน้า)
    for (var s = 0; s < b.targets.length; s += 5) {
      navyHead(d, b, 'เป้าหมาย ' + b.targets.length + ' ราย' + (b.targets.length > 5 ? ' (' + (s + 1) + '–' + Math.min(s + 5, b.targets.length) + ')' : ''), false);
      navyCards(d, b.targets.slice(s, s + 5), 5, 1.45, 26, true);
      if (s === 0) {
        var caught = b.targets.filter(isCaught).length;
        d.p([{ t: 'จับกุมแล้ว ', sz: 26, color: NV.white }, { t: String(caught), b: true, sz: 30, color: NV.gold }, { t: ' ราย · ยังติดตาม ', sz: 26, color: NV.white },
          { t: String(b.targets.filter(function (t) { return !t.outcome || t.outcome === 'tracking'; }).length), b: true, sz: 30, color: NV.gold }, { t: ' ราย', sz: 26, color: NV.white }], { align: 'center', before: 160 });
      }
      navyFoot(d, b);
    }
    // หน้าไทม์ไลน์ (6 รายการต่อหน้า)
    for (var k = 0; k < b.entries.length; k += 6) {
      navyHead(d, b, 'ไทม์ไลน์การสืบสวน' + (b.entries.length > 6 ? ' (' + (k + 1) + '–' + Math.min(k + 6, b.entries.length) + ' จาก ' + b.entries.length + ')' : ''), false);
      navyTimeline(d, b.entries.slice(k, k + 6), 330, 24);
      navyFoot(d, b);
    }
    // หน้าขั้นต่อไป + ภาพประกอบ
    navyHead(d, b, 'ขั้นต่อไป' + (featPhotos(b, 1).length ? 'และภาพประกอบ' : ''), false);
    if (c.nextStep) d.table([{ cells: [{ shade: NV.card, paras: [d.pXml([{ t: c.nextStep, sz: 30, color: NV.white }], { before: 80, after: 80, left: 200, right: 200 })] }] }], [d.CW], { borderColor: NV.gold });
    var feat = featPhotos(b, 3), runs = [];
    feat.forEach(function (ph) { var x = d.image(ph.bytes, ph.mime, (d.CW / 1440 / 3) * 0.9 * 914400, 3.6 * 914400); if (x) { if (runs.length) runs.push('  '); runs.push({ img: x }); } });
    if (runs.length) d.p(runs, { align: 'center', before: 200 });
    navyFoot(d, b);
    return d;
  }
  function casePosterNavy(b) {
    var d = navyDoc(), c = b.caseRow;
    var logo = b.logo ? d.image(b.logo.bytes, b.logo.mime, 0.75 * 914400, 0.75 * 914400) : null;
    d.table([{ cells: [
      { valign: 'center', paras: [d.pXml(logo ? [{ img: logo }] : [''], { align: 'center' })] },
      { valign: 'center', paras: [d.pXml([{ t: UNIT + ' · ชุดปฏิบัติการข่าว (ชปข.)', sz: 22, color: NV.soft }]),
        d.pXml([{ t: 'สรุปความคืบหน้าการสืบสวน: ' + cut(c.name, 70), b: true, sz: 36, color: NV.gold }])] },
      { valign: 'center', paras: [d.pXml([{ t: ' ' + statusText(c) + ' ', b: true, sz: 28, color: '000000' }], { align: 'right', shade: NV.gold }),
        d.pXml([{ t: cut(b.stageText || '', 40), sz: 22, color: NV.white }], { align: 'right', before: 40 })] }
    ] }], [1300, d.CW - 1300 - 3400, 3400], { noBorder: true });
    d.p([''], { border: NV.gold, sz: 6, after: 80 });
    var ts = b.targets.slice(0, 7);
    if (ts.length) {
      d.p([{ t: 'เป้าหมาย ' + b.targets.length + ' ราย' + (b.targets.length > 7 ? ' (แสดง 7 รายแรก)' : ''), b: true, sz: 26, color: NV.gold }], { after: 40 });
      navyCards(d, ts, Math.max(ts.length, 5), ts.length > 5 ? 0.85 : 1.0, ts.length > 5 ? 22 : 24, false);
    }
    var es = b.entries.slice(-4);
    if (es.length) {
      d.p([{ t: 'ไทม์ไลน์' + (b.entries.length > 4 ? ' (4 รายการล่าสุดจาก ' + b.entries.length + ')' : ''), b: true, sz: 26, color: NV.gold }], { before: 60, after: 40 });
      navyTimeline(d, es, 150, 20);
    }
    if (c.nextStep) d.table([{ cells: [
      { shade: NV.gold, valign: 'center', paras: [d.pXml([{ t: 'ขั้นต่อไป', b: true, sz: 26, color: '000000' }], { align: 'center' })] },
      { shade: NV.card, valign: 'center', paras: [d.pXml([{ t: cut(c.nextStep, 260), sz: 22, color: NV.white }])] }
    ] }], [1800, d.CW - 1800], { borderColor: NV.gold });
    navyFoot(d, b);
    return d;
  }

  /* ---------- โปสเตอร์แนวตั้ง แบบ 3 (ฟรี ไม่ใช้ AI) ---------- */
  var P3 = { bg: '120A24', card: '22163C', pink: 'E83FBF', cyan: '00A9D6', green: '2FBF5A', lime: '5CFF8F', org: 'FFB13F', white: 'FFFFFF', soft: 'CFC8E6', line: '3A2D5C' };
  function shortCut(t, n) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    var c = t.lastIndexOf(' ', n);
    return t.slice(0, c > 60 ? c : n) + ' …';
  }
  function casePoster(b) {
    var W = 10800, H = 15400, M = 420;
    var d = create({ font: 'Sarabun', size: 22, page: { w: W, h: H }, margins: { top: M, right: M, bottom: 250, left: M }, bg: P3.bg });
    var CW = W - 2 * M, c = b.caseRow;
    var logo = b.logo ? d.image(b.logo.bytes, b.logo.mime, 1.25 * 914400, 1.25 * 914400) : null;
    d.table([{ cells: [
      { valign: 'center', paras: [d.pXml(logo ? [{ img: logo }] : [''], { align: 'center' })] },
      { valign: 'center', paras: [
        d.pXml([{ t: 'สารตั้งต้น', b: true, sz: 60, color: P3.pink }]),
        d.pXml([{ t: 'การสืบสวนติดตามเครือข่ายยาเสพติด', b: true, sz: 42, color: P3.lime }]),
        d.pXml([{ t: 'ชุดปฏิบัติการข่าว ' + UNIT + ' (ร้อย ตชด.244)', sz: 22, color: P3.white }], { before: 40 }),
        d.pXml([{ t: cut(c.name, 90), sz: 21, color: P3.soft }])] }
    ] }], [2100, CW - 2100], { noBorder: true });
    var groups = [];
    b.entries.forEach(function (e) {
      var g = groups.length ? groups[groups.length - 1] : null;
      if (!g || g.stage !== e.stage) { g = { stage: e.stage, label: e.stageLabel, date: e.entryDate, es: [] }; groups.push(g); }
      g.es.push(e);
    });
    if (groups.length > 4) groups = groups.slice(-4);
    var n = groups.length, phH = n <= 3 ? 1.65 : 1.15, tlen = n <= 3 ? 125 : 95;
    var PILL = [P3.pink, P3.cyan, P3.green];
    groups.forEach(function (g, gi) {
      var last = gi === n - 1;
      var main = g.es.length > 1 && gi === 0 ? g.es[g.es.length - 1] : g.es[0];
      var plates = [], phones = [], photos = [];
      g.es.forEach(function (e) {
        [].concat(e.plates || []).join(',').split(/\s*,\s*/).forEach(function (p) { if (p && plates.indexOf(p) < 0) plates.push(p); });
        [].concat(e.phones || []).join(',').split(/\s*,\s*/).forEach(function (p) { if (p && phones.indexOf(p) < 0) phones.push(p); });
        (e.photos || []).forEach(function (ph) { if (ph && photos.length < 2) photos.push(ph); });
      });
      var chips = plates.map(function (p) { return 'ทะเบียน ' + p; }).concat(phones.slice(0, 2).map(function (p) { return 'โทร ' + p; }));
      var left = [
        d.pXml([{ t: ' ระยะที่ ' + g.stage + ' ', b: true, sz: 28, color: P3.white }, { t: '   [' + shortDate(g.date) + ']', b: true, sz: 28, color: P3.org }], { shade: P3.card }),
        d.pXml([{ t: g.label || '', b: true, sz: 30, color: P3.lime }], { before: 40 }),
        d.pXml([{ t: shortCut(main.text, tlen), sz: 22, color: P3.white }], { before: 40 })
      ];
      left[0] = d.pXml([{ t: ' ระยะที่ ' + g.stage + ' ', b: true, sz: 28, color: P3.white }], { shade: PILL[gi % 3], right: 2600 });
      left.splice(1, 0, d.pXml([{ t: '[' + shortDate(g.date) + ']', b: true, sz: 26, color: P3.org }], { before: 20 }));
      if (chips.length) left.push(d.pXml([{ t: chips.join('   ·   '), sz: 18, color: P3.soft }], { before: 50 }));
      var pw = (CW * 0.42 / 1440 / Math.max(photos.length, 1)) * 0.93 * 914400;
      var runs = [];
      photos.forEach(function (ph) { var x = d.image(ph.bytes, ph.mime, pw, phH * 914400); if (x) { if (runs.length) runs.push('  '); runs.push({ img: x }); } });
      var cells = runs.length ? [{ shade: P3.card, paras: left }, { shade: P3.card, valign: 'center', paras: [d.pXml(runs, { align: 'center' })] }] : [{ shade: P3.card, paras: left }];
      d.table([{ cells: cells }], runs.length ? [Math.round(CW * 0.56), CW - Math.round(CW * 0.56)] : [CW], { borderColor: P3.line });
      if (last && b.targets.length) {
        var ts = b.targets.slice(0, 6), tw = Math.floor(CW / Math.max(ts.length, 5));
        d.table([{ cells: ts.map(function (t) {
          var img = t.photo ? d.image(t.photo.bytes, t.photo.mime, (tw / 1440) * 0.86 * 914400, 1.55 * 914400, faceCrop(t.photo)) : null;
          var paras = [d.pXml(img ? [{ img: img }] : [{ t: 'ไม่มีรูป', sz: 16, color: P3.soft }], { align: 'center', before: 40 })];
          if (img && isCaught(t)) paras.push(arrestBand(d, 22));
          paras.push(d.pXml([{ t: cut(t.name, 26), b: true, sz: 17, color: P3.white }], { align: 'center', before: 30 }));
          if (!isCaught(t)) paras.push(d.pXml([{ t: ' ' + (t.outcomeLabel || '') + ' ', sz: 16, color: P3.white }], { align: 'center', shade: P3.line, before: 20 }));
          return { shade: P3.card, paras: paras };
        }) }], ts.map(function () { return tw; }), { borderColor: P3.bg });
      }
    });
    if (c.nextStep) d.table([{ cells: [{ shade: '2A1840', paras: [d.pXml([{ t: 'ขั้นต่อไป ', b: true, sz: 22, color: P3.org }, { t: shortCut(c.nextStep, 110), sz: 21, color: P3.white }])] }] }], [CW], { borderColor: P3.pink });
    d.p([{ t: (b.daysText ? b.daysText + ' · ' : '') + 'ข้อมูล ณ ' + b.nowText + ' · เอกสารสำหรับใช้ภายในหน่วย', sz: 15, color: P3.soft }], { align: 'right', before: 40 });
    return d;
  }
  function shortDate(iso) {
    var p = parts(iso);
    if (!p) return '';
    var TM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return p.d + ' ' + TM[p.m - 1] + ' ' + String(p.y + 543).slice(-2);
  }
  return { isCaught: isCaught, create: create, caseSlide: caseSlide, caseDeck: caseDeck, casePoster: casePoster, entryMemo: entryMemo, caseReport: caseReport, fullDate: fullDate, imageSize: imageSize };
})();
if (typeof module !== 'undefined') module.exports = Docx;
