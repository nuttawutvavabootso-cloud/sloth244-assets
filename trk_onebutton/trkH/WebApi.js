// หน้าเว็บบน Cloudflare เรียกผ่าน doPost (แทน google.script.run) — ฟังก์ชันที่เรียกได้ = ฟังก์ชันสาธารณะชุดเดียวกับ google.script.run
function doPost(e){
  var b={}; try{ b=JSON.parse((e&&e.postData&&e.postData.contents)||'{}'); }catch(x){}
  if(b && b.__w){
    var out; try{ out={ok:true,v:webApi_(b)}; }catch(x){ out={ok:false,e:String(x&&x.message||x)}; }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  if(typeof tmpDoPost_==='function') return tmpDoPost_(e);
  return ContentService.createTextOutput('no');
}
function webApi_(b){
  if(b.__w==='ui') return doGet({parameter:b.p||{},parameters:{}}).getContent();
  var fn=String(b.fn||'');
  if(!/^[A-Za-z][A-Za-z0-9]*$/.test(fn) || ['doGet','doPost','setup','include'].indexOf(fn)>=0) throw new Error('ไม่อนุญาต: '+fn);
  var f=globalThis[fn]; if(typeof f!=='function') throw new Error('ไม่พบฟังก์ชัน: '+fn);
  return f.apply(null, Array.isArray(b.a)?b.a:[]);
}
