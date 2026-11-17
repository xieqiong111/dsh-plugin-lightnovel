/** Loopback-only upstream fixture for the Live browser smoke test. */
import http from 'node:http'
import { createSuwayomiMock } from './suwayomi-mock.mjs'

const port = Number(process.env.MANGA_FIXTURE_PORT ?? 4568)
const fixture = createSuwayomiMock()
const server = http.createServer(async (req, res) => {
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 64 * 1024) {
        res.writeHead(413).end()
        return
      }
      chunks.push(chunk)
    }
    const response = await fixture.fetch(new URL(req.url ?? '/', `http://127.0.0.1:${port}`), {
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
      redirect: 'error',
    })
    for (const task of fixture.queue.values()) {
      task.state = 'DOWNLOADING'
      task.progress = 0.37
    }
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.writeHead(500).end()
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Suwayomi GraphQL fixture: http://127.0.0.1:${port} · title 星港邮差`)
})
