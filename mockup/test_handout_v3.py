"""Playwright check for trpg_folio_mockup_v3.html (handout studio + Roll20 rich copy).

usage: python test_handout_v3.py [path-to-v3.html] [chrome-executable]
"""
import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / 'trpg_folio_mockup_v3.html'
chrome = sys.argv[2] if len(sys.argv) > 2 else next(
    (c for c in [r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                 r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                 '/usr/bin/google-chrome'] if os.path.exists(c)), None)
screens = HERE / 'screens'
screens.mkdir(exist_ok=True)
url = path.as_uri()

# Windows' system clipboard can report "Clipboard data has changed" right after a write; retry a few times.
READ_CLIP = """async () => { let last;
  for (let i = 0; i < 10; i++) { try {
    const items = await navigator.clipboard.read(); const out = {};
    for (const it of items) for (const t of it.types) out[t] = await (await it.getType(t)).text();
    return out; } catch (e) { last = e; await new Promise(r => setTimeout(r, 150)); } }
  throw last; }"""


def check_roll20_html(html, *needles):
    for n in needles:
        assert n in html, ('missing in text/html', n)
    low = html.lower()
    assert '<style' not in low and '<script' not in low, 'style/script tag in roll20 html'
    assert not re.search(r'\sclass\s*=', low), 'class attribute in roll20 html'
    assert '<table' in low and 'style="' in low, 'expected inline-styled table markup'
    assert '<br>' in html, 'body line break should become <br>'
    assert 'pre-wrap' not in low, 'should not rely on white-space:pre-wrap'


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=chrome, headless=True)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url + '#handout')
    pg.wait_for_selector('.canvas-sheet')

    pg.screenshot(path=str(screens / 'v3_handout.png'))
    # default handout -> copy via the button, save the Roll20 markup for review
    pg.locator('.right-panel [data-action="copy-roll20"]').click()
    pg.wait_for_function("document.getElementById('toast').classList.contains('show')")
    default_html = pg.evaluate(READ_CLIP)['text/html']
    (screens / 'v3_roll20_clip.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>v3 roll20 clip (default)</title>'
        '<body style="background:#fff;padding:30px">' + default_html + '</body>', encoding='utf-8')

    assert pg.locator('[data-hfield]').count() == 3
    btn = pg.locator('.right-panel [data-action="copy-roll20"]')
    assert btn.inner_text().strip() == 'Roll20에 복사', btn.inner_text()
    assert 'Ctrl+V' in pg.locator('.right-panel').inner_text()
    assert 'HTML 코드 복사' not in pg.locator('.right-panel').inner_text()

    # direct edit: title, Enter moves to body, multi-line body
    pg.locator('[data-hfield="title"]').click()
    pg.keyboard.press('Control+A'); pg.keyboard.type('새로운 제목 <b>&')
    pg.keyboard.press('Enter')
    assert pg.evaluate('document.activeElement.dataset.hfield') == 'body'
    pg.keyboard.press('Control+A'); pg.keyboard.type('첫 줄'); pg.keyboard.press('Enter'); pg.keyboard.type('둘째 줄')
    st = pg.evaluate("JSON.parse(localStorage.getItem('folio_demo_handout'))")
    print('state:', st)
    assert st['title'] == '새로운 제목 <b>&'
    assert '첫 줄' in st['body'] and '둘째 줄' in st['body'] and '\n' in st['body']

    # clear cap -> empty state, then retype
    c = pg.locator('[data-hfield="cap"]')
    c.click(); pg.keyboard.press('Control+A'); pg.keyboard.press('Delete')
    assert pg.evaluate("JSON.parse(localStorage.getItem('folio_demo_handout')).cap") == ''
    c.click(); pg.keyboard.type('MY CAP')

    # Roll20 copy (classic)
    btn.click()
    pg.wait_for_function("document.getElementById('toast').classList.contains('show')")
    print('toast:', pg.locator('#toast').inner_text())
    assert 'Roll20' in pg.locator('#toast').inner_text()
    clip = pg.evaluate(READ_CLIP)
    print('clipboard types:', list(clip))
    assert 'text/html' in clip and 'text/plain' in clip, clip.keys()
    check_roll20_html(clip['text/html'], '새로운 제목 &lt;b&gt;&amp;', '첫 줄<br>둘째 줄', 'MY CAP', '❧', '#e8ddc9')
    assert '새로운 제목 <b>&' in clip['text/plain'] and '둘째 줄' in clip['text/plain'] and '<' not in clip['text/plain'].replace('<b>', '')
    print('text/html length:', len(clip['text/html']))
    print('text/plain:', repr(clip['text/plain']))

    # rendered pasted result: paste into a contenteditable and check it survives as designed
    pg.evaluate("""() => { const d=document.createElement('div'); d.id='pastebox'; d.contentEditable='true';
        d.style.cssText='position:fixed;left:0;top:0;width:500px;background:#fff;z-index:9999'; document.body.append(d); d.focus(); }""")
    pg.keyboard.press('Control+V')
    pasted = pg.evaluate("document.getElementById('pastebox').innerHTML")
    assert '둘째 줄' in pasted and 'background-color' in pasted, pasted[:300]
    pg.locator('#pastebox').screenshot(path=str(screens / 'v3_roll20_pasted.png'))
    pg.evaluate("document.getElementById('pastebox').remove()")

    # theme switch keeps content, Roll20 copy follows theme colours
    pg.click('[data-theme="dark"]')
    pg.wait_for_selector('.canvas-sheet.dark')
    assert pg.locator('[data-hfield="title"]').inner_text() == '새로운 제목 <b>&'
    assert pg.locator('[data-hfield="cap"]').inner_text() == 'MY CAP'
    assert '둘째 줄' in pg.locator('[data-hfield="body"]').inner_text()
    pg.locator('.right-panel [data-action="copy-roll20"]').click()
    pg.wait_for_timeout(200)
    clip = pg.evaluate(READ_CLIP)
    check_roll20_html(clip['text/html'], '#23343b', '#e8dec7', '새로운 제목')

    # code view + code modal + HTML file download still work
    pg.click('[data-canvas="code"]')
    assert '새로운 제목' in pg.locator('.code-preview').inner_text()
    pg.click('[data-canvas="preview"]')
    pg.locator('.right-panel [data-action="code"]').click()
    pg.wait_for_selector('.modal .code-preview, .code-preview')
    pg.locator('[data-action="copy-html"]').first.click()
    pg.wait_for_timeout(200)
    code_clip = pg.evaluate(READ_CLIP)
    assert code_clip.get('text/plain', '').startswith('<!doctype html>'), 'code copy should still copy source'
    pg.keyboard.press('Escape')
    pg.goto(url + '#handout'); pg.wait_for_selector('.canvas-sheet')
    with pg.expect_download() as dl:
        pg.locator('.right-panel [data-action="export-handout"]').click()
    print('download:', dl.value.suggested_filename)
    assert dl.value.suggested_filename == 'folio-handout.html'

    # reload persists
    pg.reload(); pg.wait_for_selector('.canvas-sheet')
    assert pg.locator('[data-hfield="title"]').inner_text() == '새로운 제목 <b>&'
    assert pg.locator('.canvas-sheet.dark').count() == 1

    def set_field(field, txt):
        pg.locator(f'[data-hfield="{field}"]').click()
        pg.keyboard.press('Control+A'); pg.keyboard.press('Delete')
        pg.keyboard.type(txt)

    def copy_and_wait(expect):
        pg.locator('.right-panel [data-action="copy-roll20"]').click()
        pg.wait_for_function("t => { const el = document.getElementById('toast');"
                             " return el.classList.contains('show') && el.innerText.includes(t); }", arg=expect)
        return pg.locator('#toast').inner_text()

    def nbsp_to_space(s):
        return s.replace('\u00a0', ' ')

    # whitespace preservation: leading indentation, 2+/3+ space runs, a tab; title with a double space
    set_field('title', 'X  Y')
    set_field('body', '    들여쓴 줄')
    pg.keyboard.press('Enter'); pg.keyboard.type('A  B   C')
    pg.keyboard.press('Enter'); pg.keyboard.insert_text('\t탭 줄')
    st = pg.evaluate("JSON.parse(localStorage.getItem('folio_demo_handout'))")
    print('ws state:', repr(st['title']), repr(st['body']))
    canvas_body = nbsp_to_space(pg.locator('[data-hfield="body"]').inner_text())
    assert '    들여쓴 줄' in canvas_body and 'A  B   C' in canvas_body, repr(canvas_body)
    copy_and_wait('Roll20')
    clip = pg.evaluate(READ_CLIP)
    html = clip['text/html']
    check_roll20_html(html, 'X&nbsp; Y',
                      '&nbsp;&nbsp;&nbsp;&nbsp;들여쓴 줄<br>A&nbsp; B&nbsp;&nbsp; C<br>&nbsp;&nbsp;&nbsp;&nbsp;탭 줄')
    assert '\t' not in html and '  ' not in re.sub(r'>\s+<', '><', html.split('X&nbsp; Y')[1].split('THE END')[0]), \
        'raw space runs left in generated text'
    plain = clip['text/plain'].replace('\r\n', '\n')  # Windows clipboard stores CRLF
    print('ws text/plain:', repr(plain))
    assert 'X  Y' in plain and '    들여쓴 줄\nA  B   C\n    탭 줄' in plain and '\u00a0' not in plain and '\t' not in plain
    pg.evaluate("""() => { const d=document.createElement('div'); d.id='pastebox'; d.contentEditable='true';
        d.style.cssText='position:fixed;left:0;top:0;width:500px;background:#fff;z-index:9999'; document.body.append(d); d.focus(); }""")
    pg.keyboard.press('Control+V')
    pasted_text = nbsp_to_space(pg.evaluate("document.getElementById('pastebox').innerText"))
    print('ws pasted innerText:', repr(pasted_text))
    for want in ('X  Y', '    들여쓴 줄', 'A  B   C', '    탭 줄'):
        assert want in pasted_text, ('pasted render lost spaces', want, pasted_text)
    assert pg.evaluate("getComputedStyle(document.getElementById('pastebox')).whiteSpace") == 'normal'
    pg.locator('#pastebox').screenshot(path=str(screens / 'v3_roll20_pasted_ws.png'))
    pg.evaluate("document.getElementById('pastebox').remove()")

    SENTINEL = 'SENTINEL-clipboard-before-copy'
    OK_TOAST = 'Roll20용 핸드아웃을 복사했습니다'
    FAIL_TOAST = '클립보드 접근을 차단했습니다'

    def fresh(title):
        """reload (drops any API overrides), put a sentinel on the clipboard and give the handout a unique title"""
        pg.goto(url + '#handout'); pg.reload(); pg.wait_for_selector('.canvas-sheet')
        pg.evaluate("t => navigator.clipboard.writeText(t)", SENTINEL)
        assert pg.evaluate(READ_CLIP).get('text/plain') == SENTINEL
        set_field('title', title)
        # spy: count execCommand calls, and those made synchronously inside copyRich() -- i.e. with copyRich (called
        # from the click handler) still on the call stack, not from a later promise callback. The app lives in an
        # IIFE, so copyRich cannot be wrapped from outside; the V8 stack trace is used instead.
        pg.evaluate("""() => { window.__exec = 0; window.__execSync = 0;
            window.__count = () => { window.__exec++; if (/\\bat copyRich\\b/.test(new Error().stack)) window.__execSync++; };
            const orig = document.execCommand.bind(document);
            document.execCommand = (...a) => { window.__count(); return orig(...a); }; }""")

    def assert_fresh_copy(title):
        clip = pg.evaluate(READ_CLIP)
        print('  clipboard types:', list(clip))
        assert clip.get('text/plain') != SENTINEL, 'clipboard still holds the sentinel: no fresh copy'
        check_roll20_html(clip.get('text/html', ''), title)
        assert title in clip.get('text/plain', '')

    # fallback A: no async clipboard API -> execCommand fallback runs synchronously inside the click
    fresh('FALLBACK-SYNC-제목')
    pg.evaluate("() => { const r = navigator.clipboard.read.bind(navigator.clipboard);"
                " Object.defineProperty(navigator, 'clipboard', {value: {read: r}, configurable: true}); }")
    print('fallback A toast:', copy_and_wait(OK_TOAST))
    assert_fresh_copy('FALLBACK-SYNC-제목')
    assert pg.evaluate('window.__execSync') == 1, 'execCommand fallback must run synchronously within the click handler'

    # fallback B: ClipboardItem throws synchronously -> fallback, still within the click
    fresh('FALLBACK-THROW-제목')
    pg.evaluate("() => { window.ClipboardItem = function () { throw new TypeError('boom'); }; }")
    print('fallback B toast:', copy_and_wait(OK_TOAST))
    assert_fresh_copy('FALLBACK-THROW-제목')
    assert pg.evaluate('window.__execSync') == 1

    # fallback C: async write rejects -> post-rejection fallback
    fresh('FALLBACK-ASYNC-제목')
    pg.evaluate("() => { navigator.clipboard.write = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); }")
    print('fallback C toast:', copy_and_wait(OK_TOAST))
    assert_fresh_copy('FALLBACK-ASYNC-제목')
    assert pg.evaluate('window.__execSync') == 0 and pg.evaluate('window.__exec') == 1

    # failure: async write rejects AND execCommand returns false -> Korean failure toast, clipboard untouched
    fresh('FAIL-제목')
    pg.evaluate("""() => { navigator.clipboard.write = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
        document.execCommand = () => { window.__count(); return false; }; }""")
    print('failure toast:', copy_and_wait(FAIL_TOAST))
    assert pg.evaluate('window.__exec') == 1
    assert pg.evaluate(READ_CLIP).get('text/plain') == SENTINEL

    # failure (sync path): no async API AND execCommand returns false
    fresh('FAIL-SYNC-제목')
    pg.evaluate("""() => { Object.defineProperty(navigator, 'clipboard', {value: {read: navigator.clipboard.read.bind(navigator.clipboard)}, configurable: true});
        document.execCommand = () => { window.__count(); return false; }; }""")
    print('failure (sync) toast:', copy_and_wait(FAIL_TOAST))
    assert pg.evaluate('window.__execSync') == 1
    assert pg.evaluate(READ_CLIP).get('text/plain') == SENTINEL

    print('page errors:', errs)
    assert not errs
    b.close()
print('ALL OK')
