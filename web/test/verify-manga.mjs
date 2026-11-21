import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const base = process.env.MANGA_WEB_URL ?? 'http://127.0.0.1:4173'
const screenshots = process.env.MANGA_SCREENSHOTS_DIR
const browser = await chromium.launch({
  channel: process.env.CHROME_BIN ? undefined : 'chrome',
  executablePath: process.env.CHROME_BIN,
  headless: true,
})

if (screenshots) await mkdir(screenshots, { recursive: true })

async function capture(page, name) {
  if (screenshots) await page.screenshot({ path: path.join(screenshots, name), animations: 'disabled', fullPage: true })
}

async function open(page, route) {
  await page.goto(`${base}/#${route}`)
}

const choose = (page, name) => page.getByRole('group', { name: '资源类型' }).getByRole('button', { name, exact: true })
const novelCards = (page) => page.locator('[data-media-type="novel"]')
const mangaCards = (page) => page.locator('[data-media-type="manga"]')

async function noHorizontalOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const pageErrors = []
  const requests = []
  desktop.on('pageerror', (error) => pageErrors.push(String(error)))
  desktop.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
  })

  await open(desktop, '/search')
  await choose(desktop, '漫画').click()
  await desktop.getByLabel('搜索作品').fill('星際信使')
  await desktop.getByRole('button', { name: '搜索书籍' }).click()
  await desktop.getByRole('link', { name: /星港邮差/ }).waitFor()
  await desktop.getByRole('link', { name: /星港郵差/ }).waitFor()
  assert.equal(await mangaCards(desktop).count(), 2, 'same-title versions remain separate')
  await capture(desktop, 'desktop-search.png')

  await desktop.getByLabel('漫画源').selectOption('200')
  await desktop.getByRole('link', { name: /星港邮差/ }).waitFor({ state: 'hidden' })
  assert.equal(await mangaCards(desktop).count(), 1)
  await desktop.reload()
  assert.equal(await choose(desktop, '漫画').getAttribute('aria-pressed'), 'true')
  assert.equal(await desktop.getByLabel('搜索作品').inputValue(), '星際信使')
  await desktop.getByRole('link', { name: /星港郵差/ }).click()
  await desktop.getByRole('heading', { name: '星港郵差', exact: true }).waitFor()
  assert.match(desktop.url(), /#\/manga\/103$/)
  await desktop.getByRole('button', { name: '加入漫画书架' }).click()
  await desktop.getByText('已在漫画书架', { exact: true }).waitFor()
  await desktop.getByRole('button', { name: '取消订阅', exact: true }).waitFor()
  await desktop.getByRole('button', { name: '更新章节' }).click()
  await desktop.getByText('已向漫画源更新章节', { exact: true }).waitFor()
  await desktop.getByRole('checkbox', { name: '第 5 话 · 起航' }).check()
  await desktop.getByRole('checkbox', { name: '第 4 话 · 无地址的信' }).check()
  await desktop.getByRole('button', { name: '下载选中章节（2）' }).click()
  await desktop.getByText('已在下载队列确认 2 个章节', { exact: true }).waitFor()
  await desktop.getByRole('link', { name: '查看漫画下载队列' }).click()
  await desktop.locator('[data-task-id="manga:1035"]').waitFor()
  assert.equal(await mangaCards(desktop).count(), 2)
  assert.ok(await desktop.getByRole('button', { name: '暂停', exact: true }).first().isDisabled())
  assert.equal(await desktop.getByText('未报告进度', { exact: true }).count(), 2)
  await desktop.getByRole('group', { name: '任务状态' }).getByRole('button', { name: /已完成/ }).click()
  assert.equal(await mangaCards(desktop).count(), 0)
  await desktop.getByRole('group', { name: '任务状态' }).getByRole('button', { name: /全部状态/ }).click()
  await choose(desktop, '全部').click()
  await novelCards(desktop).first().waitFor()
  assert.equal(await mangaCards(desktop).count(), 2)
  const ids = await desktop.locator('[data-task-id]').evaluateAll((elements) => elements.map((element) => element.dataset.taskId))
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.some((id) => id.startsWith('novel:')))
  await capture(desktop, 'desktop-tasks.png')

  await open(desktop, '/manga/102')
  await desktop.getByRole('button', { name: '订阅追更' }).click()
  await desktop.getByRole('button', { name: '取消订阅', exact: true }).click()
  await desktop.getByRole('button', { name: '取消订阅并移出书架' }).click()
  await desktop.getByRole('button', { name: '订阅追更' }).waitFor()

  await open(desktop, '/library')
  await mangaCards(desktop).first().waitFor()
  assert.ok(await novelCards(desktop).count() > 0)
  const sharedTitle = desktop.getByText('月下的茶馆', { exact: true })
  assert.ok(await sharedTitle.count() >= 2)
  await noHorizontalOverflow(desktop)
  await capture(desktop, 'desktop-library.png')
  await desktop.getByRole('button', { name: '列表视图' }).click()
  await desktop.getByRole('link', { name: /星港郵差/ }).waitFor()
  await choose(desktop, '轻小说').click()
  assert.equal(await mangaCards(desktop).count(), 0)
  await choose(desktop, '漫画').click()
  assert.equal(await novelCards(desktop).count(), 0)
  await desktop.reload()
  assert.equal(await choose(desktop, '漫画').getAttribute('aria-pressed'), 'true')

  await open(desktop, '/sources')
  await desktop.getByText('已启用的漫画源').waitFor()
  await desktop.getByText('已验证', { exact: true }).waitFor()
  await open(desktop, '/novel/fixture%3Amoon-teahouse')
  await desktop.getByRole('heading', { name: /月下的茶馆/ }).first().waitFor()
  assert.deepEqual(requests, [], 'Mock mode cannot call BFF APIs')

  const darkLibrary = desktop.locator('.library-cover-grid [data-media-type]').first()
  await open(desktop, '/library')
  await darkLibrary.waitFor()
  const lightCard = await darkLibrary.evaluate((element) => getComputedStyle(element).backgroundColor)
  await desktop.getByRole('button', { name: '切换为深色模式' }).click()
  await desktop.locator('html[data-theme="dark"]').waitFor()
  await desktop.waitForFunction((light) => {
    const card = document.querySelector('.library-cover-grid [data-media-type]')
    return card && getComputedStyle(card).backgroundColor !== light
  }, lightCard)
  assert.equal(await desktop.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark')
  await capture(desktop, 'desktop-library-dark.png')
  await desktop.reload()
  await desktop.getByRole('button', { name: '切换为浅色模式' }).waitFor()
  await open(desktop, '/settings')
  const appearance = desktop.getByRole('group', { name: '外观模式' })
  assert.equal(await appearance.getByRole('button', { name: '深色', exact: true }).getAttribute('aria-pressed'), 'true')
  await desktop.getByRole('button', { name: '清空缓存' }).click()
  const dialog = desktop.getByRole('dialog')
  await dialog.waitFor()
  assert.notEqual(await dialog.evaluate((element) => getComputedStyle(element).backgroundColor), lightCard)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await desktop.emulateMedia({ colorScheme: 'light' })
  await appearance.getByRole('button', { name: '跟随系统' }).click()
  await desktop.locator('html[data-theme="light"]').waitFor()
  await desktop.emulateMedia({ colorScheme: 'dark' })
  await desktop.locator('html[data-theme="dark"]').waitFor()
  await desktop.reload()
  assert.equal(await appearance.getByRole('button', { name: '跟随系统' }).getAttribute('aria-pressed'), 'true')
  await desktop.getByRole('button', { name: '切换为浅色模式' }).click()
  await desktop.locator('html[data-theme="light"]').waitFor()

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1, hasTouch: true })
  mobile.on('pageerror', (error) => pageErrors.push(String(error)))
  await open(mobile, '/manga/101')
  await mobile.getByRole('heading', { name: '星港邮差', exact: true }).waitFor()
  await mobile.getByText('已下载', { exact: true }).waitFor()
  await mobile.getByText('演示数据', { exact: true }).first().waitFor()
  await noHorizontalOverflow(mobile)
  await capture(mobile, 'mobile-manga.png')
  await mobile.getByRole('button', { name: '打开导航' }).click()
  await mobile.getByRole('link', { name: '我的书库' }).click()
  await mangaCards(mobile).first().waitFor()
  await noHorizontalOverflow(mobile)
  await capture(mobile, 'mobile-library.png')
  await mobile.getByRole('button', { name: '列表视图' }).click()
  await noHorizontalOverflow(mobile)
  await mobile.getByRole('button', { name: '网格视图' }).click()
  await mobile.getByRole('button', { name: '切换为深色模式' }).click()
  await mobile.locator('html[data-theme="dark"]').waitFor()
  await noHorizontalOverflow(mobile)
  await capture(mobile, 'mobile-library-dark.png')
  await mobile.getByRole('button', { name: '通知' }).click()
  const panel = mobile.getByText('通知为本地演示数据。').locator('..')
  const bounds = await panel.boundingBox()
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390)
  const tablet = await browser.newPage({ viewport: { width: 768, height: 1024 }, hasTouch: true })
  tablet.on('pageerror', (error) => pageErrors.push(String(error)))
  await open(tablet, '/manga/103')
  await tablet.getByRole('heading', { name: '星港郵差', exact: true }).waitFor()
  await noHorizontalOverflow(tablet)
  assert.deepEqual(pageErrors, [])
  console.log('PASS Mock browser: search aliases and source identity, detail/download/subscribe, shared library and queue, route refresh, theme persistence and system mode, desktop, tablet and mobile')
} finally {
  await browser.close()
}
