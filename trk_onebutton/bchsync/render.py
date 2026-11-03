"""Build case files from data already stored by the tracking app.

render_progress writes one continuous portrait PDF per case (one long page,
not one sheet per note). Timeline entries are the notes on that page.

render_suep_files writes one Word document per timeline day, plus one PDF that
joins every memo. Same-day notes share a file even when they are not adjacent.
Each memo follows the unit pattern: TH Sarabun New, the same headings, margins
and signature block. Missing values stay red placeholders.
"""
import base64
import html
import io
import subprocess
import tempfile
import os
import re
import zipfile

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))


def logo_b64():
    path = os.path.join(ROOT, 'logo.b64')
    if not os.path.exists(path):
        raise RuntimeError('logo.b64 is missing')
    return open(path, encoding='utf-8').read().strip()


TH_M = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
STAGE = {'1': 'รับข้อมูล/เริ่มสืบ', '2': 'สืบสวนหาข้อมูล', '3': 'ยืนยันเป้าหมาย', '4': 'ปฏิบัติการ', '5': 'ปิดเคส'}
THD = str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙')


def c(value):
    text = str(value if value is not None else '').strip()
    return '' if text in ('-', 'undefined', 'null') else text


def e(value):
    return html.escape(c(value)).replace('\n', '<br>')


def thd(value, full=False):
    text = c(value)
    try:
        year, month, day = map(int, text[:10].split('-'))
        year = year + 543 if year < 2400 else year
        return '%d %s %s' % (day, TH_M[month], year if full else str(year)[2:])
    except Exception:
        return text


def th(value):
    return str(value).translate(THD)


def imgs(urls, cls='ph'):
    safe = [item for item in urls if item and str(item).startswith('data:image')]
    if not safe:
        return ''
    tags = ''.join('<img src="%s" alt="">' % item for item in safe)
    return '<div class="%s">%s</div>' % (cls, tags)


MEMO_STAGE = {
    '1': 'ได้ข่าว',
    '2': 'พิสูจน์ทราบตัวบุคคล',
    '3': 'เฝ้าติดตาม',
    '4': 'รวบรวมหลักฐาน/ขอหมายจับ',
    '5': 'จับกุมแล้ว',
}
FULL_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
MEMO_UNIT = 'กองร้อยตำรวจตระเวนชายแดนที่ 244'
MEMO_RED = 'C00000'
FACT_LABEL = {
    'บุคคล': 'บุคคลที่เกี่ยวข้อง',
    'โทรศัพท์': 'หมายเลขโทรศัพท์ที่เกี่ยวข้อง',
    'ทะเบียนรถ': 'ทะเบียนรถที่เกี่ยวข้อง',
}


def events(bundle):
    """Timeline notes, in the same order as the tracking page."""
    photos = bundle['photos']
    found = []
    for entry in bundle['local']['entries']:
        details = [(label, entry.get(key)) for key, label in (
            ('people', 'บุคคล'), ('phones', 'โทรศัพท์'), ('plates', 'ทะเบียนรถ')
        ) if c(entry.get(key))]
        raw_photos = (photos.get('entries') or {}).get(entry['id'], []) or []
        listed = entry.get('photoFiles') or entry.get('photoNames') or []
        if not isinstance(listed, list):
            listed = []
        urls = []
        names = []
        for index, photo in enumerate(raw_photos):
            if isinstance(photo, dict):
                urls.append(photo.get('url') or photo.get('data') or '')
                names.append(c(photo.get('name')))
            else:
                urls.append(photo)
                names.append(c(listed[index]) if index < len(listed) else '')
        found.append({
            'date': entry.get('entryDate'),
            'time': entry.get('eventTime'),
            'title': c(entry.get('stageLabel')) or STAGE.get(c(entry.get('stage')), 'บันทึกความคืบหน้า'),
            'stage': c(entry.get('stage')),
            'stageLabel': c(entry.get('stageLabel')),
            'src': 'ระบบติดตามคดี',
            'text': entry.get('text'),
            'det': details,
            'ph': urls,
            'photoNames': names,
            'author': entry.get('authorName'),
            'createdAt': entry.get('createdAt') or '',
        })
    return found


def group_by_day(bundle):
    """One group per timeline calendar day, in first-seen order."""
    order = []
    grouped = {}
    for item in events(bundle):
        key = (c(item.get('date')) or '-')[:10]
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append(item)
    return [(key, grouped[key]) for key in order]


CSS = """@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#0f2417}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bleed{position:fixed;top:0;right:0;bottom:0;left:0;background:#0f2417;z-index:-1}
body{font-family:'Sarabun','Noto Sans Thai',sans-serif;font-size:11pt;color:#e9f3ea;background:#0f2417}
.wrap{padding:12mm 11mm 14mm;background:#0f2417;min-height:297mm}
.hd{display:flex;gap:14px;align-items:center;border-bottom:2px solid #c9a227;padding-bottom:9px}
.hd img.logo{width:74px;height:74px;object-fit:contain}
.t1{font-size:19pt;font-weight:700;color:#fff}.t2{font-size:12.5pt;font-weight:700;color:#f2c94c}.t3{font-size:10.5pt;color:#cfe3d3}
.lay{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px}.lay td{vertical-align:top;padding:0}
.left{width:56%;padding-right:10px!important}.right{width:44%}
.colh{margin:0 0 8px;font-size:13pt;color:#fff;text-align:center;background:#2b5a3b;border-radius:5px;padding:4px}
.note{display:flex;gap:10px;margin-bottom:9px;break-inside:avoid;min-width:0}
.dt{width:64px;flex:none;text-align:right;color:#f2c94c;font-weight:700;font-size:9.5pt;padding-top:7px;border-right:3px solid #c9a227;padding-right:7px;position:relative}
.dt:after{content:'';position:absolute;right:-8px;top:11px;width:11px;height:11px;border-radius:50%;background:#f2c94c}
.card{flex:1;min-width:0;background:#173523;border:1px solid #3d6b4c;border-radius:8px;padding:7px 10px;overflow-wrap:anywhere}
.card h3{margin:0 0 4px;font-size:12pt;color:#f2c94c}
.card p{margin:0 0 3px;line-height:1.45}
.ph{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;margin-top:5px}
.ph img{width:100%;height:auto;max-height:260px;object-fit:contain;background:#0d1f14;border-radius:5px;border:1px solid #3d6b4c}
.box{background:#132d1e;border:1.5px solid #c9a227;border-radius:8px;padding:8px 10px;margin-bottom:10px;break-inside:avoid}
.box h2{margin:0 0 6px;font-size:12pt;text-align:center;color:#fff;background:#2b5a3b;border-radius:5px;padding:3px}
.tg{display:flex;gap:8px;margin-bottom:6px;break-inside:avoid}.tg img{width:70px;height:88px;object-fit:cover;border-radius:5px;border:1px solid #c9a227;flex:none}
.tg b{color:#f2c94c}.k{color:#9cc5a6}
.ft{margin-top:6px;font-size:8.5pt;color:#9cc5a6;text-align:right}"""


def uniq(values):
    found = []
    for value in values:
        value = c(value)
        if value and value not in found:
            found.append(value)
    return found


def split(value):
    return [part.strip() for part in re.split(r'[,\n;]+', c(value)) if part.strip()]


def ecard(photo, title, lines):
    body = ''.join('<p><span class="k">%s:</span> %s</p>' % (html.escape(label), e(value)) for label, value in lines if c(value))
    image = '<img src="%s" alt="">' % photo if photo and str(photo).startswith('data:image') else ''
    return '<div class="tg">%s<div><b>%s</b>%s</div></div>' % (image, e(title) or '—', body)


def entities(bundle):
    fields = (bundle.get('snap') or {}).get('fields', {})
    photos = bundle['photos']
    local = bundle['local']
    ext = bundle.get('ext') or {}
    groups = {'บุคคล': [], 'ยานพาหนะ': [], 'ที่อยู่ / บ้าน': [], 'อื่นๆ': []}
    for person in bundle.get('persons') or []:
        photo = photos['bch'].get('suspect') if person.get('src') == 'บช.' else photos['targets'].get(person['id'])
        groups['บุคคล'].append(ecard(photo, person['name'], [tuple(line) for line in person['lines']]))
    seen = set()
    for target in local['targets']:
        address = c(target.get('address'))
        if address and address not in seen:
            seen.add(address)
            groups['ที่อยู่ / บ้าน'].append(ecard('', address, [('เกี่ยวข้องกับ', target.get('name'))]))
    if c(fields.get('intelLocation')):
        groups['ที่อยู่ / บ้าน'].append(ecard('', fields.get('intelLocation'), [('ที่มา', 'ข้อมูลคดี')]))
    if c(ext.get('gps')):
        groups['ที่อยู่ / บ้าน'].append(ecard('', ext.get('gps'), [('ประเภท', 'พิกัด')]))
    vehicle = ' '.join(part for part in [c(fields.get('intelVehBrand')), c(fields.get('intelVehModel')), c(fields.get('intelVehColor'))] if part)
    vehicle_photo = photos['bch'].get('vehicle')
    if vehicle or c(fields.get('intelVehPlate')) or vehicle_photo:
        groups['ยานพาหนะ'].append(ecard(vehicle_photo, vehicle or 'ยานพาหนะ', [('ทะเบียน', fields.get('intelVehPlate'))]))
    for vehicle_row in ext.get('vehicles') or []:
        if isinstance(vehicle_row, dict) and any(c(vehicle_row.get(key)) for key in vehicle_row):
            title = ' '.join(c(vehicle_row.get(key)) for key in ('brand', 'model', 'color') if c(vehicle_row.get(key))) or 'ยานพาหนะ'
            groups['ยานพาหนะ'].append(ecard('', title, [('ทะเบียน', vehicle_row.get('plate'))]))
    for plate in uniq(sum([split(entry.get('plates')) for entry in local['entries']], [])):
        groups['ยานพาหนะ'].append(ecard('', plate, [('ที่มา', 'บันทึกความคืบหน้า')]))
    target_phones = set(sum([split(target.get('phones')) for target in local['targets']], []))
    phones = [item for item in uniq([fields.get('intelPhone')] + split(ext.get('targetPhones')) + sum([split(entry.get('phones')) for entry in local['entries']], [])) if item not in target_phones]
    if phones:
        groups['อื่นๆ'].append(ecard('', 'เบอร์โทรศัพท์ที่เกี่ยวข้อง', [('เบอร์', ', '.join(phones))]))
    accounts = uniq([fields.get('intelBank')] + split(ext.get('bankAccounts')))
    if accounts:
        groups['อื่นๆ'].append(ecard('', 'บัญชีธนาคาร', [('บัญชี', ', '.join(accounts))]))
    evidence = ' / '.join(part for part in [c(fields.get('evidMainType')), c(fields.get('evidMainQty')), c(fields.get('evidOther')), c(fields.get('evidOtherExt'))] if part)
    if evidence or photos['bch'].get('evidence'):
        groups['อื่นๆ'].append(ecard(photos['bch'].get('evidence'), 'ของกลาง', [('รายการ', evidence)]))
    return ''.join('<div class="box"><h2>%s</h2>%s</div>' % (name, ''.join(rows)) for name, rows in groups.items() if rows)


def status_html(bundle):
    fields = (bundle.get('snap') or {}).get('fields', {})
    snap = bundle.get('snap') or {}
    rows = ['<p><span class="k">%s:</span> %s</p>' % (label, e(fields.get(key))) for key, label in (
        ('caseId', 'รหัสคดี'), ('status', 'สถานะ'), ('startDate', 'วันที่เริ่ม'), ('casePast', 'อดีต'),
        ('casePresent', 'ปัจจุบัน'), ('caseFuture', 'อนาคต (แผน)'), ('caseResult', 'ผล'),
        ('caseObstacle', 'อุปสรรค'), ('caseNeed', 'สิ่งที่ต้องการ'), ('relatedCase', 'คดีที่เกี่ยวข้อง'),
    ) if c(fields.get(key))]
    commander = ' '.join(part for part in [c(fields.get('comRank')), c(fields.get('comFName')), c(fields.get('comLName'))] if part)
    if commander:
        rows.append('<p><span class="k">หัวหน้าชุด:</span> %s</p>' % html.escape(commander))
    if c(snap.get('reporter')):
        rows.append('<p><span class="k">ผู้รายงาน:</span> %s</p>' % e(snap.get('reporter')))
    return '<div class="box"><h2>ข้อมูลคดี</h2>%s</div>' % ''.join(rows)


def build_progress(bundle):
    fields = (bundle.get('snap') or {}).get('fields', {})
    snap = bundle.get('snap') or {}
    notes = []
    for number, item in enumerate(events(bundle), 1):
        when = e(thd(item['date']))
        if c(item.get('time')):
            when += '<br>' + e(item.get('time'))
        body = '<p>%s</p>' % e(item['text']) if c(item['text']) else ''
        notes.append(
            '<article class="note"><div class="dt">%s</div><div class="card"><h3>%d. %s</h3>%s%s</div></article>'
            % (when, number, html.escape(item['title']), body, imgs(item['ph']))
        )
    sub = ' · '.join(part for part in [c(snap.get('caseType')), ('เริ่ม ' + thd(fields.get('startDate'))) if c(fields.get('startDate')) else ''] if part)
    title = e(fields.get('caseName') or bundle.get('caseName'))
    return (
        '<!doctype html><html><head><meta charset="utf-8"><style>%s</style></head><body>'
        '<div class="bleed"></div><div class="wrap"><div class="hd"><img class="logo" alt="" src="data:image/png;base64,%s">'
        '<div><div class="t1">“กองร้อยตำรวจตระเวนชายแดนที่ 244”</div>'
        '<div class="t2">TIMELINE ลำดับเหตุการณ์และการสืบสวนขยายผล</div>'
        '<div class="t3">%s%s</div></div></div>'
        '<table class="lay"><tr><td class="left"><h2 class="colh">บันทึกหน้า</h2>%s</td>'
        '<td class="right">%s%s</td></tr></table>'
        '<div class="ft">เอกสารใช้ภายในหน่วย</div></div></body></html>'
    ) % (CSS, logo_b64(), title, (' — ' + html.escape(sub)) if sub else '', ''.join(notes) or '<p>ยังไม่มีเหตุการณ์</p>', status_html(bundle), entities(bundle))


def _pdf(document, single=False):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 794, 'height': 1123})
        page.set_content(document, wait_until='load')
        if single:
            # one continuous page: width A4, height = real content height
            page.add_style_tag(content='@page{size:auto;margin:0}')
            page.emulate_media(media='print')
            height = page.evaluate('Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))')
            data = page.pdf(
                width='794px',
                height='%dpx' % (height + 2),
                print_background=True,
                prefer_css_page_size=False,
                margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'},
            )
        else:
            data = page.pdf(
                format='A4',
                landscape=False,
                print_background=True,
                prefer_css_page_size=True,
                margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'},
            )
        browser.close()
    return data


def render_progress(bundle, out=None):
    data = _pdf(build_progress(bundle), single=True)
    if out:
        with open(out, 'wb') as handle:
            handle.write(data)
    return data


def _data_image(url):
    if not url or not str(url).startswith('data:image'):
        return None
    header, encoded = str(url).split(',', 1)
    ext = 'png' if 'png' in header else 'jpeg'
    try:
        return ext, base64.b64decode(encoded)
    except Exception:
        return None


def _xml(text):
    return (str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def _rpr(size=32, bold=False, color=None):
    weight = '<w:b/><w:bCs/>' if bold else ''
    paint = '<w:color w:val="%s"/>' % color if color else ''
    return (
        '<w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" '
        'w:cs="TH Sarabun New" w:eastAsia="TH Sarabun New"/>%s%s'
        '<w:sz w:val="%d"/><w:szCs w:val="%d"/><w:lang w:bidi="th-TH"/></w:rPr>'
    ) % (weight, paint, size, size)


def _run(text='', size=32, bold=False, color=None, tab=False):
    mark = _rpr(size, bold, color)
    if tab:
        return '<w:r>%s<w:tab/></w:r>' % mark
    return '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (mark, _xml(text))


def _p(runs, before=0, after=0, left=0, right=0, first=None, hanging=None, align='left', border=False, tabs=None, keep_next=False):
    indent = '<w:ind w:left="%d" w:right="%d"' % (left, right)
    if first:
        indent += ' w:firstLine="%d"' % first
    if hanging:
        indent += ' w:hanging="%d"' % hanging
    indent += '/>'
    edge = '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/></w:pBdr>' if border else ''
    tab_xml = ''
    if tabs:
        tab_xml = '<w:tabs>' + ''.join('<w:tab w:val="%s" w:pos="%d"/>' % pair for pair in tabs) + '</w:tabs>'
    keep = '<w:keepNext/>' if keep_next else ''
    props = '<w:pPr>%s%s%s<w:spacing w:before="%d" w:after="%d"/>%s<w:jc w:val="%s"/>%s</w:pPr>' % (
        keep, edge, tab_xml, before, after, indent, align, _rpr())
    return '<w:p>%s%s</w:p>' % (props, ''.join(runs))


def _full_date(value):
    text = c(value)
    try:
        year, month, day = [int(part) for part in text[:10].split('-')]
    except Exception:
        return ''
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return ''
    if year < 2400:
        year += 543
    return '%d %s %d' % (day, FULL_MONTHS[month - 1], year)


def _clock(value):
    match = re.search(r'T(\d{2}):(\d{2})', str(value or ''))
    if match:
        return '%s.%s น.' % (match.group(1), match.group(2))
    match = re.match(r'^(\d{1,2}):(\d{2})', str(value or '').strip())
    if not match:
        return ''
    return '%s.%s น.' % (match.group(1).zfill(2), match.group(2))


def _red(text):
    return _run(text, color=MEMO_RED)


def _image_px(blob, ext):
    if ext == 'png' and blob[:8] == b'\x89PNG\r\n\x1a\n' and len(blob) >= 24:
        return int.from_bytes(blob[16:20], 'big'), int.from_bytes(blob[20:24], 'big')
    if ext == 'jpeg':
        index = 2
        while index + 9 < len(blob):
            if blob[index] != 0xFF:
                index += 1
                continue
            marker = blob[index + 1]
            length = int.from_bytes(blob[index + 2:index + 4], 'big')
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                height = int.from_bytes(blob[index + 5:index + 7], 'big')
                width = int.from_bytes(blob[index + 7:index + 9], 'big')
                return width, height
            index += 2 + length
    return 0, 0


def _drawing(rel, ext, blob, pic_id):
    width, height = _image_px(blob, ext)
    if not width or not height:
        return ''
    emu = 9525
    box_w = width * emu
    box_h = height * emu
    scale = min(1.0, (4.2 * 914400) / box_w, (3.2 * 914400) / box_h)
    box_w = int(round(box_w * scale))
    box_h = int(round(box_h * scale))
    filename = 'image%d.%s' % (pic_id, ext)
    return (
        '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="%d" cy="%d"/><wp:docPr id="%d" name="Picture %d"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
        '<pic:nvPicPr><pic:cNvPr id="%d" name="%s"/><pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
        '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
    ) % (box_w, box_h, pic_id, pic_id, pic_id, _xml(filename), rel, box_w, box_h)


def _memo_images(item):
    found = []
    names = item.get('photoNames') or []
    for index, url in enumerate(item.get('ph') or []):
        parsed = _data_image(url)
        if not parsed:
            continue
        ext, blob = parsed
        label = c(names[index]) if index < len(names) else ''
        found.append((label, ext, blob))
    return found


def _stage_runs(item):
    stage = c(item.get('stage'))
    label = c(item.get('stageLabel')) or MEMO_STAGE.get(stage, '')
    when = _full_date(item.get('date'))
    clock = _clock(item.get('time'))
    time_known = (not c(item.get('time'))) or bool(clock)
    if stage and label and when and time_known:
        sentence = 'บัดนี้ ได้ดำเนินการสืบสวนในขั้นที่ %s (%s) เมื่อวันที่ %s' % (stage, label, when)
        if clock:
            sentence += ' เวลา ' + clock
        return [_run(sentence + ' ผลการสืบสวนปรากฏดังนี้')]
    runs = [_run('บัดนี้ ได้ดำเนินการสืบสวนในขั้นที่ ')]
    if stage and label:
        runs.append(_run('%s (%s) ' % (stage, label)))
    elif stage:
        runs.extend([_run(stage + ' ('), _red('........................'), _run(') ')])
    else:
        runs.extend([_red('......'), _run(' ')])
    runs.append(_run('เมื่อวันที่ '))
    runs.append(_run(when) if when else _red('........................'))
    if c(item.get('time')):
        runs.append(_run(' เวลา '))
        runs.append(_run(clock) if clock else _red('............'))
    runs.append(_run(' ผลการสืบสวนปรากฏดังนี้'))
    return runs


def build_suep_docx(bundle, notes=None, number=None):
    """One pattern memo for the notes of a single timeline date. `number` stays in the filename only."""
    del number
    fields = (bundle.get('snap') or {}).get('fields', {})
    case_name = c(fields.get('caseName')) or c(bundle.get('caseName')) or c(bundle.get('title'))
    items = list(events(bundle) if notes is None else (notes or []))
    stamps = [c(item.get('createdAt')) for item in items if c(item.get('createdAt'))]
    header_iso = stamps[-1] if stamps else (c(items[0].get('date')) if items else '')
    header_date = _full_date(header_iso)
    authors = []
    for item in items:
        name = c(item.get('author'))
        if name and name not in authors:
            authors.append(name)
    media = []
    body = [_p([_run('บันทึกข้อความ', size=58, bold=True)], align='center', after=120)]
    body.append(_p([
        _run('ส่วนราชการ', size=40, bold=True),
        _run(' ชุดปฏิบัติการข่าว (ชปข.) ' + MEMO_UNIT),
    ], border=True, after=60))
    date_runs = [
        _run('ที่', size=40, bold=True), _run(' '), _red('ตชด.244 (ชปข.)/.............'),
        _run(tab=True), _run('วันที่', size=40, bold=True), _run(' '),
        _run(header_date) if header_date else _red('........................'),
    ]
    body.append(_p(date_runs, border=True, after=60, tabs=[('left', 4536)]))
    subject = [_run('เรื่อง', size=40, bold=True)]
    subject.append(_run(' รายงานผลการสืบสวน กรณี' + case_name) if case_name else _run(' รายงานผลการสืบสวน กรณี'))
    if not case_name:
        subject.append(_red('........................'))
    body.append(_p(subject, border=True, after=200))
    body.append(_p([_run('เรียน', bold=True), _run(' '), _red('ผบ.ร้อย ตชด.244')], after=200))
    if case_name:
        intro = [_run('ตามที่ ชุดปฏิบัติการข่าว %s ได้ดำเนินการสืบสวนติดตามกรณี%s นั้น' % (MEMO_UNIT, case_name))]
    else:
        intro = [_run('ตามที่ ชุดปฏิบัติการข่าว %s ได้ดำเนินการสืบสวนติดตามกรณี' % MEMO_UNIT), _red('........................'), _run(' นั้น')]
    body.append(_p(intro, first=1418, align='thaiDistribute'))
    if not items:
        body.append(_p([_red('..................................................')], first=1418, align='thaiDistribute', after=60))
    for item in items:
        body.append(_p(_stage_runs(item), first=1418, align='thaiDistribute', after=60))
        lines = [line.strip() for line in str(item.get('text') or '').replace('\r\n', '\n').split('\n') if line.strip()]
        if lines:
            for line in lines:
                body.append(_p([_run(line)], first=1418, align='thaiDistribute'))
        else:
            body.append(_p([_red('..................................................')], first=1418, align='thaiDistribute'))
        facts = []
        for label, value in item.get('det') or []:
            shown = FACT_LABEL.get(label, c(label))
            text = c(value)
            if shown and text:
                facts.append((shown, text))
        if facts:
            body.append(_p([_run('ข้อมูลที่ตรวจพบ')], first=1418, before=120))
            for index, (label, value) in enumerate(facts, 1):
                body.append(_p([_run('%d. %s : %s' % (index, label, value))], left=1702, hanging=284))
        shots = _memo_images(item)
        if shots:
            body.append(_p([_run('ภาพถ่ายประกอบ จำนวน %d ภาพ (จัดเก็บต้นฉบับไว้ในโฟลเดอร์เคส)' % len(shots))], first=1418, before=120, keep_next=True))
            for offset, (label, ext, blob) in enumerate(shots, 1):
                pic_id = len(media) + 1
                rel = 'rIdImg%d' % pic_id
                drawing = _drawing(rel, ext, blob, pic_id)
                if not drawing:
                    continue
                media.append((rel, ext, blob))
                body.append(_p([drawing], align='center', before=80, keep_next=True))
                if label:
                    caption = [_run('ภาพที่ %d : %s' % (offset, label), size=26)]
                else:
                    caption = [_run('ภาพที่ %d : ' % offset, size=26), _run('ไม่ระบุชื่อไฟล์', size=26, color=MEMO_RED)]
                body.append(_p(caption, align='center', after=60))
    body.append(_p([_run('จึงเรียนมาเพื่อโปรดทราบ')], first=1418, before=200, after=480))
    if len(authors) == 1:
        signed = [_run('( %s )' % authors[0])]
    else:
        signed = [_run('( '), _red('.................................................. ยังไม่ระบุชื่อผู้บันทึก'), _run(' )')]
    body.append(_p([_run('(ลงชื่อ) ..................................................')], left=3969, align='center', keep_next=True))
    body.append(_p(signed, left=3969, align='center', keep_next=True))
    body.append(_p([_run('ตำแหน่ง '), _red('..................................................')], left=3969, align='center', keep_next=True))
    body.append(_p([_run('ผู้บันทึก')], left=3969, align='center'))
    footer = 'ข้อความสีแดง = ยังไม่ได้ยืนยัน ให้ตรวจแก้ก่อนใช้งาน · สร้างจากระบบติดตามเคส เมื่อ '
    if header_date:
        clock = _clock(header_iso)
        footer += header_date + ((' ' + clock) if clock else '')
        body.append(_p([_run(footer, size=22, color='7F7F7F')], before=480))
    else:
        body.append(_p([_run(footer, size=22, color='7F7F7F'), _run('........................', size=22, color=MEMO_RED)], before=480))
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<w:body>%s<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1418" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/>'
        '</w:sectPr></w:body></w:document>'
    ) % ''.join(body)
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>'
        '<w:rPrDefault><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New" w:eastAsia="TH Sarabun New"/>'
        '<w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="th-TH" w:bidi="th-TH"/></w:rPr></w:rPrDefault>'
        '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>'
    )
    rels = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    ]
    for rel, ext, _blob in media:
        rels.append(
            '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image%s.%s"/>'
            % (rel, rel.replace('rIdImg', ''), ext)
        )
    rels.append('</Relationships>')
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="png" ContentType="image/png"/>'
        '<Default Extension="jpeg" ContentType="image/jpeg"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '</Types>'
    )
    package_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', content_types)
        archive.writestr('_rels/.rels', package_rels)
        archive.writestr('word/document.xml', document)
        archive.writestr('word/styles.xml', styles)
        archive.writestr('word/_rels/document.xml.rels', ''.join(rels))
        for rel, ext, blob in media:
            archive.writestr('word/media/image%s.%s' % (rel.replace('rIdImg', ''), ext), blob)
    return buffer.getvalue()


def _safe(text):
    return re.sub(r'[\\/:*?"<>|\s]+', '_', str(text or '')).strip('_')[:60] or 'คดี'


def render_suep(bundle, out=None):
    """ZIP of separate .docx memos: one file per timeline date (ครั้งที่ = date order)."""
    fields = (bundle.get('snap') or {}).get('fields', {})
    case = _safe(c(fields.get('caseName')) or c(bundle.get('caseName')) or bundle.get('title'))
    groups = group_by_day(bundle)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        if not groups:
            archive.writestr('บันทึกสืบ_%s.docx' % case, build_suep_docx(bundle, []))
        for number, (key, items) in enumerate(groups, 1):
            name = 'บันทึกสืบ_%s_ครั้งที่%02d_%s.docx' % (case, number, key)
            archive.writestr(name, build_suep_docx(bundle, items, number))
    data = buffer.getvalue()
    if out:
        with open(out, 'wb') as handle:
            handle.write(data)
    return data


def render_suep_files(bundle):
    """Separate .docx per timeline date + one combined PDF of all memos.
    Returns list of (filename, bytes, mime)."""
    fields = (bundle.get('snap') or {}).get('fields', {})
    case = _safe(c(fields.get('caseName')) or c(bundle.get('caseName')) or bundle.get('title'))
    groups = group_by_day(bundle)
    DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    out = []
    if not groups:
        out.append(('บันทึกสืบ_%s.docx' % case, build_suep_docx(bundle, []), DOCX))
    for number, (key, items) in enumerate(groups, 1):
        out.append(('บันทึกสืบ_%s_ครั้งที่%02d_%s.docx' % (case, number, key), build_suep_docx(bundle, items, number), DOCX))
    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for i, (_name, data, _m) in enumerate(out):
            path = os.path.join(tmp, 'm%03d.docx' % i)
            with open(path, 'wb') as handle:
                handle.write(data)
            paths.append(path)
        subprocess.run(['soffice', '--headless', '-env:UserInstallation=file://' + tmp + '/lo',
                        '--convert-to', 'pdf', '--outdir', tmp] + paths,
                       check=True, capture_output=True, timeout=240)
        pdfs = [p[:-5] + '.pdf' for p in paths]
        merged = os.path.join(tmp, 'all.pdf')
        if len(pdfs) == 1:
            merged = pdfs[0]
        else:
            subprocess.run(['pdfunite'] + pdfs + [merged], check=True, capture_output=True, timeout=60)
        with open(merged, 'rb') as handle:
            out.append(('บันทึกสืบ_%s_รวมทุกครั้ง.pdf' % case, handle.read(), 'application/pdf'))
    return out
