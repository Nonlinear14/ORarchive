import sys
from playwright.sync_api import sync_playwright

path = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + path + '#handout')
    pg.wait_for_selector('.canvas-sheet')

    # old edit panel gone
    assert pg.locator('#h-title').count() == 0, 'old panel still present'
    assert pg.locator('[data-hfield]').count() == 3

    # edit title directly in canvas
    t = pg.locator('[data-hfield="title"]')
    t.click()
    pg.keyboard.press('Control+A')
    pg.keyboard.type('새로운 제목')
    # Enter in title moves to body, not newline
    pg.keyboard.press('Enter')
    assert pg.evaluate("document.activeElement.dataset.hfield") == 'body'
    pg.keyboard.press('Control+A')
    pg.keyboard.type('첫 줄')
    pg.keyboard.press('Enter')
    pg.keyboard.type('둘째 줄')

    st = pg.evaluate("JSON.parse(localStorage.getItem('folio_demo_handout'))")
    print('state:', st)
    assert st['title'] == '새로운 제목'
    assert '첫 줄' in st['body'] and '둘째 줄' in st['body'] and '\n' in st['body']

    # clear a field -> placeholder shows, state empty
    c = pg.locator('[data-hfield="cap"]')
    c.click(); pg.keyboard.press('Control+A'); pg.keyboard.press('Delete')
    assert pg.evaluate("JSON.parse(localStorage.getItem('folio_demo_handout')).cap") == ''
    assert pg.evaluate("document.querySelector('[data-hfield=cap]').innerHTML") == ''
    c.click(); pg.keyboard.type('MY CAP')

    # theme switch keeps edited content
    pg.click('[data-theme="dark"]')
    pg.wait_for_selector('.canvas-sheet.dark')
    assert pg.locator('[data-hfield="title"]').inner_text() == '새로운 제목'
    assert pg.locator('[data-hfield="cap"]').inner_text() == 'MY CAP'
    assert '둘째 줄' in pg.locator('[data-hfield="body"]').inner_text()

    # code view reflects edits
    pg.click('[data-canvas="code"]')
    assert '새로운 제목' in pg.locator('.code-preview').inner_text()
    pg.click('[data-canvas="preview"]')

    pg.screenshot(path='/home/claude/work/shot_desktop.png')

    # mobile layout
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(200)
    pg.screenshot(path='/home/claude/work/shot_mobile.png', full_page=True)

    # reload persists
    pg.set_viewport_size({'width': 1440, 'height': 900})
    pg.reload()
    pg.wait_for_selector('.canvas-sheet')
    assert pg.locator('[data-hfield="title"]').inner_text() == '새로운 제목'
    print('page errors:', errs)
    assert not errs
    b.close()
print('ALL OK')
