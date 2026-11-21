# Native DSH manga tools

The plugin exposes manga tools alongside the existing light-novel tools. They call the shared Suwayomi client used by the web backend, so both surfaces use the same server URL, authentication, GraphQL operations, and normalized results. The Studio read-only API is a separate connection.

## Install and configure

Use DSH **0.2.2-rc.1** and Node.js **24.9 or newer**. Until this feature is published to npm, build and install the package tarball from this branch:

```bash
npm ci
npm run build
npm pack
dsh plugin --profile myprofile add ./dsh-plugin-lightnovel-1.0.0.tgz
```

Configure Suwayomi in the environment available to the DSH process or its container. The client reads these variables:

```bash
export LN_SUWAYOMI_URL="http://suwayomi:4567"
# Optional, when the server requires HTTP Basic authentication:
export LN_SUWAYOMI_USERNAME="…"
export LN_SUWAYOMI_PASSWORD="…"
# Optional request timeout in milliseconds (default 8000; bounded to 1000–30000):
export LN_SUWAYOMI_TIMEOUT_MS="8000"
```

The unprefixed `SUWAYOMI_URL`, `SUWAYOMI_USERNAME`, `SUWAYOMI_PASSWORD`, and `SUWAYOMI_TIMEOUT_MS` are also supported. The URL must be an HTTP(S) origin, without a path, query, fragment, or embedded credentials, and should be reachable from the host or container running DSH. Set both username and password or leave both empty. Credentials are read by the server-side client and are not tool arguments. When deploying all three containers, see the shared Docker network instructions in [MANGA.md](./MANGA.md). Keep the existing light-novel `lightnovel` row in `cordis.patch.yml`; the manga tools are registered by that same plugin.

## Available tools

| Tool | Operation |
|---|---|
| `manga_search` | Search installed sources or browse popular/latest manga. Use `nextOffset` with `resultId` on the same `page` before advancing. |
| `manga_details` | Read normalized metadata for one manga id. |
| `manga_chapters` | List chapters and their read/download metadata with pagination. |
| `manga_download` | Enqueue explicitly selected chapter ids in Suwayomi. |
| `manga_tasks` | Read the download queue or dequeue selected chapter ids. |
| `manga_library` | List manga currently in the Suwayomi library. |
| `manga_sources` | List installed Suwayomi sources. |
| `manga_subscribe` | Set Suwayomi's `inLibrary` flag for one manga. |
| `manga_komga_download` | Enqueue one recognized volume for automatic CBZ export. |
| `manga_komga_status` | Read the actual chapter queue and confirm the archived CBZ filename. |
| `studio_read` | Query Studio libraries and task or archive status with a scoped read-only key. |

The shortest workflow is `manga_sources` → `manga_search` → `manga_details` → `manga_chapters` → `manga_download` → `manga_tasks`. `manga_download` takes both the parent `mangaId` and explicit `chapterIds` returned by `manga_chapters`, so the client can verify every chapter belongs to that manga before enqueueing. Use `manga_subscribe` with `inLibrary: true` to add a manga to the library, or `false` to remove it. Suwayomi exposes library membership here; it does not expose a separate recurring subscription schedule through this operation.

`manga_download` only enqueues chapters in Suwayomi's queue. It does not retrieve page images into the DSH plugin. For chapter images and reading, use the Suwayomi reader.

## Komga archive and Studio read API

For the volume tools, set `LN_VOLUME_ARCHIVE_URL` to the internal archive service and keep the Suwayomi connection configured. See [archive deployment and progress APIs](MANGA-VOLUME-CBZ.md). You can supply these service settings through a private JSON file using `LN_MANGA_CONNECTION_FILE`.

For `studio_read`, generate a read-only key in Studio under **系统设置 → 服务集成**. Save it to a private file readable by DSH and set `LN_STUDIO_READ_URL` to the Studio origin and `LN_STUDIO_READ_TOKEN_FILE` to that file's path inside the DSH container. To list available operations and supported arguments, see [Studio integrations](../web/README.md#komga-api-和-dsh-只读密钥).

## Verify native loading

From the repository root:

```bash
npm ci
npm run build
npx vitest run test/integration/dsh-manga-tools.test.ts test/integration/dsh-cli.test.ts
npx vitest run test/integration/dsh-runtime.test.ts -t 'DSH loading'
```

`dsh-runtime.test.ts` mounts the built package in the real Cordis context with DSH's `ToolsService` and native executor, then checks that all novel and manga tools are registered with compiled schemas. The `DSH loading` filter avoids the existing novel EPUB workflow, which separately needs the compiled Dart binary. `dsh-manga-tools.test.ts` dispatches each manga tool through the real executor against a fake Suwayomi client, so it does not make server changes. `dsh-cli.test.ts` checks profile bundle composition using the locked DSH CLI dependency.
