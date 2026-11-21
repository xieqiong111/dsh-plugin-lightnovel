import { readFile } from 'node:fs/promises'

export async function callStudioMetadata(action, body, { url, tokenFile }) {
  if (!url || !tokenFile) throw new Error('STUDIO_METADATA_UNCONFIGURED: 请配置 Studio 地址及元数据密钥文件。')
  if (!['search', 'books', 'preview', 'apply'].includes(action)) {
    throw new Error('INVALID_METADATA_ACTION: 请选择 search、books、preview 或 apply。')
  }
  let token, endpoint
  try {
    const origin = new URL(url)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== origin.origin + '/') throw Error()
    endpoint = new URL(`/api/komga/metadata/${action}`, origin)
    token = (await readFile(tokenFile, 'utf8')).trim()
    if (!/^studio_metadata_[A-Za-z0-9_-]{43}$/.test(token)) throw Error()
  } catch {
    throw new Error('STUDIO_METADATA_CONFIGURATION: Studio 地址或元数据密钥文件无效。')
  }

  let response, result
  try {
    response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(55000),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const chunks = []
    let length = 0
    for await (const chunk of response.body ?? []) {
      length += chunk.byteLength
      if (length > 2 * 1024 * 1024) throw Error()
      chunks.push(chunk)
    }
    result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error()
  } catch {
    throw new Error('STUDIO_METADATA_UNAVAILABLE: Studio 元数据 API 不可用或返回了无法读取的响应。')
  }
  if (!response.ok) {
    const code = /^[A-Z_]{3,60}$/.test(result?.error?.code) ? result.error.code : 'STUDIO_METADATA_HTTP_ERROR'
    const message = typeof result?.error?.message === 'string' ? result.error.message.slice(0, 240) : `HTTP ${response.status}`
    throw new Error(`${code}: ${message}`)
  }
  return result
}
