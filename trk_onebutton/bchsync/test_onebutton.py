"""Offline checks for the one-button update. No browser and no external system."""
import io
import os
import sys
import types
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
TRK = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)


def _stub_requests():
    try:
        import requests  # noqa: F401
        return
    except Exception:
        pass
    module = types.ModuleType('requests')

    def _blocked(*_args, **_kwargs):
        raise RuntimeError('network is disabled in offline tests')

    module.get = _blocked
    module.post = _blocked
    sys.modules['requests'] = module


def _stub_playwright():
    try:
        import playwright.sync_api  # noqa: F401
        return
    except Exception:
        pass
    package = types.ModuleType('playwright')
    sync = types.ModuleType('playwright.sync_api')

    def sync_playwright():
        raise RuntimeError('playwright is not used by these tests')

    sync.sync_playwright = sync_playwright
    package.sync_api = sync
    sys.modules['playwright'] = package
    sys.modules['playwright.sync_api'] = sync


_stub_requests()
_stub_playwright()

import daemon  # noqa: E402
import incremental  # noqa: E402
import pull  # noqa: E402
import render  # noqa: E402

FILE_A = 'A' * 28
FILE_B = 'B' * 28
URL_A = 'https://drive.google.com/file/d/' + FILE_A + '/view'
URL_B = 'https://drive.google.com/file/d/' + FILE_B + '/view'


class FakeSession(object):
    def __init__(self, ongoing, dash):
        self.ongoing = ongoing
        self.dash = dash
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def call(self, fn, *args):
        self.calls.append(fn)
        if fn not in ('getOngoingCasesForUnit', 'getDashboardData'):
            raise AssertionError('refused non-read call ' + fn)
        if fn == 'getDashboardData':
            return self.dash
        return self.ongoing


def test_match_one_short_id_ignores_other_cases():
    ongoing = [
        {'caseId': 'A003-260213-9', 'caseName': 'ของจริง'},
        {'caseId': 'A061-261001-1', 'caseName': 'คนละเคส'},
    ]
    dash = [
        {'รหัสคดี': 'A003-260213-9', 'กองร้อย': 'ร้อย ตชด.244', 'อัปเดตล่าสุด': '2026-02-01', 'รูปผู้ต้องหา': URL_A, 'ชื่อ': 'ของจริง'},
        {'รหัสคดี': 'A061-261001-1', 'กองร้อย': 'ร้อย ตชด.244', 'รูปผู้ต้องหา': URL_B, 'ชื่อ': 'ของจริง'},
    ]
    session = FakeSession(ongoing, dash)
    fetched = []

    def fetch(fid):
        fetched.append(fid)
        return {'mime': 'image/jpeg', 'data': 'QQ=='}

    selected = pull.pull_one('A003-260213', index=[], session_factory=lambda: session, fetch=fetch)
    assert selected['action'] == 'ready'
    assert selected['plan']['bchCaseId'] == 'A003-260213-9'
    assert selected['plan']['dash']['รหัสคดี'] == 'A003-260213-9'
    assert fetched == [FILE_A]
    assert session.calls == ['getOngoingCasesForUnit', 'getDashboardData']


def test_full_id_does_not_take_a_sibling():
    ongoing = [{'caseId': 'A003-260213-1'}, {'caseId': 'A003-260213-2'}]
    result = incremental.select_one(ongoing, [], 'A003-260213-1', [])
    assert result['matches'] == ['A003-260213-1']


def test_ambiguous_short_id_does_not_guess():
    ongoing = [{'caseId': 'A003-260213-1'}, {'caseId': 'A003-260213-2'}]
    session = FakeSession(ongoing, [])
    fetched = []
    selected = pull.pull_one('A003-260213', session_factory=lambda: session, fetch=lambda fid: fetched.append(fid))
    assert selected['action'] == 'ambiguous'
    assert selected['plan'] is None
    assert fetched == []


def test_absent_when_id_is_missing():
    session = FakeSession([{'caseId': 'A003-260213-9'}], [])
    fetched = []
    selected = pull.pull_one('Z999-000000', session_factory=lambda: session, fetch=lambda fid: fetched.append(fid))
    assert selected['action'] == 'absent'
    assert fetched == []


def test_unchanged_record_does_not_download():
    ongoing = {'caseId': 'A003-260213'}
    dash = {'รหัสคดี': 'A003-260213', 'กองร้อย': 'ร้อย ตชด.244', 'อัปเดตล่าสุด': '2026-02-01', 'สถานะ': 'กำลังดำเนินการ'}
    known = {
        'caseId': 'case-1',
        'bchCaseId': 'A003-260213',
        'updated': '2026-02-01',
        'contentHash': incremental.content_hash(ongoing, dash),
        'files': [],
    }
    session = FakeSession([ongoing], [dash])
    fetched = []
    selected = pull.pull_one('A003-260213', index=[known], session_factory=lambda: session, fetch=lambda fid: fetched.append(fid))
    assert selected['plan']['action'] == 'skip'
    assert selected['plan']['blobs'] == {}
    assert selected['plan']['ongoing'] == {}
    assert fetched == []


def test_memos_group_by_day_even_when_split():
    bundle = {
        'caseName': 'ทดสอบ',
        'photos': {'entries': {}, 'targets': {}, 'bch': {}},
        'local': {'entries': [
            {'id': 'a', 'entryDate': '2026-01-02', 'text': 'เช้า', 'stage': '1', 'stageLabel': 'ได้ข่าว'},
            {'id': 'b', 'entryDate': '2026-01-03', 'text': 'บ่าย', 'stage': '2'},
            {'id': 'c', 'entryDate': '2026-01-02', 'text': 'ค่ำ', 'stage': '1'},
        ]},
        'snap': {'fields': {'caseName': 'ทดสอบ', 'comFName': 'สุริยา', 'comLName': 'วรรณพฤกษ์'}},
    }
    groups = render.group_by_day(bundle)
    assert [key for key, _items in groups] == ['2026-01-02', '2026-01-03']
    assert len(groups[0][1]) == 2
    package = zipfile.ZipFile(io.BytesIO(render.build_suep_docx(bundle, groups[0][1], 1)))
    xml = package.read('word/document.xml').decode('utf-8')
    assert 'เช้า' in xml and 'ค่ำ' in xml and 'บ่าย' not in xml
    source = open(os.path.join(ROOT, 'render.py'), encoding='utf-8').read()
    assert 'single=True' in source
    assert 'group_by_day' in source


def test_worker_updates_only_the_requested_case():
    calls = []

    def fake_call(fn, *args):
        calls.append(fn)
        if fn == 'bchWorkPending':
            return {'kind': 'update', 'reqId': 'bup-1', 'caseId': 'case-1', 'bchCaseId': 'A003-260213', 'index': []}
        if fn == 'bchSyncIngestOne':
            return {'caseId': 'case-1'}
        if fn == 'bchCaseBundle':
            return {'local': {'entries': []}, 'photos': {'entries': {}, 'targets': {}, 'bch': {}}, 'snap': {'fields': {}}}
        return {'ok': True}

    daemon.sync_key = lambda: 'test-key'
    daemon.call = fake_call
    daemon.pull_one = lambda bch_id, index=None: {
        'action': 'ready',
        'plan': {'action': 'ingest', 'bchCaseId': 'A003-260213-9', 'ongoing': {'caseId': 'A003-260213-9'}, 'dash': {}, 'blobs': {}, 'contentHash': 'abc'},
    }
    daemon.render_progress = lambda bundle: b'%PDF'
    daemon.render_suep_files = lambda bundle: [('บันทึกสืบ_ทดสอบ_ครั้งที่01_2026-01-02.docx', b'PK', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')]
    assert daemon.run_job() is True
    assert calls == ['bchWorkPending', 'bchSyncIngestOne', 'bchCaseBundle', 'bchSavePdf', 'bchSaveSuepFiles', 'bchUpdateDone']

    calls[:] = []
    daemon.pull_one = lambda bch_id, index=None: {'action': 'absent', 'plan': None}
    assert daemon.run_job() is True
    assert calls == ['bchWorkPending', 'bchUpdateFail']

    daemon.call = lambda fn, *args: {'kind': 'idle'}
    assert daemon.run_job() is False


def test_sources_have_no_automatic_pull():
    daemon_src = open(os.path.join(ROOT, 'daemon.py'), encoding='utf-8').read()
    watchdog = open(os.path.join(ROOT, 'watchdog.sh'), encoding='utf-8').read()
    app = open(os.path.join(TRK, 'trkH', 'App.html'), encoding='utf-8').read()
    index = open(os.path.join(TRK, 'trkH', 'Index.html'), encoding='utf-8').read()
    code = open(os.path.join(TRK, 'trkH', 'Code.js'), encoding='utf-8').read()
    web = open(os.path.join(TRK, 'trkH', 'WebApi.js'), encoding='utf-8').read()
    assert 'bchKick' not in daemon_src
    assert 'def pull(' not in daemon_src
    assert '(6,30)' not in daemon_src and '(6, 30)' not in daemon_src
    assert 'cron' not in watchdog
    for name in ('daemon_v73.py', 'daemon_bg_wip.py'):
        old = open(os.path.join(ROOT, name), encoding='utf-8').read()
        assert '(6,30)' not in old and 'force=True' not in old
    assert 'homeBchPull' not in app
    assert 'bchRequestSync' not in app
    assert 'bchRequestUpdate' in app
    assert 'id="btn-update-data"' in index and 'อัปเดตข้อมูล' in index
    for gone in ('id="btn-progress"', 'id="btn-suep"', 'id="btn-case-pdf"', 'id="btn-case-slide"', 'id="btn-case-memo"'):
        assert gone not in index
    assert "kind: 'sync'" not in code
    assert "kind: 'update'" in code
    assert 'pending: false' in code
    assert 'function webApi_' in web


def main():
    tests = [value for name, value in sorted(globals().items()) if name.startswith('test_') and callable(value)]
    for test in tests:
        test()
        print('ok', test.__name__)
    print('offline tests passed', len(tests))


if __name__ == '__main__':
    main()
