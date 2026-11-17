import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

// Use a disposable BFF pointed at a GraphQL fixture. The connected case mutates
// the Suwayomi book shelf and queue. The offline case needs no manga server.
const base = process.env.MANGA_WEB_URL
const profile = process.env.MANGA_TEST_PROFILE ?? 'offline'
if (!base || !['fixture', 'offline', 'local'].includes(profile)) {
  throw new Error('Set MANGA_WEB_URL and MANGA_TEST_PROFILE=fixture|offline|local.')
}
const query = process.env.MANGA_TEST_QUERY
if (profile !== 'offline' && !query) throw new Error('Set MANGA_TEST_QUERY to a fixture title.')

const browser = await chromium.launch({
  channel: process.env.CHROME_BIN ? undefined : 'chrome',
  executablePath: process.env.CHROME_BIN,
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
const unexpectedOrigins = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('request', (request) => {
  const url = new URL(request.url())
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(base).origin) unexpectedOrigins.push(url.origin)
})
if (process.env.MANGA_TEST_BFF_TOKEN) {
  await page.addInitScript((token) => localStorage.setItem('ln_api_token', token), process.env.MANGA_TEST_BFF_TOKEN)
}

const open = async (route) => {
  await page.goto(`${base}/#${route}`)
  await page.getByText('实时数据', { exact: true }).first().waitFor()
}

try {
  if (profile !== 'offline') {
    await open(`/search?type=manga&q=${encodeURIComponent(query)}`)
    const result = page.locator('[data-media-type="manga"] a').first()
    await result.waitFor()
    await result.click()
    assert.match(page.url(), /#\/manga\/\d+$/)
    await page.getByRole('heading', { name: '章节', exact: true }).waitFor()
    const add = page.getByRole('button', { name: '加入漫画书架', exact: true })
    if (await add.isEnabled()) await add.click()
    await page.getByText('已在漫画书架', { exact: true }).waitFor()
    await page.getByRole('button', { name: '更新章节', exact: true }).click()
    await page.getByText('已向漫画源更新章节', { exact: true }).waitFor()
    if (profile === 'local') {
      await page.getByText('本地漫画中的章节已存放在 Suwayomi 数据目录。', { exact: true }).waitFor()
      await page.locator('input[type="checkbox"]:disabled').first().waitFor()
      await page.getByRole('img', { name: new RegExp(query) }).waitFor()
    } else {
      await page.locator('input[type="checkbox"]:enabled').first().check()
      await page.getByRole('button', { name: '下载选中章节（1）' }).click()
      await page.getByText('已在下载队列确认 1 个章节', { exact: true }).waitFor()
      await page.getByRole('link', { name: '查看漫画下载队列' }).click()
      const task = page.locator('[data-task-id^="manga:"]').first()
      await task.waitFor()
      assert.ok(await task.getByRole('button', { name: '暂停' }).isDisabled())
      if (process.env.MANGA_TEST_PROGRESS) {
        await task.getByText(`${process.env.MANGA_TEST_PROGRESS}%`, { exact: true }).waitFor()
      }
    }
    await open('/library')
    await page.locator('[data-media-type="manga"]').first().waitFor()
    if (process.env.MANGA_TEST_NOVEL_LIBRARY === '1') {
      await page.locator('[data-media-type="novel"]').first().waitFor()
    }
    assert.equal(await page.getByText('演示数据', { exact: true }).count(), 0)
    console.log(profile === 'local'
      ? 'PASS Live browser against real Suwayomi local source: search, detail, cover, chapters, refresh, shelf'
      : 'PASS Live browser against GraphQL fixture: search, detail, chapters, book shelf, download queue')
  } else {
    await open('/search?q=%E6%98%9F%E6%B5%B7%E6%97%85%E9%80%94')
    await page.getByText(/漫画源不可用/).first().waitFor()
    await page.getByText('星海旅途', { exact: true }).first().waitFor()
    assert.equal(await page.locator('[data-media-type="manga"]').count(), 0)

    await open('/library')
    await page.getByText(/漫画书架不可用/).waitFor()
    if (process.env.MANGA_TEST_NOVEL_LIBRARY === '1') {
      await page.locator('[data-media-type="novel"]').first().waitFor()
    }
    await open('/tasks')
    await page.getByText(/漫画下载队列不可用/).waitFor()
    await open('/manga/101')
    await page.getByText('漫画详情不可用', { exact: true }).waitFor()
    assert.equal(await page.getByText('演示数据', { exact: true }).count(), 0)
    console.log('PASS Live browser degradation: manga outage is explicit, novel search remains usable, no Mock fallback')
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedOrigins, [])
} finally {
  await browser.close()
}
