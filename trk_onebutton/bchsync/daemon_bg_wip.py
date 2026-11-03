# เครื่อง box: เฝ้าคำขอ "ดาวน์โหลดความคืบหน้า" จากแอปติดตาม แล้วดึงข้อมูล บช. (อ่านอย่างเดียว) ส่งเข้า GAS
# ใช้: BCH_TCHD_PASSWORD ต้องมีใน env; TRK_EXEC = URL /exec ของ deployment ที่จะป้อนข้อมูล
import os,sys,time,json,base64,traceback,requests
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from pull import pull; from render import render_progress, render_suep
FT={'รูปผู้ต้องหา':'suspect','รูปของกลาง':'evidence','รูปรถ':'vehicle','รูปภาพ (หัวหน้า)':'leader','รูปภาพ (ผู้รายงาน)':'reporter','ไฟล์ Timeline':'timeline','ตราสัญลักษณ์':'symbol'}
CACHE=os.path.join(os.path.dirname(os.path.abspath(__file__)),'cache'); os.makedirs(CACHE,exist_ok=True)
EXEC=os.environ.get('TRK_EXEC') or open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'exec_url')).read().strip()
KEY=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'.key')).read().strip()
def call(fn,*a):
    r=requests.post(EXEC,data=json.dumps({'__w':1,'fn':fn,'a':list(a)}),headers={'Content-Type':'text/plain'},timeout=300)
    j=r.json()
    if not j.get('ok'): raise RuntimeError(j.get('e'))
    return j['v']
def fid(u):
    import re; m=re.search(r'(?:id=|/d/)([A-Za-z0-9_-]{20,})',str(u or '')); return m.group(1) if m else ''
def once(force=False,nopdf=False):
    q=call('bchSyncPending',KEY,force)
    if not q.get('pending'): return False
    rid=q['reqId']; known=set(q.get('known') or [])
    try:
        d=pull(); blobs={}; got={}
        def dl(i):
            fp=os.path.join(CACHE,i)
            if os.path.exists(fp): return open(fp+'.mime').read(),open(fp,'rb').read()
            r=requests.get('https://drive.google.com/uc?export=download&id='+i,timeout=120)
            ct=r.headers.get('content-type','').split(';')[0]
            if r.status_code!=200 or 'html' in ct: return None
            open(fp,'wb').write(r.content); open(fp+'.mime','w').write(ct); return ct,r.content
        for row in d['dash']:
            for k,v in row.items():
                i=fid(v) if 'drive.google' in str(v) else ''
                if not i: continue
                x=dl(i)
                if x: got[i]=x
                if x and i not in known: blobs[i]={'mime':x[0],'data':base64.b64encode(x[1]).decode()}
        d['blobs']=blobs
        res=call('bchSyncIngest',KEY,rid,json.dumps(d,ensure_ascii=False))
        for r in res.get('results',[]):
            if not r.get('hash') or q.get('noPdf') or nopdf: continue  # ดึงจากหน้าแรก: ไม่สร้าง PDF
            if q.get('caseId') and r['caseId']!=q['caseId'] and not (r.get('needPdf') or r.get('needSuep')): continue  # กดจากเคสไหน สร้างใหม่เฉพาะเคสนั้น
            r['needPdf']=r['needSuep']=True  # ทุกครั้งที่กดดาวน์โหลด: สร้างใหม่ทับไฟล์เดิม (fileId เดิม)
            bd=call('bchCaseBundle',KEY,r['caseId'])
            json.dump(bd,open(os.path.join(CACHE,r['caseId']+'.bundle.json'),'w'),ensure_ascii=False)
            if r.get('needPdf'):
                pdf=render_progress(bd,os.path.join(CACHE,r['caseId']+'.pdf')); call('bchSavePdf',KEY,r['caseId'],base64.b64encode(pdf).decode(),r['hash'],'progress'); r['pdf']='saved'
            if r.get('needSuep'):
                pdf=render_suep(bd,os.path.join(CACHE,r['caseId']+'.suep.pdf')); call('bchSavePdf',KEY,r['caseId'],base64.b64encode(pdf).decode(),r['hash'],'suep'); r['suep']='saved'
        call('bchSyncDone',KEY,rid)
        for r in res.get('results',[]): r.pop('snap',None)
        print(time.strftime('%F %T'),'ingest',json.dumps(res,ensure_ascii=False)[:500],flush=True)
    except Exception as e:
        traceback.print_exc(); call('bchSyncFail',KEY,rid,str(e)[:150])
    return True
if __name__=='__main__':
    # 06:30 daily pull and the half-hour background pull are removed.
    if '--once' in sys.argv: print(once(force=False)); sys.exit()
    while True:
        try: once(force=False)
        except Exception as e: print(time.strftime('%F %T'),'poll err',str(e)[:200],flush=True)
        time.sleep(10)
