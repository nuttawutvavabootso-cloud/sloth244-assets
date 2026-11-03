"""On-demand worker for one case update.

The web app creates a job only when someone presses อัปเดตข้อมูล on a case.
This process then reads that one remote record (matched by bchCaseId), stores
it, and rebuilds the progress PDF plus the per-day memos. It does not pull
when a case is opened, and it has no 06:30 or interval pull.
"""
import base64
import json
import os
import sys
import time
import traceback

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pull import pull_one
from render import render_progress, render_suep_files

ROOT = os.path.dirname(os.path.abspath(__file__))


def tracking_exec():
    url = (os.environ.get('TRK_EXEC') or '').strip()
    if url:
        return url
    path = os.path.join(ROOT, 'exec_url')
    if os.path.exists(path):
        return open(path, encoding='utf-8').read().strip()
    raise SystemExit('TRK_EXEC is not set')


def sync_key():
    key = (os.environ.get('BCH_SYNC_KEY') or '').strip()
    if key:
        return key
    path = os.path.join(ROOT, '.key')
    if os.path.exists(path):
        return open(path, encoding='utf-8').read().strip()
    raise SystemExit('BCH_SYNC_KEY is not set')


def call(fn, *args):
    response = requests.post(
        tracking_exec(),
        data=json.dumps({'__w': 1, 'fn': fn, 'a': list(args)}, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'text/plain; charset=utf-8'},
        timeout=300,
    )
    response.raise_for_status()
    body = response.json()
    if not body.get('ok'):
        raise RuntimeError(body.get('e'))
    return body['v']


def _fail(req_id, message):
    call('bchUpdateFail', sync_key(), req_id, str(message)[:150])


def do_update(job):
    req_id = job['reqId']
    case_id = job.get('caseId') or ''
    bch_id = job.get('bchCaseId') or ''
    try:
        if not bch_id or not case_id:
            _fail(req_id, 'ไม่มี bchCaseId')
            return
        selected = pull_one(bch_id, job.get('index') or [])
        action = selected.get('action')
        if action == 'absent':
            _fail(req_id, 'ไม่พบรายการใน บช. ที่รหัสตรงกับ bchCaseId')
            return
        if action == 'ambiguous':
            _fail(req_id, 'พบมากกว่า 1 รายการที่รหัสตรงกัน จึงไม่บันทึก')
            return
        plan = selected.get('plan') or {}
        payload = {
            'bchCaseId': plan.get('bchCaseId') or bch_id,
            'ongoing': plan.get('ongoing') or {},
            'dash': plan.get('dash') or {},
            'blobs': plan.get('blobs') or {},
            'contentHash': plan.get('contentHash') or '',
            'unchanged': plan.get('action') == 'skip',
        }
        saved = call('bchSyncIngestOne', sync_key(), req_id, json.dumps(payload, ensure_ascii=False))
        saved_case = saved.get('caseId') or (saved.get('result') or {}).get('caseId') or ''
        if saved_case != case_id:
            _fail(req_id, saved.get('skipped') or 'จับคู่เคสไม่ลง')
            return
        bundle = call('bchCaseBundle', sync_key(), case_id)
        pdf = render_progress(bundle)
        call('bchSavePdf', sync_key(), case_id, base64.b64encode(pdf).decode('ascii'), 'stored', 'progress')
        files = render_suep_files(bundle)
        call(
            'bchSaveSuepFiles',
            sync_key(),
            case_id,
            [{'name': name, 'mime': mime, 'b64': base64.b64encode(data).decode('ascii')} for name, data, mime in files],
        )
        call('bchUpdateDone', sync_key(), req_id)
        print(time.strftime('%F %T'), 'update', case_id, 'pdf', len(pdf), 'files', len(files), flush=True)
    except Exception as exc:
        try:
            _fail(req_id, exc)
        except Exception:
            traceback.print_exc()
        raise


def run_job():
    job = call('bchWorkPending', sync_key())
    if job.get('kind') == 'update':
        do_update(job)
        return True
    return False


def once():
    """Process one queued update if the button created it. Never starts a pull."""
    return run_job()


def main():
    if '--once' in sys.argv:
        once()
        return
    while True:
        try:
            if not run_job():
                time.sleep(3)
        except Exception as exc:
            print(time.strftime('%F %T'), 'worker', str(exc)[:200], flush=True)
            time.sleep(5)


if __name__ == '__main__':
    main()
