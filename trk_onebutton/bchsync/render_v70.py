# สร้าง PDF จากข้อมูลจริงเท่านั้น (บช. + บันทึกในระบบติดตามคดี): render_progress (TIMELINE) และ render_suep (บันทึกสืบ)
import html,os,datetime,re
from playwright.sync_api import sync_playwright
D=os.path.dirname(os.path.abspath(__file__))
LOGO=open(os.path.join(D,'logo.b64')).read().strip()
TH_M=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
STAGE={'1':'รับข้อมูล/เริ่มสืบ','2':'สืบสวนหาข้อมูล','3':'ยืนยันเป้าหมาย','4':'ปฏิบัติการ','5':'ปิดเคส'}
def c(v):
    v=str(v if v is not None else '').strip(); return '' if v in ('-','undefined','null') else v
def e(v): return html.escape(c(v)).replace('\n','<br>')
def thd(d,full=False):
    d=c(d)
    try:
        y,m,dd=map(int,d[:10].split('-')); y=y+543 if y<2400 else y
        return f'{dd} {TH_M[m]} {y if full else str(y)[2:]}'
    except Exception: return d
THD=str.maketrans('0123456789','๐๑๒๓๔๕๖๗๘๙')
def th(s): return str(s).translate(THD)
def imgs(urls,cls='ph'):
    u=[x for x in urls if x and x.startswith('data:image')]
    return f'<div class="{cls}">'+''.join(f'<img src="{x}">' for x in u)+'</div>' if u else ''
BCHP={'suspect':'ผู้ต้องหา','evidence':'ของกลาง','vehicle':'รถ','timeline':'ไฟล์ Timeline','leader':'หัวหน้าชุด','reporter':'ผู้รายงาน','symbol':'ตราสัญลักษณ์'}
def events(b):
    """ลำดับเหตุการณ์: บช. (อดีต/ปัจจุบัน/ผล) + บันทึกของเรา เรียงตามวันที่"""
    F=(b.get('snap') or {}).get('fields',{}); S=b.get('snap') or {}; P=b['photos']; ev=[]
    if c(F.get('casePast')): ev.append(dict(k=c(F.get('startDate'))+'0',date=F.get('startDate'),title='จุดเริ่มต้น / ที่ผ่านมา',src='บช.',text=F.get('casePast'),det=[],ph=[]))
    for x in b['local']['entries']:
        det=[(l,x.get(k)) for k,l in [('people','บุคคล'),('phones','โทรศัพท์'),('plates','ทะเบียนรถ')] if c(x.get(k))]
        ev.append(dict(k=c(x.get('entryDate'))+'1'+c(x.get('eventTime')),date=x.get('entryDate'),time=x.get('eventTime'),title=STAGE.get(c(x.get('stage')),'บันทึกความคืบหน้า'),src='ระบบติดตามคดี',text=x.get('text'),det=det,ph=P['entries'].get(x['id'],[]),author=x.get('authorName')))
    evd=' / '.join(x for x in [c(F.get('evidMainType')),c(F.get('evidMainQty')),c(F.get('evidOther')),c(F.get('evidOtherExt'))] if x)
    bp=[P['bch'][t] for t in ('evidence','vehicle','timeline') if t in P['bch']]
    if c(F.get('casePresent')) or evd or bp:
        ev.append(dict(k=c(S.get('updated'))+'2',date=S.get('updated'),title='ปัจจุบัน',src='บช.',text=F.get('casePresent'),det=[('ของกลาง',evd)] if evd else [],ph=bp))
    if c(F.get('caseResult')): ev.append(dict(k=(c(F.get('endDate')) or c(S.get('updated')))+'3',date=F.get('endDate'),title='ผลการดำเนินการ',src='บช.',text=F.get('caseResult'),det=[],ph=[]))
    ev.sort(key=lambda x:x['k'])
    if c(F.get('caseFuture')): ev.append(dict(k='z',date='',title='แผนขั้นต่อไป',src='บช.',text=F.get('caseFuture'),det=[],ph=[]))
    return ev
CSS='''@page{size:A4;margin:9mm}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Sarabun','Noto Sans Thai',sans-serif;font-size:11pt;color:#e9f3ea;background:#0f2417}
.wrap{border:2px solid #c9a227;border-radius:10px;padding:12px 14px;background:#0f2417;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.hd{display:flex;gap:14px;align-items:center;border-bottom:2px solid #c9a227;padding-bottom:9px}
.hd img{width:74px;height:74px;object-fit:contain}
.t1{font-size:19pt;font-weight:700;color:#fff}.t2{font-size:12.5pt;font-weight:700;color:#f2c94c}.t3{font-size:10.5pt;color:#cfe3d3}
.side{display:flex;gap:10px;margin-top:10px;break-inside:avoid}.side .box{flex:1;margin:0}
.lay{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px}.lay td{vertical-align:top;padding:0}.left{width:56%;padding-right:10px!important}.right{width:44%}
.it{display:flex;gap:10px;margin-bottom:9px}
.it.s{break-inside:avoid}.tg p{margin:0;font-size:9.5pt;line-height:1.35}
.dt{width:64px;flex:none;text-align:right;color:#f2c94c;font-weight:700;font-size:9.5pt;padding-top:7px;border-right:3px solid #c9a227;padding-right:7px;position:relative}
.dt:after{content:'';position:absolute;right:-8px;top:11px;width:11px;height:11px;border-radius:50%;background:#f2c94c}
.card{flex:1;background:#173523;border:1px solid #3d6b4c;border-radius:8px;padding:7px 10px}
.card h3{margin:0 0 4px;font-size:12pt;color:#f2c94c;break-after:avoid}.src{font-size:8.5pt;color:#9cc5a6;font-weight:400}
.card p{margin:0 0 3px;line-height:1.45}
.ph{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-top:5px}
.ph img{width:100%;height:105px;object-fit:cover;border-radius:5px;border:1px solid #3d6b4c;break-inside:avoid}
.box{background:#132d1e;border:1.5px solid #c9a227;border-radius:8px;padding:8px 10px;margin-bottom:10px;break-inside:avoid}
.box h2{margin:0 0 6px;font-size:12pt;text-align:center;color:#fff;background:#2b5a3b;border-radius:5px;padding:3px}
.tg{display:flex;gap:8px;margin-bottom:6px;break-inside:avoid}.tg img{width:70px;height:88px;object-fit:cover;border-radius:5px;border:1px solid #c9a227;flex:none}
.tg b{color:#f2c94c}.k{color:#9cc5a6}
.ft{margin-top:6px;font-size:8.5pt;color:#9cc5a6;text-align:right}'''
def uniq(xs):
    out=[]
    for x in xs:
        x=c(x)
        if x and x not in out: out.append(x)
    return out
def split(v): return [x.strip() for x in re.split(r'[,\n;]+',c(v)) if x.strip()]
def ecard(photo,title,lines):
    ln=''.join(f'<p><span class="k">{html.escape(l)}:</span> {e(v)}</p>' for l,v in lines if c(v))
    ph=f'<img src="{photo}">' if photo else ''
    return f'<div class="tg">{ph}<div><b>{e(title) or "—"}</b>{ln}</div></div>'
def entities(b):
    F=(b.get('snap') or {}).get('fields',{}); P=b['photos']; L=b['local']; ext=b.get('ext') or {}
    G={'บุคคล':[],'ยานพาหนะ':[],'ที่อยู่ / บ้าน':[],'อื่นๆ':[]}
    nm=' '.join(x for x in [c(F.get('intelFName')),c(F.get('intelLName'))] if x)
    if nm and c(F.get('intelTitle')) and not nm.startswith(c(F.get('intelTitle'))): nm=c(F.get('intelTitle'))+nm
    if nm: G['บุคคล'].append(ecard(P['bch'].get('suspect'),nm+' (บช.)',[('ฉายา',F.get('intelAlias')),('เลขประจำตัว',F.get('intelIDCard')),('โทร',F.get('intelPhone'))]))
    for t in L['targets']:
        G['บุคคล'].append(ecard(P['targets'].get(t['id']),t.get('name'),[('ชื่อเล่น',t.get('nickname')),('โทร',t.get('phones')),('บทบาท',t.get('roleNotes')),('ผล',t.get('outcome'))]))
    seen=set()
    for t in L['targets']:
        a=c(t.get('address'))
        if a and a not in seen: seen.add(a); G['ที่อยู่ / บ้าน'].append(ecard('',a,[('เกี่ยวข้องกับ',t.get('name'))]))
    if c(F.get('intelLocation')): G['ที่อยู่ / บ้าน'].append(ecard('',F.get('intelLocation'),[('ที่มา','บช.')]))
    if c(ext.get('gps')): G['ที่อยู่ / บ้าน'].append(ecard('',ext.get('gps'),[('ประเภท','พิกัด')]))
    veh=' '.join(x for x in [c(F.get('intelVehBrand')),c(F.get('intelVehModel')),c(F.get('intelVehColor'))] if x)
    vp=P['bch'].get('vehicle')
    if veh or c(F.get('intelVehPlate')) or vp: G['ยานพาหนะ'].append(ecard(vp,veh or 'ยานพาหนะ (บช.)',[('ทะเบียน',F.get('intelVehPlate'))])); vp=None
    for v in ext.get('vehicles') or []:
        if isinstance(v,dict) and any(c(x) for x in v.values()): G['ยานพาหนะ'].append(ecard('',' '.join(c(v.get(k)) for k in ('brand','model','color') if c(v.get(k))) or 'ยานพาหนะ',[('ทะเบียน',v.get('plate'))]))
    for p in uniq(sum([split(x.get('plates')) for x in L['entries']],[])):
        G['ยานพาหนะ'].append(ecard('',p,[('ที่มา','บันทึกความคืบหน้า')]))
    tph=set(sum([split(t.get('phones')) for t in L['targets']],[]))
    ph=[x for x in uniq([F.get('intelPhone')]+split(ext.get('targetPhones'))+sum([split(x.get('phones')) for x in L['entries']],[])) if x not in tph]
    if ph: G['อื่นๆ'].append(ecard('','เบอร์โทรศัพท์ที่เกี่ยวข้อง',[('เบอร์',', '.join(ph))]))
    bk=uniq([F.get('intelBank')]+split(ext.get('bankAccounts')))
    if bk: G['อื่นๆ'].append(ecard('','บัญชีธนาคาร',[('บัญชี',', '.join(bk))]))
    evd=' / '.join(x for x in [c(F.get('evidMainType')),c(F.get('evidMainQty')),c(F.get('evidOther')),c(F.get('evidOtherExt'))] if x)
    if evd or P['bch'].get('evidence'): G['อื่นๆ'].append(ecard(P['bch'].get('evidence'),'ของกลาง',[('รายการ',evd)]))
    return ''.join(f'<div class="box"><h2>{k}</h2>{"".join(v)}</div>' for k,v in G.items() if v)
def status_html(b):
    F=(b.get('snap') or {}).get('fields',{}); S=b.get('snap') or {}
    st=[f'<p><span class="k">{l}:</span> {e(F.get(k))}</p>' for k,l in [('status','สถานะ'),('caseId','รหัสคดี บช.'),('relatedCase','คดีที่เกี่ยวข้อง'),('caseObstacle','ปัญหา/อุปสรรค'),('caseNeed','สิ่งที่ต้องการ')] if c(F.get(k))]
    com=' '.join(x for x in [c(F.get('comRank')),c(F.get('comFName')),c(F.get('comLName'))] if x)
    if com: st.append(f'<p><span class="k">หัวหน้าชุด:</span> {html.escape(com)}</p>')
    if c(S.get('reporter')): st.append(f'<p><span class="k">ผู้รายงาน:</span> {e(S.get("reporter"))}</p>')
    return f'<div class="box"><h2>สรุปผลความคืบหน้าทางคดี</h2>{"".join(st)}</div>'
def build_progress(b):
    F=(b.get('snap') or {}).get('fields',{}); S=b.get('snap') or {}; items=[]
    for n,x in enumerate(events(b),1):
        small=' s' if len(x['ph'])<=3 else ''
        items.append(f'<div class="it{small}"><div class="dt">{e(thd(x["date"]))}{"<br>"+e(x.get("time")) if c(x.get("time")) else ""}</div><div class="card"><h3>{n}. {html.escape(x["title"])}</h3>{"<p>"+e(x["text"])+"</p>" if c(x["text"]) else ""}{imgs(x["ph"])}</div></div>')
    sub=' · '.join(x for x in [c(S.get('caseType')),('เริ่ม '+thd(F.get('startDate'))) if c(F.get('startDate')) else ''] if x)
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="wrap">
<div class="hd"><img src="data:image/png;base64,{LOGO}"><div><div class="t1">“กองร้อยตำรวจตระเวนชายแดนที่ 244”</div>
<div class="t2">TIMELINE ลำดับเหตุการณ์และการสืบสวนขยายผล</div><div class="t3">{e(F.get('caseName') or b.get('caseName'))}{(' — '+html.escape(sub)) if sub else ''}</div></div></div>
<table class="lay"><tr><td class="left">{''.join(items) or '<p>ยังไม่มีเหตุการณ์</p>'}</td><td class="right">{status_html(b)}{entities(b)}</td></tr></table>
<div class="ft">เอกสารใช้ภายในหน่วย</div>
</div></body></html>'''
SCSS='''@page{size:A4;margin:20mm 20mm 20mm 30mm}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Sarabun',sans-serif;font-size:15pt;color:#000;line-height:1.5}
.pg{break-after:page}.pg:last-child{break-after:auto}
.ttl{text-align:center;font-size:26pt;font-weight:700;margin:0 0 6px}
.ln{margin:0}.ln b{font-weight:700}
.f{background:#e3e3e3;padding:0 3px}.m{color:#c00;font-weight:700}
.bd{text-indent:2.5cm;margin:10px 0 0;text-align:justify}
.dl{margin:4px 0 0 2.5cm}
.ph{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.ph img{width:100%;height:120px;object-fit:cover;border:1px solid #888}
.sg{margin:24px 0 0 45%;text-align:center}.rule{border-bottom:1px solid #000;margin:6px 0 4px}
.nt{font-size:10pt;color:#555;margin-top:18px;border-top:1px dashed #999;padding-top:4px}'''
def F_(v,miss):
    v=c(v); return f'<span class="f">{html.escape(th(v)).replace(chr(10),"<br>")}</span>' if v else f'<span class="m">[ไม่มีข้อมูล{": "+miss if miss else ""}]</span>'
def build_suep(b):
    F=(b.get('snap') or {}).get('fields',{}); pages=[]
    rank=c(F.get('comRank')); nm=' '.join(x for x in [c(F.get('comFName')),c(F.get('comLName'))] if x)
    case=c(F.get('caseName')) or c(b.get('caseName'))
    evs=[x for x in events(b) if x['title']!='แผนขั้นต่อไป']
    for n,x in enumerate(evs,1):
        det=''.join(f'<p class="dl">- {html.escape(l)}: {F_(v,"")}</p>' for l,v in x['det'])
        when=F_(thd(x['date'],True),'วันที่')+(' เวลา '+F_(x.get('time'),'')+' น.' if c(x.get('time')) else '')
        pages.append(f'''<div class="pg"><p class="ttl">บันทึกข้อความ</p>
<p class="ln"><b>ส่วนราชการ</b>  กองร้อยตำรวจตระเวนชายแดนที่ ๒๔๔  อ.เมืองบึงกาฬ  จ.บึงกาฬ</p>
<p class="ln"><b>ที่</b> <span class="m">[ไม่มีข้อมูล: เลขที่หนังสือ]</span>  <b>วันที่</b> {F_(thd(x['date'],True),'วันที่')}</p>
<div class="rule"></div>
<p class="ln"><b>เรื่อง</b>  รายงานการสืบสวน {F_(case,'ชื่อคดี')} (ครั้งที่ {th(n)})</p>
<div class="rule"></div>
<p class="ln"><b>เรียน</b>  ผบ.ร้อย ตชด.๒๔๔</p>
<p class="bd">เมื่อวันที่ {when} ({html.escape(x['title'])}) {F_(x['text'],'รายละเอียดการสืบสวน')}</p>{det}
{imgs(x['ph'])}
<p class="bd">ชปข.ร้อย ตชด.๒๔๔ จะทำการสืบสวนหาข้อมูล หากทราบข้อมูลเพิ่มเติมจะรายงานให้ทราบ ต่อไป</p>
<p class="bd">จึงเรียนมาเพื่อโปรดทราบ</p>
<div class="sg">{F_(rank,'ยศ')}<br><br>( {F_(nm,'ชื่อผู้ลงนาม')} )<br>หัวหน้าชุด ชปข.ร้อย ตชด.๒๔๔</div>
<p class="nt">แหล่งข้อมูล: {x['src']} · สีเทา = ข้อมูลที่ดึงมากรอก · สีแดง = ยังไม่มีข้อมูล ต้องกรอกเอง</p></div>''')
    if not pages: pages.append('<div class="pg"><p class="ttl">บันทึกข้อความ</p><p class="m">[ยังไม่มีเหตุการณ์ในคดีนี้]</p></div>')
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{SCSS}</style></head><body>{"".join(pages)}</body></html>'
def _pdf(h,margin=None):
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(); pg.set_content(h); pg.wait_for_timeout(400)
        kw=dict(format='A4',print_background=True,prefer_css_page_size=True)
        pdf=pg.pdf(**kw); b.close()
    return pdf
def render_progress(b,out=None):
    pdf=_pdf(build_progress(b))
    if out: open(out,'wb').write(pdf)
    return pdf
def render_suep(b,out=None):
    pdf=_pdf(build_suep(b))
    if out: open(out,'wb').write(pdf)
    return pdf
