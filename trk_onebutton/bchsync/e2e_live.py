from playwright.sync_api import sync_playwright
import sys
host='https://tchd244-portal.sloth244.workers.dev'
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':420,'height':900},accept_downloads=True); pg=c.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:150]))
    pg.goto(host+'/track/'); pg.select_option('#uid','u-nattawut'); pg.fill('#code','244'); pg.click('#f button, #f [type=submit]')
    pg.wait_for_timeout(8000)
    print('btn-new visible',pg.is_visible('#btn-new'))
    pg.get_by_text('162,000').first.click(timeout=15000); pg.wait_for_timeout(9000)
    print('add-entry',pg.is_visible('#btn-add-entry'),'add-target',pg.is_visible('#btn-add-target'),'edit-ext',pg.is_visible('#btn-edit-ext'),'progress',pg.is_visible('#btn-progress'),'poster',pg.is_visible('#btn-case-slide'))
    print('BCH:',pg.inner_text('#bch-data')[:600])
    pg.locator('#ext-box').scroll_into_view_if_needed(); pg.screenshot(path='e2e_case.png')
    with pg.expect_download(timeout=240000) as d: pg.click('#btn-progress')
    d.value.save_as('/workspace/unify/bchsync/out_'+sys.argv[1]+'.pdf'); print('dl',d.value.suggested_filename)
    print('panel',pg.inner_text('#dl-text') if pg.locator('#dl-text').count() else '')
    print('errs',errs); b.close()
