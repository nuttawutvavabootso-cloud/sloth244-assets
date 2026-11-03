from playwright.sync_api import sync_playwright
import sys
host='https://tchd244-portal.sloth244.workers.dev'
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':420,'height':900},accept_downloads=True); pg=c.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:150]))
    pg.goto(host+'/track/'); pg.select_option('#uid','u-nattawut'); pg.fill('#code','244'); pg.click('#f button, #f [type=submit]')
    pg.wait_for_timeout(8000)
    pg.get_by_text('162,000').first.click(timeout=15000); pg.wait_for_timeout(6000)
    print('upd-initial:',pg.inner_text('#bch-data')[:80].replace('\n',' | '))
    ed=pg.evaluate("""()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/แก้|เพิ่ม|ลบ|บันทึก|ส่ง/.test(b.textContent)).map(b=>b.textContent.trim())""")
    print('visible edit-like buttons:',ed)
    print('vis progress',pg.is_visible('#btn-progress'),'suep',pg.is_visible('#btn-suep'),'upload',pg.is_visible('#btn-bch-upload'))
    for _ in range(40):
        t=pg.inner_text('#bch-data')
        if 'กำลังอัปเดต' not in t: break
        pg.wait_for_timeout(5000)
    print('upd-after:',pg.inner_text('#bch-data')[:80].replace('\n',' | '))
    for bid,k in [('#btn-progress','p'),('#btn-suep','s')]:
        with pg.expect_download(timeout=240000) as d: pg.click(bid)
        d.value.save_as(f'/workspace/unify/bchsync/out3_{k}.pdf'); print('dl',d.value.suggested_filename); pg.wait_for_timeout(1500)
    print('links',pg.inner_text('#bch-links'))
    with c.expect_page(timeout=15000) as np: pg.click('#btn-bch-upload')
    print('newtab',np.value.url[:90])
    pg.screenshot(path='e2e3.png',full_page=True)
    print('errs',errs); b.close()
