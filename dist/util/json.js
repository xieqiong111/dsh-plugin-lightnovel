import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
/** Write JSON atomically (temp file in the same directory + rename). */
export async function atomicWriteJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
        await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(tmp, filePath);
    }
    catch (error) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw error;
    }
}
export async function readJson(filePath, fallback) {
    try {
        const raw = await readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT')
            return fallback;
        // A torn/partially written file must not corrupt the whole store.
        if (error instanceof SyntaxError)
            return fallback;
        throw error;
    }
}
export function toJson(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=json.js.map