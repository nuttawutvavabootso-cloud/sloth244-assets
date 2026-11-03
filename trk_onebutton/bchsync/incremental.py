"""Choose which external records and files still need to be fetched.

A record is unchanged when its content hash and updated timestamp both match
what Drive already stored. A file is skipped when its source id is already
in the case folder index. Nothing here contacts the network.
"""
import hashlib
import json
import re

PHOTO_FIELDS = {
    'รูปผู้ต้องหา': 'suspect',
    'รูปของกลาง': 'evidence',
    'รูปรถ': 'vehicle',
    'รูปภาพ (หัวหน้า)': 'leader',
    'รูปภาพ (ผู้รายงาน)': 'reporter',
    'ไฟล์ Timeline': 'timeline',
    'ตราสัญลักษณ์': 'symbol',
}

_FILE_ID = re.compile(r'(?:id=|/d/)([A-Za-z0-9_-]{20,})')
_UPDATED_KEY = 'อัปเดตล่าสุด'


def file_id(url):
    match = _FILE_ID.search(str(url or ''))
    return match.group(1) if match else ''


def valid_file_id(value):
    return bool(re.fullmatch(r'[A-Za-z0-9_-]{20,}', str(value or '')))


def content_hash(ongoing, dash):
    """Hash of the record, excluding the updated timestamp (compared on its own)."""
    fields = dict(dash or {})
    fields.pop(_UPDATED_KEY, None)
    body = {'ongoing': ongoing or {}, 'dash': fields}
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True, default=str, separators=(',', ':'))
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def remote_file_ids(dash):
    found = []
    seen = set()
    for field in PHOTO_FIELDS:
        fid = file_id((dash or {}).get(field))
        if fid and fid not in seen and valid_file_id(fid):
            seen.add(fid)
            found.append(fid)
    return found


def short_bch_id(full):
    return '-'.join(str(full or '').split('-')[:2])


def bch_ids_match(stored, remote_full):
    """True only when the stored id is the remote id or its short prefix.

    A shared short prefix between two different remote ids is not a match
    for a stored full id. Callers that find more than one remote id must
    stop instead of picking one.
    """
    stored = str(stored or '')
    remote_full = str(remote_full or '')
    if not stored or not remote_full:
        return False
    return stored == remote_full or stored == short_bch_id(remote_full) or remote_full == short_bch_id(stored)


def select_one(ongoing_list, dash_rows, bch_case_id, index=None):
    """Pick the single remote record whose id matches bch_case_id. No network."""
    target = str(bch_case_id or '').strip()
    dash_by = {}
    for row in dash_rows or []:
        if not isinstance(row, dict):
            continue
        key = str(row.get('') or row.get('รหัสคดี') or '')
        if key:
            dash_by[key] = row
    full_ids = []
    ongoing_by = {}
    for ongoing in ongoing_list or []:
        if not isinstance(ongoing, dict):
            continue
        full = str(ongoing.get('caseId') or '')
        if not full or not bch_ids_match(target, full):
            continue
        if full not in ongoing_by:
            full_ids.append(full)
            ongoing_by[full] = ongoing
    if not full_ids:
        return {'action': 'absent', 'plan': None, 'matches': []}
    if len(full_ids) > 1:
        return {'action': 'ambiguous', 'plan': None, 'matches': full_ids}
    full = full_ids[0]
    known = None
    for row in index or []:
        if not isinstance(row, dict):
            continue
        mapped = str(row.get('bchCaseId') or '')
        if mapped and bch_ids_match(mapped, full):
            known = row
            break
    ongoing = ongoing_by[full]
    dash = dash_by.get(full) or {}
    plan = plan_case(ongoing, dash, known)
    plan['bchCaseId'] = full
    plan['ongoing'] = ongoing
    plan['dash'] = dash
    return {'action': 'ready', 'plan': plan, 'matches': full_ids}


def match_known(bch_full, index):
    short = short_bch_id(bch_full)
    for row in index or []:
        mapped = str((row or {}).get('bchCaseId') or '')
        if mapped and (mapped == bch_full or mapped == short):
            return row
    return None


def plan_case(ongoing, dash, known):
    updated = str((dash or {}).get(_UPDATED_KEY) or '').strip()
    digest = content_hash(ongoing, dash)
    ids = remote_file_ids(dash)
    have = set()
    for item in (known or {}).get('files') or []:
        if valid_file_id(item):
            have.add(item)
    missing = [fid for fid in ids if fid not in have]
    meta_same = bool(known) and known.get('contentHash') == digest and str(known.get('updated') or '') == updated
    action = 'skip' if meta_same and not missing else 'ingest'
    return {
        'action': action,
        'contentHash': digest,
        'updated': updated,
        'download': missing,
        'metaChanged': not meta_same,
        'bchCaseId': str((ongoing or {}).get('caseId') or ''),
        'caseId': str((known or {}).get('caseId') or ''),
    }


def plan_pull(ongoing_list, dash_rows, index):
    """Pair ongoing rows with dashboard rows and return per-case plans."""
    dash_by = {}
    for row in dash_rows or []:
        if not isinstance(row, dict):
            continue
        key = str(row.get('') or row.get('รหัสคดี') or '')
        if key:
            dash_by[key] = row
    plans = []
    for ongoing in ongoing_list or []:
        if not isinstance(ongoing, dict):
            continue
        full = str(ongoing.get('caseId') or '')
        if not full:
            continue
        known = match_known(full, index)
        item = plan_case(ongoing, dash_by.get(full) or {}, known)
        item['bchCaseId'] = full
        item['ongoing'] = ongoing
        item['dash'] = dash_by.get(full) or {}
        plans.append(item)
    return plans
