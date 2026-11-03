from playwright.sync_api import sync_playwright
import sys
host=sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:150]))
    pg.goto(host+'/'); pg.wait_for_timeout(2000); pg.goto(host+'/track/'); pg.select_option('#uid','u-nattawut'); pg.fill('#code','244'); pg.click('#f button, #f [type=submit]')
    for i in range(30):
        pg.wait_for_timeout(5000); s=pg.inner_text('#home-status'); print(i*5,repr(s),pg.locator('#view-home').is_visible(),flush=True)
        if i>2 and 'บช.' not in s: break
    print('errs',errs); b.close()
