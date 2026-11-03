from playwright.sync_api import sync_playwright
import sys,subprocess,re
host=sys.argv[1]; tag=sys.argv[2]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':390,'height':844},accept_downloads=True,is_mobile=True,has_touch=True); pg=c.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:150]))
    pg.goto(host+'/'); pg.wait_for_timeout(2000); pg.goto(host+'/track/'); pg.select_option('#uid','u-nattawut'); pg.fill('#code','244'); pg.click('#f button, #f [type=submit]')
    pg.wait_for_timeout(8000)
    for key,cid,bad in [('162,000','162k',['ชาญชัย แก่นท้าว']),('ชาญชัย','chan',['กิตติศักดิ์','วรายุทธ','รุ่งอรุณ','จำรัส'])]:
        pg.get_by_text(key).first.click(timeout=15000); pg.wait_for_timeout(12000)
        n_page=pg.locator('#entry-list > *').count()
        print('==',key,'page entries:',n_page)
        print('persons:',pg.inner_text('#target-list')[:900].replace('\n',' / '))
        links=[]
        for bid,k in [('#btn-progress','p'),('#btn-suep','s'),('#btn-progress','p2')]:
            with pg.expect_download(timeout=300000) as d: pg.click(bid)
            f=f'/workspace/unify/bchsync/{tag}_{cid}_{k}.pdf'; d.value.save_as(f); pg.wait_for_timeout(2500)
            txt=subprocess.run(['pdftotext',f,'-'],capture_output=True,text=True).stdout
            if k=='s': n=len(re.findall('บันทึกข้อความ',txt))
            else: n=len(set(re.findall(r'(?m)^\s*(\d+)\. ',txt)))
            links.append(pg.eval_on_selector('#bch-links','e=>[...e.querySelectorAll("a")].map(a=>a.href).join(" ")'))
            print('dl',k,'pdf events',n,'| foreign',[x for x in bad if x in txt],'| on case',pg.is_visible('#view-case'))
        print('same fileId across clicks:',links[0]==links[2], links[0][:160])
        pg.go_back(); pg.wait_for_timeout(4000)
        print('phone-back after download -> url',pg.url,'| home list visible',pg.is_visible('#view-home'),'| case',pg.is_visible('#view-case'))
    pg.go_back(); pg.wait_for_timeout(3000); print('back again at list -> url',pg.url,'home',pg.is_visible('#view-home'))
    print('errs',errs); b.close()
