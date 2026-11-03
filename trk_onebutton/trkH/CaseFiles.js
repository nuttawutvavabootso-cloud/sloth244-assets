/**
 * CaseFiles: ไฟล์ประจำเคส (สไลด์ PDF / รายงาน PDF / บันทึกสืบ) เก็บไฟล์เดียวต่อชนิดในโฟลเดอร์เคส
 * อัปเดตทับไฟล์เดิม (คง file id) ไม่สร้างไฟล์ซ้ำ; ทำเบื้องหลังหลังมีการแก้ข้อมูล
 * env = { store:{get(k),set(k,v)}, build(kind)->{blob,name}, buildMemo(entry)->{blob,name}|null,
 *         upsert(fileId,name,blob,legacyMatch)->fileId, read(fileId)->{bytes,mime,name}|null, now()->iso }
 */
var CaseFiles = (function () {
  var KINDS = ['slide', 'report', 'memo'];
  var LABELS = { slide: 'โปสเตอร์สรุป', report: 'สไลด์ PDF', memo: 'บันทึกสืบ' };

  function key(caseId) { return 'CF_' + caseId; }
  function load(store, caseId) {
    var raw = store.get(key(caseId));
    var o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    o = o || {};
    o.files = o.files || {};
    o.memos = o.memos || {};
    o.ver = o.ver || 0;
    o.doneVer = o.doneVer == null ? -1 : o.doneVer;
    return o;
  }
  function save(store, caseId, o) { store.set(key(caseId), JSON.stringify(o)); }

  function markDirty(store, caseId) {
    var o = load(store, caseId);
    o.ver += 1;
    save(store, caseId, o);
    return o.ver;
  }

  function isDirty(o, hash) { return o.doneVer < o.ver || (hash != null && o.hash !== hash) || KINDS.some(function (k) { return !o.files[k]; }); }

  function info(store, caseId, hash) {
    var o = load(store, caseId);
    var out = { dirty: isDirty(o, hash), files: {} };
    KINDS.forEach(function (k) {
      out.files[k] = o.files[k] ? { at: o.files[k].at, name: o.files[k].name, label: LABELS[k] } : null;
    });
    out.updatedAt = KINDS.map(function (k) { return o.files[k] ? o.files[k].at : ''; }).sort().pop() || '';
    return out;
  }

  // สร้าง/อัปเดตทุกไฟล์ของเคส; entries = แถวขั้นตอน (ใช้ทำบันทึกสืบรายขั้น)
  function refresh(env, caseId, entries) {
    var o = load(env.store, caseId);
    var target = o.ver;
    var at = env.now();
    ['slide', 'report', 'memo'].forEach(function (k) {
      var built = env.build(k);
      var old = o.files[k];
      var id = env.upsert(old ? old.id : '', built.name, built.blob, null);
      o.files[k] = { id: id, name: built.name, at: at };
    });
    (entries || []).forEach(function (e) {
      var m = env.buildMemo(e);
      if (!m) return;
      var suffix = '_' + String(e.id).slice(-4) + '.docx';
      o.memos[e.id] = env.upsert(o.memos[e.id] || '', m.name, m.blob, function (n) {
        return /^บันทึกการสืบสวน_/.test(n) && n.slice(-suffix.length) === suffix;
      });
    });
    var latest = load(env.store, caseId); // อาจมีการแก้เพิ่มระหว่างทำ
    latest.files = o.files;
    latest.memos = o.memos;
    latest.doneVer = target;
    if (env.hash != null) latest.hash = env.hash;
    save(env.store, caseId, latest);
    return info(env.store, caseId);
  }

  function fileFor(env, caseId, kind) {
    if (KINDS.indexOf(kind) < 0) throw new Error('ไม่รู้จักชนิดไฟล์');
    var o = load(env.store, caseId);
    if (isDirty(o, env.hash) || !o.files[kind]) return null;
    return env.read(o.files[kind].id);
  }

  return { KINDS: KINDS, LABELS: LABELS, markDirty: markDirty, info: info, refresh: refresh, fileFor: fileFor, load: load };
})();

if (typeof module !== 'undefined') module.exports = CaseFiles;
