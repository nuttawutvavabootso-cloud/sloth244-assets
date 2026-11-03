"""On-demand worker for the tracking app.

Polls only for jobs the web app created when someone opened it (incremental
pull) or pressed download (rebuild a file from stored data). There is no
daily pull and no interval pull.
"""
import base64
import json
import os
import sys
import time
import traceback

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pull import pull
from render import render_progress, render_suep

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


EXEC = tracking_exec()
KEY = sync_key()


def call(fn, *args):
    response = requests.post(
        EXEC,
        data=json.dumps({'__w': 1, 'fn': fn, 'a': list(args)}, ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type': 'text/plain; charset=utf-8'},
        timeout=300,
    )
    response.raise_for_status()
    body = response.json()
    if not body.get('ok'):
        raise RuntimeError(body.get('e'))
    return body['v']


def do_sync(job):
    req_id = job['reqId']
    try:
        result = pull(job.get('index') or [])
        seen = set()
        skipped = 0
        ingested = 0
        files = 0
        for plan in result['plans']:
            files += len(plan.get('blobs') or {})
            payload = {
                'bchCaseId': plan['bchCaseId'],
                'ongoing': plan.get('ongoing') or {},
                'dash': plan.get('dash') or {},
                'blobs': plan.get('blobs') or {},
                'contentHash': plan['contentHash'],
                'unchanged': plan['action'] == 'skip',
            }
            saved = call('bchSyncIngestOne', KEY, req_id, json.dumps(payload, ensure_ascii=False))
            case_id = saved.get('caseId') or (saved.get('result') or {}).get('caseId') or ''
            if case_id:
                seen.add(case_id)
            if plan['action'] == 'skip':
                skipped += 1
            else:
                ingested += 1
            for extra in saved.get('caseIds') or []:
                seen.add(extra)
        for case_id in (job.get('items') or {}):
            if case_id not in seen:
                call('bchSyncMark', KEY, req_id, case_id, 'absent', '')
        call('bchSyncDone', KEY, req_id)
        print(time.strftime('%F %T'), 'sync', 'skip', skipped, 'ingest', ingested, 'files', files, flush=True)
    except Exception as exc:
        try:
            call('bchSyncFail', KEY, req_id, str(exc)[:150])
        except Exception:
            traceback.print_exc()
        raise


def do_render(job):
    req_id = job['reqId']
    try:
        bundle = call('bchCaseBundle', KEY, job['caseId'])
        kind = job.get('fileKind') or 'progress'
        data = render_suep(bundle) if kind == 'suep' else render_progress(bundle)
        call('bchSavePdf', KEY, job['caseId'], base64.b64encode(data).decode('ascii'), 'stored', kind)
        call('bchRenderDone', KEY, req_id)
        print(time.strftime('%F %T'), 'render', kind, job['caseId'], len(data), flush=True)
    except Exception as exc:
        try:
            call('bchRenderFail', KEY, req_id, str(exc)[:150])
        except Exception:
            traceback.print_exc()
        raise


def once():
    # Do not call bchKick. A manual run only handles a job the case button created.
    return run_job()


def run_job():
    job = call('bchWorkPending', KEY)
    kind = job.get('kind')
    if kind == 'render':
        do_render(job)
        return True
    if kind == 'sync':
        do_sync(job)
        return True
    return False


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
