"""Headless session for the external case web app.

Reads reuse a saved Playwright storage state (cookies). Calls go through the
page's Apps Script client (`google.script.run`), which posts to the web app
endpoint. No browser window is opened. The client refuses any function that
writes, edits, or deletes.
"""
import json
import os

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_EXEC = 'https://script.google.com/macros/s/AKfycbznIfamZANZAR6yQPNGdwvpzRGvlRflARViZL6icF07tbQFB0sl1xLUQ6eZtEo_FP1aSA/exec'
READONLY = ('getOngoingCasesForUnit', 'getDashboardData')

_CALL = """(spec) => new Promise((ok, no) => {
  const run = google.script.run
    .withSuccessHandler((value) => ok(JSON.stringify(value)))
    .withFailureHandler((err) => no(String(err)));
  run[spec.fn](...(spec.args || []));
})"""

_DASHBOARD = """() => new Promise((ok, no) => {
  google.script.run
    .withSuccessHandler((value) => ok(JSON.stringify(value)))
    .withFailureHandler((err) => no(String(err)))
    .getDashboardData(currentUser);
})"""


def exec_url():
    return os.environ.get('BCH_EXEC_URL') or DEFAULT_EXEC


def state_path():
    return os.environ.get('BCH_STORAGE_STATE') or os.path.join(ROOT, 'state', 'storage_state.json')


class BchSession(object):
    def __init__(self):
        self._playwright = None
        self._browser = None
        self._context = None
        self.page = None
        self.frame = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False

    def open(self):
        path = state_path()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        kwargs = {}
        if os.path.exists(path) and os.path.getsize(path) > 2:
            kwargs['storage_state'] = path
        self._context = self._browser.new_context(**kwargs)
        self.page = self._context.new_page()
        self.page.goto(exec_url(), wait_until='domcontentloaded', timeout=90000)
        self.frame = self._ensure_frame()
        self._context.storage_state(path=path)
        return self

    def close(self):
        try:
            if self._context and self.page:
                self._context.storage_state(path=state_path())
        except Exception:
            pass
        try:
            if self._browser:
                self._browser.close()
        finally:
            self._browser = None
            if self._playwright:
                self._playwright.stop()
                self._playwright = None

    def call(self, fn, *args):
        if fn not in READONLY:
            raise RuntimeError('read-only client refuses ' + str(fn))
        if fn == 'getDashboardData':
            raw = self.frame.evaluate(_DASHBOARD)
        else:
            raw = self.frame.evaluate(_CALL, {'fn': fn, 'args': list(args)})
        return json.loads(raw)

    def _ensure_frame(self):
        page = self.page
        page.wait_for_timeout(1500)
        if 'accounts.google.com' in (page.url or ''):
            raise SystemExit('Google session expired. Refresh BCH_STORAGE_STATE on the box; this worker stays headless and will not open a window.')
        for _ in range(30):
            login = self._frame_with('#loginUser')
            if login:
                self._login(login)
                break
            ready = self._frame_with_script()
            if ready:
                return ready
            page.wait_for_timeout(500)
        ready = self._frame_with_script()
        if not ready:
            raise SystemExit('Could not reach the external web app (no Apps Script client in the page).')
        return ready

    def _login(self, frame):
        password = os.environ.get('BCH_TCHD_PASSWORD') or ''
        if not password:
            raise SystemExit('BCH_TCHD_PASSWORD is not set')
        user = os.environ.get('BCH_TCHD_USER') or '244'
        frame.fill('#loginUser', user)
        frame.fill('#loginPass', password)
        frame.locator('button:has-text("เข้าสู่ระบบ")').first.click()
        frame.page.wait_for_timeout(2500)
        try:
            if frame.locator('#loginUser').is_visible():
                raise SystemExit('LOGIN FAIL')
        except SystemExit:
            raise
        except Exception:
            pass

    def _frame_with(self, selector):
        for frame in self.page.frames:
            try:
                if frame.locator(selector).count():
                    return frame
            except Exception:
                continue
        return None

    def _frame_with_script(self):
        for frame in self.page.frames:
            try:
                ok = frame.evaluate('() => !!(window.google && google.script && google.script.run)')
            except Exception:
                ok = False
            if ok:
                return frame
        return None
