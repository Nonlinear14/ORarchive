"""Phase 2 browser check: template gallery -> create handout -> edit on canvas -> Roll20 rich copy.

Runs against `npm run preview` (http://localhost:4173/ORarchive/) with a fake logged-in session
(injected into localStorage) and Supabase REST calls answered by an in-memory table (page.route).
Nothing touches the real Supabase project.

usage: npm run build && npm run preview   (in another terminal)
       python scripts/check_phase2.py [chrome-executable]
Screenshots: docs/screens/phase2-*.png
"""
import base64
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SCREENS = ROOT / 'docs' / 'screens'
SCREENS.mkdir(parents=True, exist_ok=True)
BASE = 'http://localhost:4173/ORarchive'
CHROME = sys.argv[1] if len(sys.argv) > 1 else next(
    (c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                 r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                 '/usr/bin/google-chrome'] if os.path.exists(c)), None)


def supabase_url():
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        if line.startswith('VITE_SUPABASE_URL='):
            return line.split('=', 1)[1].strip().rstrip('/')
    raise SystemExit('.env 에 VITE_SUPABASE_URL 이 필요합니다 (빌드에 들어간 값과 같아야 함)')


SB = supabase_url()
REF = re.match(r'https://([^.]+)\.', SB).group(1)


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')


exp = int(time.time()) + 3600
user = {'id': 'u1', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'reader@example.com',
        'app_metadata': {'provider': 'google'}, 'user_metadata': {'full_name': '달빛 기록자'},
        'created_at': '2026-01-01T00:00:00Z'}
jwt = f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64({'sub': 'u1', 'exp': exp, 'role': 'authenticated', 'aud': 'authenticated'})}.sig"
session = {'access_token': jwt, 'refresh_token': 'r', 'expires_in': 3600, 'expires_at': exp,
           'token_type': 'bearer', 'user': user}
NOW = '2026-11-24T09:00:00Z'
profile = {'id': 'u1', 'nickname': '달빛 기록자', 'avatar_url': None, 'created_at': NOW, 'updated_at': NOW}

docs = []
patches = []
seq = [0]


def handle(route):
    req = route.request
    url = unquote(req.url)
    single = 'vnd.pgrst.object' in (req.headers.get('accept') or '')

    def reply(data, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(data))

    if '/rest/v1/profiles' in url:
        return reply(profile if single else [profile])
    if '/rest/v1/documents' in url:
        m = re.search(r'[?&]id=eq\.([^&]+)', url)
        if req.method == 'POST':
            body = json.loads(req.post_data or '{}')
            seq[0] += 1
            row = {'id': f'd{seq[0]}', 'owner_id': 'u1', 'project_id': None, 'title': '', 'content': {},
                   'visibility': 'private', 'version': 1, 'created_at': NOW, 'updated_at': NOW, 'deleted_at': None}
            row.update(body)
            docs.append(row)
            return reply(row if single else [row], 201)
        if req.method == 'PATCH' and m:
            d = next(x for x in docs if x['id'] == m.group(1))
            patch = json.loads(req.post_data or '{}')
            patches.append(patch)
            d.update(patch)
            d['version'] += 1
            return reply(d if single else [d])
        if m:
            d = next((x for x in docs if x['id'] == m.group(1)), None)
            if not d:
                return reply({'code': 'PGRST116', 'message': '0 rows'}, 406) if single else reply([])
            return reply(d if single else [d])
        return reply([{k: v for k, v in d.items() if k != 'content'} for d in docs])
    return reply({})


# Windows clipboard can briefly report "Clipboard data has changed" after a write; retry.
READ_CLIP = """async () => { let last;
  for (let i = 0; i < 10; i++) { try {
    const items = await navigator.clipboard.read(); const out = {};
    for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text();
    return out; } catch (e) { last = e; await new Promise(r => setTimeout(r, 150)); } }
  throw last; }"""

problems = []


def watch(page, tag):
    page.on('pageerror', lambda e: problems.append(f'[{tag}] pageerror {e}'))
    page.on('console', lambda m: problems.append(f'[{tag}] console.{m.type} {m.text}')
            if m.type in ('error', 'warning') else None)


def check_roll20_html(html, *needles):
    for n in needles:
        assert n in html, ('missing in text/html', n)
    low = html.lower()
    assert '<style' not in low and '<script' not in low, 'style/script tag in roll20 html'
    assert not re.search(r'\sclass\s*=', low), 'class attribute in roll20 html'
    assert low.startswith('<table') and 'style="' in low, 'expected inline-styled table markup'
    assert 'pre-wrap' not in low


def set_field(pg, key, text):
    pg.locator(f'[data-hfield="{key}"]').click()
    pg.keyboard.press('Control+A')
    pg.keyboard.press('Delete')
    pg.keyboard.type(text)


def shot(pg, name):
    pg.mouse.move(0, 0)
    pg.evaluate('window.scrollTo(0, 0)')
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(SCREENS / name), full_page=True)


def wait_saved(pg):
    pg.wait_for_selector('.editor-toolbar [data-status="saved"]', timeout=8000)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)

    def context(width, height):
        ctx = browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True)
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:4173')
        ctx.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(session))})")
        ctx.route(f'{SB}/**', handle)
        return ctx

    # ---------- desktop 1440 ----------
    ctx = context(1440, 900)
    pg = ctx.new_page()
    watch(pg, '1440')
    pg.goto(f'{BASE}/templates')
    pg.wait_for_selector('.template-card')
    pg.wait_for_timeout(300)
    assert pg.locator('.template-card').count() == 4
    shot(pg, 'phase2-gallery-1440.png')
    pg.get_by_role('button', name='미스터리').click()
    assert pg.locator('.template-card').count() == 1
    pg.get_by_role('button', name='전체').click()

    pg.get_by_role('button', name='달빛의 초대 템플릿으로 시작').click()
    pg.wait_for_selector('[data-hfield="title"]')
    assert re.search(r'/studio/handout/d\d+$', pg.url), pg.url
    assert docs[-1]['content']['templateId'] == 'moonlit'
    pg.wait_for_timeout(300)
    shot(pg, 'phase2-studio-1440.png')

    # direct edit: char-by-char typing keeps the caret (text order intact), Enter moves to the next field
    set_field(pg, 'title', '새로운 제목 <b>&')
    assert pg.locator('[data-hfield="title"]').inner_text() == '새로운 제목 <b>&'
    pg.keyboard.press('Enter')
    assert pg.evaluate('document.activeElement.dataset.hfield') == 'body'
    pg.keyboard.press('Control+A')
    pg.keyboard.type('첫 줄')
    pg.keyboard.press('Enter')
    pg.keyboard.type('둘째 줄')
    pg.locator('[data-hfield="body"]').press('End')
    wait_saved(pg)
    saved = docs[-1]['content']['fields']
    print('saved fields:', {k: saved[k] for k in ('title', 'body')})
    assert saved['title'] == '새로운 제목 <b>&'
    assert saved['body'] == '첫 줄\n둘째 줄', repr(saved['body'])
    assert len(patches) >= 1

    # Roll20 rich copy (ClipboardItem path)
    pg.evaluate("t => navigator.clipboard.writeText(t)", 'SENTINEL')
    pg.get_by_role('button', name='Roll20에 복사').click()
    pg.wait_for_selector('.toast.show')
    toast = pg.locator('.toast').inner_text()
    print('toast:', toast)
    assert 'Roll20용 핸드아웃을 복사했습니다' in toast
    clip = pg.evaluate(READ_CLIP)
    assert 'text/html' in clip and 'text/plain' in clip, list(clip)
    check_roll20_html(clip['text/html'], '새로운 제목 &lt;b&gt;&amp;', '첫 줄<br>둘째 줄', '#e8ddc9', '❧')
    plain = clip['text/plain'].replace('\r\n', '\n')
    assert '새로운 제목 <b>&' in plain and '첫 줄\n둘째 줄' in plain
    print('text/html length:', len(clip['text/html']))

    # paste the copied HTML into a plain contenteditable and screenshot (what Roll20's editor receives)
    pg.evaluate("""() => { const d=document.createElement('div'); d.id='pastebox'; d.contentEditable='true';
        d.style.cssText='position:fixed;left:0;top:0;width:520px;padding:20px;background:#fff;z-index:9999;white-space:normal';
        document.body.append(d); d.focus(); }""")
    pg.keyboard.press('Control+V')
    pasted = pg.evaluate("document.getElementById('pastebox').innerHTML")
    assert '둘째 줄' in pasted and 'background-color' in pasted, pasted[:200]
    pg.locator('#pastebox').screenshot(path=str(SCREENS / 'phase2-roll20-pasted.png'))
    pg.evaluate("document.getElementById('pastebox').remove()")

    # fallback: no async clipboard API -> execCommand inside the click
    pg.evaluate("() => { const r = navigator.clipboard.read.bind(navigator.clipboard), w = navigator.clipboard.writeText.bind(navigator.clipboard);"
                " Object.defineProperty(navigator, 'clipboard', {value: {read: r, writeText: w}, configurable: true}); }")
    pg.evaluate("t => navigator.clipboard.writeText(t)", 'SENTINEL')
    set_field(pg, 'title', 'FALLBACK-제목')
    pg.get_by_role('button', name='Roll20에 복사').click()
    pg.wait_for_function("() => document.querySelector('.toast.show')?.innerText.includes('Roll20용')")
    clip = pg.evaluate(READ_CLIP)
    assert clip.get('text/plain') != 'SENTINEL'
    check_roll20_html(clip['text/html'], 'FALLBACK-제목')
    pg.evaluate("() => { delete navigator.clipboard; }")

    # theme + template switch keep the text; Roll20 output follows
    pg.get_by_role('button', name='한밤 테마').click()
    pg.wait_for_selector('.hc-canvas[data-theme="dark"]')
    assert pg.locator('[data-hfield="title"]').inner_text() == 'FALLBACK-제목'
    pg.get_by_role('button', name=re.compile('오래된 조사 기록')).click()
    pg.wait_for_selector('.hc-canvas[data-template="casefile"]')
    assert pg.locator('[data-hfield="title"]').inner_text() == 'FALLBACK-제목'
    assert '둘째 줄' in pg.locator('[data-hfield="body"]').inner_text()
    pg.wait_for_timeout(200)
    shot(pg, 'phase2-studio-casefile-1440.png')
    wait_saved(pg)
    assert docs[-1]['content']['templateId'] == 'casefile'

    # HTML code modal + file download
    pg.get_by_role('button', name='HTML 코드 보기').click()
    code = pg.get_by_role("textbox", name="HTML 코드", exact=True).input_value()
    assert code.startswith('<table') and 'FALLBACK-제목' in code
    pg.keyboard.press('Escape')
    with pg.expect_download() as dl:
        pg.get_by_role('button', name='HTML 파일 저장').click()
    print('download:', dl.value.suggested_filename)
    assert dl.value.suggested_filename.endswith('.html')

    # reload: content comes back from the "server"
    pg.reload()
    pg.wait_for_selector('.hc-canvas[data-template="casefile"]')
    assert pg.locator('[data-hfield="title"]').inner_text() == 'FALLBACK-제목'

    # library opens handouts in the studio
    pg.goto(f'{BASE}/library')
    href = pg.locator('.list-row a.item-title').first.get_attribute('href')
    assert '/studio/handout/' in href, href

    # long Phase 1 handout (> 20,000 chars): shown in full, warned, never truncated on save
    long_text = '긴 본문 줄입니다.  \n' * 1700 + '마지막 문장'
    assert len(long_text) > 20000
    docs.append({'id': 'legacy1', 'owner_id': 'u1', 'project_id': None, 'type': 'handout', 'title': '예전 긴 편지',
                 'content': {'text': long_text}, 'visibility': 'private', 'version': 1,
                 'created_at': NOW, 'updated_at': NOW, 'deleted_at': None})
    pg.goto(f'{BASE}/studio/handout/legacy1')
    pg.wait_for_selector('[data-hfield="body"]')
    assert pg.locator('[data-hfield="body"]').evaluate('el => el.textContent') == long_text
    warning = pg.locator('.length-warning').inner_text()
    print('length warning:', warning)
    assert f'본문이 {len(long_text):,}자로 권장 한도' in warning, warning
    set_field(pg, 'title', '긴 글 제목')
    # trailing spaces + whitespace-only optional field survive save and Roll20 export
    set_field(pg, 'signature', '서명  ')
    set_field(pg, 'cap', '   ')
    wait_saved(pg)
    saved = docs[-1]['content']['fields']
    assert docs[-1]['id'] == 'legacy1'
    assert saved['body'] == long_text, (len(saved['body']), len(long_text))
    assert saved['title'] == '긴 글 제목'
    assert saved['signature'].replace(' ', ' ') == '서명  ', repr(saved['signature'])
    assert saved['cap'].replace(' ', ' ') == '   ', repr(saved['cap'])
    pg.evaluate("t => navigator.clipboard.writeText(t)", 'SENTINEL')
    pg.get_by_role('button', name='Roll20에 복사').click()
    pg.wait_for_function("() => document.querySelector('.toast.show')?.innerText.includes('Roll20용')")
    clip = pg.evaluate(READ_CLIP)
    check_roll20_html(clip['text/html'], '서명&nbsp;&nbsp;</p>', '>&nbsp;&nbsp;&nbsp;</p>', '마지막 문장')
    plain = clip['text/plain'].replace('\r\n', '\n')
    assert '서명  ' in plain and '   ' in plain.split('\n\n') and plain.count('긴 본문 줄입니다.  \n') == 1700
    print('long legacy handout: kept', len(saved['body']), 'chars; trailing/whitespace-only fields exported')

    # an unrelated edit never normalizes other stored values ('#ABC', uppercase host, unknown keys, hidden fields);
    # the canvas and the Roll20 copy use the normalized values
    raw_content = {'v': 1, 'templateId': 'moonlit', 'theme': 'dark',
                   'fields': {'cap': 'CAP', 'title': '보존 확인', 'body': '본문', 'signature': '', 'caseNo': '숨은 칸', 'count': 3},
                   'style': {'accent': '#ABC', 'font': 'hand', 'weight': 'bold'},
                   'image': {'url': 'https://EXAMPLE.com/Map%7E.png', 'alt': '지도', 'caption': '캡션'},
                   'extra': {'nested': [1, 'two', None]}}
    docs.append({'id': 'raw1', 'owner_id': 'u1', 'project_id': None, 'type': 'handout', 'title': '보존 확인',
                 'content': json.loads(json.dumps(raw_content)), 'visibility': 'private', 'version': 1,
                 'created_at': NOW, 'updated_at': NOW, 'deleted_at': None})
    pg.goto(f'{BASE}/studio/handout/raw1')
    pg.wait_for_selector('[data-hfield="body"]')
    assert pg.locator('.hc-canvas img').get_attribute('src') == 'https://example.com/Map%7E.png'
    set_field(pg, 'body', '고친 본문')
    expected = json.loads(json.dumps(raw_content))
    expected['fields']['body'] = '고친 본문'
    for _ in range(80):
        if next(d for d in docs if d['id'] == 'raw1')['content'] == expected:
            break
        pg.wait_for_timeout(100)
    saved = next(d for d in docs if d['id'] == 'raw1')['content']
    assert saved == expected, saved
    pg.get_by_role('button', name='HTML 코드 보기').click()
    code = pg.get_by_role("textbox", name="HTML 코드", exact=True).input_value()
    pg.keyboard.press('Escape')
    assert '#aabbcc' in code and '#ABC' not in code and 'src="https://example.com/Map%7E.png"' in code
    print('stored values kept after a body edit:', {k: saved[k] for k in ('style', 'image', 'extra')})

    def wait_content(doc, expected):
        for _ in range(80):
            got = next(d for d in docs if d['id'] == doc)['content']
            if got == expected and pg.locator('.editor-toolbar [data-status="saved"]').count():
                return got
            pg.wait_for_timeout(100)
        raise AssertionError(f'{doc}: expected {expected!r}, got {got!r}')

    def copy_roll20():
        pg.evaluate("t => navigator.clipboard.writeText(t)", 'SENTINEL')
        pg.get_by_role('button', name='Roll20에 복사').click()
        pg.wait_for_function("() => document.querySelector('.toast.show')?.innerText.includes('Roll20용')")
        clip = pg.evaluate(READ_CLIP)
        return clip['text/html'], clip['text/plain'].replace('\r\n', '\n')

    # review regression: a Phase 1 handout with an EMPTY body ({ text: '' }) shows an empty body with the placeholder
    # (not the template's default body); an unrelated edit saves body '' and the Roll20 copy has no default body text
    docs.append({'id': 'legacy-empty', 'owner_id': 'u1', 'project_id': None, 'type': 'handout', 'title': '빈 본문',
                 'content': {'text': ''}, 'visibility': 'private', 'version': 1,
                 'created_at': NOW, 'updated_at': NOW, 'deleted_at': None})
    pg.goto(f'{BASE}/studio/handout/legacy-empty')
    pg.wait_for_selector('[data-hfield="body"]')
    s = pg.locator('[data-hfield="body"]').evaluate(
        "el => ({ text: el.textContent, empty: el.matches(':empty'), ph: getComputedStyle(el, '::before').content })")
    assert s['text'] == '' and s['empty'] and '본문을 입력하세요' in s['ph'], s
    set_field(pg, 'title', '빈 본문 편지')
    saved = wait_content('legacy-empty', {'text': '', 'v': 1, 'templateId': 'moonlit',
                                          'fields': {'cap': 'A PRIVATE INVITATION', 'title': '빈 본문 편지', 'body': '',
                                                     'signature': '— 블랙우드 저택의 주인'}})
    html, plain = copy_roll20()
    check_roll20_html(html, '빈 본문 편지')
    assert '친애하는 방문객께' not in html and '친애하는 방문객께' not in plain and '빈 본문 편지' in plain
    print('legacy { text: "" }: shown empty with placeholder, saved body', repr(saved['fields']['body']), '- no default body exported')

    # review regression: stored newlines in single-line fields (from another device / older version) stay as they are;
    # only NEWLY entered line breaks are blocked (Enter -> next field, paste and keydown-less insertText -> converted)
    nl = {'v': 1, 'templateId': 'moonlit', 'theme': 'classic', 'style': {}, 'image': None,
          'fields': {'cap': 'A\nB', 'title': '첫 줄\n둘째 줄', 'body': '본문', 'signature': '서명\n'}}
    docs.append({'id': 'nl1', 'owner_id': 'u1', 'project_id': None, 'type': 'handout', 'title': '줄바꿈 한 줄 칸',
                 'content': json.loads(json.dumps(nl)), 'visibility': 'private', 'version': 1,
                 'created_at': NOW, 'updated_at': NOW, 'deleted_at': None})
    pg.goto(f'{BASE}/studio/handout/nl1')
    pg.wait_for_selector('[data-hfield="title"]')

    def text_of(key):
        return pg.locator(f'[data-hfield="{key}"]').evaluate('el => el.textContent')

    assert (text_of('cap'), text_of('title'), text_of('signature')) == ('A\nB', '첫 줄\n둘째 줄', '서명\n\n')
    pg.locator('[data-hfield="title"]').click()
    pg.keyboard.press('Control+End')
    pg.keyboard.type('!')
    pg.locator('[data-hfield="signature"]').click()
    pg.keyboard.press('Control+Home')
    pg.keyboard.press('End')
    pg.keyboard.type('!')
    nl['fields'].update(title='첫 줄\n둘째 줄!', signature='서명!\n')
    wait_content('nl1', nl)
    assert text_of('title') == '첫 줄\n둘째 줄!' and text_of('signature') == '서명!\n\n'
    # newlines that arrive without keydown/paste (IME commit / autocomplete-style insertText): converted in the new text only
    pg.locator('[data-hfield="cap"]').click()
    pg.keyboard.press('Control+End')
    pg.keyboard.insert_text('x\ny')
    assert text_of('cap') == 'A\nBx y', repr(text_of('cap'))
    pg.keyboard.type('z')  # the caret stays right after the inserted text
    nl['fields']['cap'] = 'A\nBx yz'
    wait_content('nl1', nl)
    # real clipboard paste with newlines at the start of the field: only the pasted newlines become a space
    pg.evaluate("t => navigator.clipboard.writeText(t)", '붙인\n  글')
    pg.keyboard.press('Control+Home')
    pg.keyboard.press('Control+V')
    nl['fields']['cap'] = '붙인 글A\nBx yz'
    wait_content('nl1', nl)
    # Enter still moves to the next field without touching the stored newlines
    pg.keyboard.press('Enter')
    assert pg.evaluate('document.activeElement.dataset.hfield') == 'title'
    pg.wait_for_timeout(900)
    assert next(d for d in docs if d['id'] == 'nl1')['content'] == nl
    html, plain = copy_roll20()
    check_roll20_html(html, '붙인 글A<br>Bx yz', '첫 줄<br>둘째 줄!')
    print('single-line fields with stored newlines: kept', {k: nl['fields'][k] for k in ('cap', 'title', 'signature')})

    # Enter in an empty body (regression: the blank line was read as empty, the DOM was wiped, and the
    # next typing landed on the first line). Real Chrome: plaintext-only, then the contenteditable="true" fallback.
    pg.goto(f'{BASE}/templates')
    pg.get_by_role('button', name='달빛의 초대 템플릿으로 시작').click()
    pg.wait_for_selector('[data-hfield="body"]')
    doc_id = docs[-1]['id']
    body = pg.locator('[data-hfield="body"]')
    ph = body.get_attribute('data-ph')

    def body_state():
        return body.evaluate("""el => ({ text: el.textContent, html: el.innerHTML, mode: el.contentEditable,
            empty: el.matches(':empty'), ph: getComputedStyle(el, '::before').content,
            h: Math.round(el.getBoundingClientRect().height) })""")

    def wait_field(key, expected):
        for _ in range(80):
            got = next(d for d in docs if d['id'] == doc_id)['content'].get('fields', {}).get(key)
            if got == expected and pg.locator('.editor-toolbar [data-status="saved"]').count():
                return
            pg.wait_for_timeout(100)
        raise AssertionError(f'saved {key}: expected {expected!r}, got {got!r}')

    body.click()
    pg.keyboard.press('Control+A')
    pg.keyboard.press('Delete')
    s = body_state()
    assert s['empty'] and ph in s['ph'], s  # truly '' -> placeholder
    wait_field('body', '')
    one_line = s['h']
    pg.keyboard.press('Enter')
    s = body_state()
    assert s['mode'] == 'plaintext-only' and s['text'] == '\n\n' and not s['empty'] and s['ph'] == 'none', s
    assert s['h'] > one_line, s
    wait_field('body', '\n')
    pg.keyboard.type('abc')
    wait_field('body', '\nabc')
    assert body_state()['text'] == '\nabc'
    print('plaintext-only: Enter in empty body -> saved', repr('\n'), 'then typing ->', repr('\nabc'))

    # newline-only body: survives save, another field's edit, reload; Roll20 HTML/plain keep the 3 blank lines
    pg.keyboard.press('Control+A')
    pg.keyboard.press('Delete')
    pg.keyboard.press('Enter')
    pg.keyboard.press('Enter')
    wait_field('body', '\n\n')
    three_lines = body_state()['h']
    set_field(pg, 'title', '빈 줄 본문')
    wait_field('title', '빈 줄 본문')
    wait_field('body', '\n\n')
    pg.reload()
    pg.wait_for_selector('[data-hfield="body"]')
    s = body_state()
    assert s['text'] == '\n\n\n' and not s['empty'] and s['h'] == three_lines, (s, three_lines)
    assert next(d for d in docs if d['id'] == doc_id)['content']['fields']['body'] == '\n\n'
    pg.evaluate("t => navigator.clipboard.writeText(t)", 'SENTINEL')
    pg.get_by_role('button', name='Roll20에 복사').click()
    pg.wait_for_function("() => document.querySelector('.toast.show')?.innerText.includes('Roll20용')")
    clip = pg.evaluate(READ_CLIP)
    check_roll20_html(clip['text/html'], '"><br><br>&nbsp;</p>', '빈 줄 본문')
    plain = clip['text/plain'].replace('\r\n', '\n')
    # rule row, then the body's 3 blank lines between the 2-newline row separators, then the signature
    assert '────────' + '\n' * 6 + '— 블랙우드 저택의 주인' in plain and '\n' * 7 not in plain, repr(plain[:160])
    # the exported paragraph renders 3 lines in Chrome, like the canvas
    lines = pg.evaluate("""html => { const box = document.createElement('div'); box.innerHTML = html; document.body.append(box);
        const p = [...box.querySelectorAll('p')].find(e => e.innerHTML === '<br><br>&nbsp;');
        const ref = p.cloneNode(false); ref.innerHTML = 'x<br>x<br>x'; p.after(ref);
        const out = [p.getBoundingClientRect().height, ref.getBoundingClientRect().height]; box.remove(); return out; }""",
                        clip['text/html'])
    assert lines[0] == lines[1] and lines[0] > 0, lines
    # typing on the last (blank) line of the reloaded body lands after the blank lines
    box = body.bounding_box()
    body.click(position={'x': 20, 'y': box['height'] - 8})
    pg.keyboard.type('z')
    wait_field('body', '\n\nz')
    print('newline-only body: kept across save/reload, Roll20 paragraph', lines[0], 'px = 3 lines, then', repr('\n\nz'))

    # contenteditable="true" fallback (browsers without plaintext-only): Chrome wraps lines in <div>
    body.evaluate("el => { el.contentEditable = 'true' }")
    body.click()
    pg.keyboard.press('Control+A')
    pg.keyboard.press('Delete')
    s = body_state()
    assert s['mode'] == 'true' and s['empty'], s
    wait_field('body', '')
    pg.keyboard.press('Enter')
    s = body_state()
    assert s['html'] == '<div><br></div><div><br></div>' and not s['empty'], s
    wait_field('body', '\n')
    pg.keyboard.type('abc')
    wait_field('body', '\nabc')
    print('contenteditable=true: Enter in empty body ->', repr(body_state()['html']), '-> saved', repr('\nabc'))
    ctx.close()

    # ---------- mobile 390 ----------
    ctx = context(390, 844)
    pg = ctx.new_page()
    watch(pg, '390')
    pg.goto(f'{BASE}/templates')
    pg.wait_for_selector('.template-card')
    pg.wait_for_timeout(300)
    shot(pg, 'phase2-gallery-390.png')
    pg.get_by_role('button', name='비밀 결사의 인장 템플릿으로 시작').click()
    pg.wait_for_selector('.hc-canvas[data-template="order"]')
    pg.wait_for_timeout(300)
    overflow = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    assert overflow <= 0, f'horizontal overflow {overflow}px'
    shot(pg, 'phase2-studio-390.png')
    set_field(pg, 'title', '모바일 제목')
    wait_saved(pg)
    assert docs[-1]['content']['fields']['title'] == '모바일 제목'
    ctx.close()
    browser.close()

print('problems:', problems or 0)
assert not [x for x in problems if 'error' in x], problems
print('ALL OK')
