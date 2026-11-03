"""Read-only incremental pull. Never calls a save, edit, or delete on the external app."""
import base64
import os
import re

import requests

from bch_session import BchSession
from incremental import plan_pull, select_one, valid_file_id

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, 'cache')
UNIT = ('บก.ตชด.ภ.2', 'กก.ตชด.24', 'ร้อย ตชด.244')


def fetch_file(fid):
    """Download one source file that Drive does not already have. Cache by id."""
    if not valid_file_id(fid):
        return None
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, fid)
    mime_path = path + '.mime'
    if os.path.exists(path) and os.path.exists(mime_path):
        mime = open(mime_path, encoding='utf-8').read().strip()
        data = base64.b64encode(open(path, 'rb').read()).decode('ascii')
        return {'mime': mime, 'data': data}
    response = requests.get('https://drive.google.com/uc?export=download&id=' + fid, timeout=120)
    mime = (response.headers.get('content-type') or '').split(';')[0].strip()
    if response.status_code != 200 or 'html' in mime or not response.content:
        return None
    with open(path, 'wb') as handle:
        handle.write(response.content)
    with open(mime_path, 'w', encoding='utf-8') as handle:
        handle.write(mime)
    return {'mime': mime, 'data': base64.b64encode(response.content).decode('ascii')}


def pull_one(bch_case_id, index=None, session_factory=None, fetch=None):
    """Read one remote record matched by bch_case_id. Never writes remotely."""
    factory = session_factory or BchSession
    fetcher = fetch or fetch_file
    with factory() as session:
        ongoing = session.call('getOngoingCasesForUnit', *UNIT)
        dash = session.call('getDashboardData')
    if not isinstance(ongoing, list):
        ongoing = []
    if not isinstance(dash, list):
        dash = []
    rows = [row for row in dash if isinstance(row, dict) and '244' in str(row.get('กองร้อย', ''))]
    selected = select_one(ongoing, rows, bch_case_id, index or [])
    plan = selected.get('plan')
    if not plan:
        return selected
    if plan.get('action') == 'skip':
        plan['ongoing'] = {}
        plan['dash'] = {}
        plan['blobs'] = {}
        return selected
    blobs = {}
    for fid in plan.get('download') or []:
        got = fetcher(fid)
        if got:
            blobs[fid] = got
    plan['blobs'] = blobs
    return selected


def pull(index=None):
    with BchSession() as session:
        ongoing = session.call('getOngoingCasesForUnit', *UNIT)
        dash = session.call('getDashboardData')
    if not isinstance(ongoing, list):
        ongoing = []
    if not isinstance(dash, list):
        dash = []
    rows = [row for row in dash if isinstance(row, dict) and '244' in str(row.get('กองร้อย', ''))]
    plans = plan_pull(ongoing, rows, index or [])
    for plan in plans:
        if plan['action'] == 'skip':
            plan['ongoing'] = {}
            plan['dash'] = {}
            plan['blobs'] = {}
            continue
        blobs = {}
        for fid in plan['download']:
            got = fetch_file(fid)
            if got:
                blobs[fid] = got
        plan['blobs'] = blobs
    return {'plans': plans}
