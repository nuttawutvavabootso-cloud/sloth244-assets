from playwright.sync_api import sync_playwright
import sys,subprocess
host=sys.argv[1]; tag=sys.argv[2]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':390,'height':844},accept_downloads=True,is_mobile=True,has_touch=True); pg=c.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:150]))
    pg.goto(host+'/track/'); pg.select_option('#uid','u-nattawut'); pg.fill('#code','244'); pg.click('#f button, #f [type=submit]')
    pg.wait_for_timeout(8000)
    for key,cid,bad in [('162,000','162k',['ชาญชัย แก่นท้าว']),('ชาญชัย','chan',['กิตติศักดิ์','วรายุทธ','รุ่งอรุณ','จำรัส'])]:
        pg.get_by_text(key).first.click(timeout=15000); pg.wait_for_timeout(15000)
        print('==',key,'| bch-data:',pg.inner_text('#bch-data')[:60].replace('\n',' '))
        cnt=pg.evaluate("""()=>['ดาวน์โหลด PDF ความคืบหน้า','ดาวน์โหลดบันทึกสืบ','อัปโหลดไทม์ไลน์ บช.','ดาวน์โหลด PDF','ดาวน์โหลดโปสเตอร์'].map(t=>t+':'+[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()===t).length)""")
        print('buttons',cnt)
        print('target card:',pg.inner_text('#target-list')[:700].replace('\n',' / '))
        im=pg.locator('#view-case img:visible').first
        if im.count():
            im.click(); pg.wait_for_timeout(500); print('lightbox',pg.is_visible('#lightbox'),'dl-btn',pg.is_visible('#lb-dl')); pg.click('#lb-close'); pg.wait_for_timeout(500); print('after close', pg.evaluate("[document.getElementById('lightbox').hidden, getComputedStyle(document.getElementById('lightbox')).display, document.querySelectorAll('#lightbox').length]"))
        for bid,k in [('#btn-progress','p'),('#btn-suep','s')]:
            with pg.expect_download(timeout=240000) as d: pg.click(bid)
            f=f'/workspace/unify/bchsync/{tag}_{cid}_{k}.pdf'; d.value.save_as(f); pg.wait_for_timeout(2500)
            txt=subprocess.run(['pdftotext',f,'-'],capture_output=True,text=True).stdout
            print('dl',d.value.suggested_filename,'| still on case:',pg.is_visible('#view-case'),pg.inner_text('#case-name')[:30],'| foreign names:',[x for x in bad if x in txt])
        print('links',pg.inner_text('#bch-links').replace('\n',' '))
        pg.reload(); pg.wait_for_timeout(9000); print('after reload on case:',pg.is_visible('#view-case'),pg.inner_text('#case-name')[:30])
        pg.screenshot(path=f'{tag}_{cid}.png',full_page=True)
        pg.click('#btn-back') if pg.is_visible('#btn-back') else None; pg.wait_for_timeout(5000)
    print('errs',errs); b.close()
