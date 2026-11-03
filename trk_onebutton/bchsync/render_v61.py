# สร้าง PDF ความคืบหน้า (A4 พิมพ์ได้ หลายหน้า) จากข้อมูลที่ดึงจาก บช. — ใช้ข้อมูลจริงเท่านั้น ช่องว่าง/"-" ไม่แสดง
import html,os,datetime
from playwright.sync_api import sync_playwright
D=os.path.dirname(os.path.abspath(__file__))
LOGO=open(os.path.join(D,'logo.b64')).read().strip()
TH_M=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
def c(v):
    v=str(v if v is not None else '').strip(); return '' if v=='-' else v
def e(v): return html.escape(c(v)).replace('\n','<br>')
def thd(d):
    d=c(d)
    try: y,m,dd=map(int,d[:10].split('-')); return f'{dd} {TH_M[m]} {str(y+543)[2:]}'
    except Exception: return d
CSS='''@page{size:A4;margin:9mm}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'Sarabun','Noto Sans Thai','Loma',sans-serif;font-size:11.5pt;color:#e9f3ea;background:#0f2417}
.wrap{border:2px solid #c9a227;border-radius:10px;padding:14px 16px;background:#0f2417}
.hd{display:flex;gap:14px;align-items:center;border-bottom:2px solid #c9a227;padding-bottom:10px}
.hd img{width:78px;height:78px;object-fit:contain}
.t1{font-size:20pt;font-weight:700;color:#fff}.t2{font-size:13pt;font-weight:700;color:#f2c94c}.t3{font-size:11pt;color:#cfe3d3}
.cols{display:flex;gap:14px;margin-top:12px;align-items:flex-start}
.left{flex:1.25}.right{flex:1}
.it{display:flex;gap:10px;break-inside:avoid;page-break-inside:avoid;margin-bottom:10px}
.dt{width:62px;flex:none;text-align:right;color:#f2c94c;font-weight:700;font-size:10pt;padding-top:8px;border-right:3px solid #c9a227;padding-right:7px;position:relative}
.dt:after{content:'';position:absolute;right:-8px;top:12px;width:11px;height:11px;border-radius:50%;background:#f2c94c}
.card{flex:1;background:#173523;border:1px solid #3d6b4c;border-radius:8px;padding:8px 10px}
.card h3{margin:0 0 5px;font-size:12.5pt;color:#f2c94c}
.card p{margin:0 0 4px;line-height:1.5}
.ph{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.ph img{max-width:48%;max-height:130px;border-radius:5px;border:1px solid #3d6b4c}
.box{background:#132d1e;border:1.5px solid #c9a227;border-radius:8px;padding:9px 10px;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
.box h2{margin:0 0 7px;font-size:12.5pt;text-align:center;color:#fff;background:#2b5a3b;border-radius:5px;padding:4px}
.tg{display:flex;gap:8px}.tg img{width:78px;height:96px;object-fit:cover;border-radius:5px;border:1px solid #c9a227}
.tg b{color:#f2c94c}.k{color:#9cc5a6}
.ft{margin-top:8px;font-size:9pt;color:#9cc5a6;text-align:right}'''
def img(b64,mime): return f'<img src="data:{mime};base64,{b64}">' if b64 else ''
def build(snap,case_name,photos):
    F=snap.get('fields',{}); P=snap.get('photos',{})
    def pimg(t):
        x=photos.get(P.get(t,'') ,None) if False else photos.get(t)
        return img(*x) if x else ''
    items=[]
    n=0
    def add(date,title,text,extra=''):
        nonlocal n
        if not c(text) and not extra: return
        n+=1; items.append(f'<div class="it"><div class="dt">{e(thd(date))}</div><div class="card"><h3>{n}. {html.escape(title)}</h3>{"<p>"+e(text)+"</p>" if c(text) else ""}{extra}</div></div>')
    add(F.get('startDate'),'จุดเริ่มต้น / ที่ผ่านมา',F.get('casePast'))
    ev=[x for x in [c(F.get('evidMainType')),c(F.get('evidMainQty')),c(F.get('evidOther')),c(F.get('evidOtherExt'))] if x]
    ph=''.join(x for x in [pimg('evidence'),pimg('vehicle')] if x)
    add(snap.get('updated'),'ปัจจุบัน',F.get('casePresent'),('<p><span class="k">ของกลาง:</span> '+html.escape(' / '.join(ev))+'</p>' if ev else '')+(f'<div class="ph">{ph}</div>' if ph else ''))
    add(F.get('endDate'),'ผลการจับกุม/ปิดคดี',F.get('caseResult'))
    add('','แผนขั้นต่อไป',F.get('caseFuture'))
    tl=[]
    nm=' '.join(x for x in [c(F.get('intelFName')),c(F.get('intelLName'))] if x)
    if nm and c(F.get('intelTitle')) and not nm.startswith(c(F.get('intelTitle'))): nm=c(F.get('intelTitle'))+nm
    for k,lab in [('intelAlias','ฉายา'),('intelIDCard','เลขประจำตัว'),('intelPhone','โทร'),('intelBank','บัญชี'),('intelLocation','พิกัด/ที่อยู่')]:
        if c(F.get(k)): tl.append(f'<p><span class="k">{lab}:</span> {e(F.get(k))}</p>')
    veh=' '.join(x for x in [c(F.get('intelVehBrand')),c(F.get('intelVehModel')),c(F.get('intelVehColor')),c(F.get('intelVehPlate'))] if x)
    if veh: tl.append(f'<p><span class="k">ยานพาหนะ:</span> {html.escape(veh)}</p>')
    tgt=f'<div class="box"><h2>ข้อมูลบุคคลและพยานหลักฐาน</h2><div class="tg">{pimg("suspect")}<div><b>{html.escape(nm) if nm else "—"}</b>{"".join(tl)}</div></div></div>' if (nm or tl) else ''
    st=[]
    for k,lab in [('status','สถานะ'),('caseId','รหัสคดี บช.'),('relatedCase','คดีที่เกี่ยวข้อง'),('caseObstacle','ปัญหา/อุปสรรค'),('caseNeed','สิ่งที่ต้องการ')]:
        if c(F.get(k)): st.append(f'<p><span class="k">{lab}:</span> {e(F.get(k))}</p>')
    com=' '.join(x for x in [c(F.get('comRank')),c(F.get('comFName')),c(F.get('comLName'))] if x)
    if com: st.append(f'<p><span class="k">หัวหน้าชุด:</span> {html.escape(com)}</p>')
    if c(snap.get('reporter')): st.append(f'<p><span class="k">ผู้รายงาน:</span> {e(snap.get("reporter"))}</p>')
    stat=f'<div class="box"><h2>สรุปผลความคืบหน้าทางคดี</h2>{"".join(st)}</div>'
    now=datetime.datetime.now()
    sub=' · '.join(x for x in [c(snap.get('caseType')),('เริ่ม '+thd(F.get('startDate'))) if c(F.get('startDate')) else ''] if x)
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="wrap">
<div class="hd"><img src="data:image/png;base64,{LOGO}"><div><div class="t1">“กองร้อยตำรวจตระเวนชายแดนที่ 244”</div>
<div class="t2">TIMELINE ลำดับเหตุการณ์และการสืบสวนขยายผล</div><div class="t3">{e(F.get('caseName') or case_name)}{(' — '+html.escape(sub)) if sub else ''}</div></div></div>
<div class="cols"><div class="left">{''.join(items)}</div><div class="right">{tgt}{stat}</div></div>
<div class="ft">ข้อมูลจากระบบ บช.ตชด. อัปเดต {e(thd(snap.get('updated')))} · สร้างเมื่อ {now.day} {TH_M[now.month]} {now.year+543} {now:%H:%M} น. · เอกสารใช้ภายในหน่วย</div>
</div></body></html>'''
def render(snap,case_name,photos,out=None):
    h=build(snap,case_name,photos)
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(); pg.set_content(h); pg.wait_for_timeout(300)
        pdf=pg.pdf(format='A4',print_background=True,margin={'top':'9mm','bottom':'9mm','left':'9mm','right':'9mm'}); b.close()
    if out: open(out,'wb').write(pdf)
    return pdf
