"""Build case files from data already stored by the tracking app.

render_progress writes one portrait PDF per case. The page background runs to
the paper edge. Timeline entries are the notes on that page.

render_suep writes one Word document per case (not a PDF). Every timeline entry
in the case is a section of that same document.
"""
import base64
import html
import io
import os
import re
import zipfile

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
LOGO = open(os.path.join(ROOT, 'logo.b64'), encoding='utf-8').read().strip()
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


def events(bundle):
    """Timeline notes, in the same order as the tracking page."""
    photos = bundle['photos']
    found = []
    for entry in bundle['local']['entries']:
        details = [(label, entry.get(key)) for key, label in (
            ('people', 'บุคคล'), ('phones', 'โทรศัพท์'), ('plates', 'ทะเบียนรถ')
        ) if c(entry.get(key))]
        found.append({
            'date': entry.get('entryDate'),
            'time': entry.get('eventTime'),
            'title': c(entry.get('stageLabel')) or STAGE.get(c(entry.get('stage')), 'บันทึกความคืบหน้า'),
            'src': 'ระบบติดตามคดี',
            'text': entry.get('text'),
            'det': details,
            'ph': photos['entries'].get(entry['id'], []),
            'author': entry.get('authorName'),
        })
    return found


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
    ) % (CSS, LOGO, title, (' — ' + html.escape(sub)) if sub else '', ''.join(notes) or '<p>ยังไม่มีเหตุการณ์</p>', status_html(bundle), entities(bundle))


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


def _paragraph(text, bold=False):
    weight = '<w:b/>' if bold else ''
    fonts = '<w:rFonts w:ascii="Sarabun" w:hAnsi="Sarabun" w:eastAsia="Sarabun" w:cs="Sarabun"/>'
    return (
        '<w:p><w:r><w:rPr>%s%s<w:sz w:val="32"/></w:rPr>'
        '<w:t xml:space="preserve">%s</w:t></w:r></w:p>'
    ) % (weight, fonts, _xml(text))


def _image_paragraph(rel_id, name):
    return (
        '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="3200400" cy="2400300"/><wp:docPr id="%d" name="%s"/>'
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:nvPicPr><pic:cNvPr id="%d" name="%s"/><pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3200400" cy="2400300"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
        '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    ) % (int(rel_id[3:]), _xml(name), int(rel_id[3:]), _xml(name), rel_id)


def build_suep_docx(bundle):
    """One .docx for the case. Each timeline note is its own section."""
    fields = (bundle.get('snap') or {}).get('fields', {})
    case_name = c(fields.get('caseName')) or c(bundle.get('caseName'))
    rank = c(fields.get('comRank'))
    signer = ' '.join(part for part in [c(fields.get('comFName')), c(fields.get('comLName'))] if part)
    media = []
    body = []
    notes = events(bundle) or [None]
    for index, item in enumerate(notes, 1):
        if index > 1:
            body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        body.append(_paragraph('บันทึกข้อความ', True))
        body.append(_paragraph('ส่วนราชการ  กองร้อยตำรวจตระเวนชายแดนที่ 244  อ.เมืองบึงกาฬ  จ.บึงกาฬ'))
        if item is None:
            body.append(_paragraph('ยังไม่มีเหตุการณ์ในคดีนี้'))
            continue
        body.append(_paragraph('วันที่ ' + thd(item['date'], True)))
        body.append(_paragraph('เรื่อง  รายงานการสืบสวน %s (ครั้งที่ %s)' % (case_name or '—', th(index)), True))
        body.append(_paragraph('เรียน  ผบ.ร้อย ตชด.244'))
        when = thd(item['date'], True) + ((' เวลา ' + c(item.get('time')) + ' น.') if c(item.get('time')) else '')
        body.append(_paragraph('เมื่อวันที่ %s (%s) %s' % (when, item['title'], c(item.get('text')) or '—')))
        for label, value in item['det']:
            body.append(_paragraph('- %s: %s' % (label, c(value) or '—')))
        for url in item['ph']:
            parsed = _data_image(url)
            if not parsed:
                continue
            ext, blob = parsed
            rel = 'rId%d' % (len(media) + 1)
            media.append((rel, ext, blob))
            body.append(_image_paragraph(rel, 'photo%d.%s' % (len(media), ext)))
        body.append(_paragraph('จึงเรียนมาเพื่อโปรดทราบ'))
        body.append(_paragraph(rank or ''))
        body.append(_paragraph('( %s )' % (signer or '—')))
        body.append(_paragraph('หัวหน้าชุด'))
        body.append(_paragraph('แหล่งข้อมูล: %s' % item['src']))
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
        '<w:body>%s<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>'
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418"/></w:sectPr></w:body></w:document>'
    ) % ''.join(body)
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for rel, ext, _blob in media:
        rels.append(
            '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/%s.%s"/>'
            % (rel, rel, ext)
        )
    rels.append('</Relationships>')
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="png" ContentType="image/png"/>'
        '<Default Extension="jpeg" ContentType="image/jpeg"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '</Types>'
    )
    package_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', content_types)
        archive.writestr('_rels/.rels', package_rels)
        archive.writestr('word/document.xml', document)
        archive.writestr('word/_rels/document.xml.rels', ''.join(rels))
        for rel, ext, blob in media:
            archive.writestr('word/media/%s.%s' % (rel, ext), blob)
    return buffer.getvalue()


def render_suep(bundle, out=None):
    data = build_suep_docx(bundle)
    if out:
        with open(out, 'wb') as handle:
            handle.write(data)
    return data
