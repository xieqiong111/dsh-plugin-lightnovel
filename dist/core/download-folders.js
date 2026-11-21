import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
export function validSubfolder(folder) {
    return typeof folder === 'string' && folder.length <= 512 && (folder === '' || folder.split('/').every((name) => name.length > 0 && !name.startsWith('.') && !/[\\:\x00-\x1f\x7f]/.test(name)));
}
/** Resolve existing directories below an administrator-provided mount without following symlinks. */
export async function folderWithin(root, relative) {
    if (!path.isAbsolute(root) || !validSubfolder(relative))
        throw new Error('Invalid download folder');
    const base = await realpath(root);
    let dir = base;
    for (const name of relative ? relative.split('/') : []) {
        dir = path.join(dir, name);
        if (!(await lstat(dir)).isDirectory())
            throw new Error('Download folder must be a directory');
    }
    if (!(await lstat(dir)).isDirectory())
        throw new Error('Download folder must be a directory');
    return dir;
}
export async function readDownloadFolders(filename) {
    const initial = { novelFolder: null, mangaFolder: '', mangaPrevious: [] };
    if (!filename)
        return initial;
    let raw;
    try {
        raw = await readFile(filename, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return initial;
        throw error;
    }
    const data = JSON.parse(raw);
    if (!data || !(data.novelFolder === null || validSubfolder(data.novelFolder)) || !validSubfolder(data.mangaFolder)
        || !Array.isArray(data.mangaPrevious) || !data.mangaPrevious.every(validSubfolder)) {
        throw new Error('Invalid saved download folders');
    }
    return data;
}
//# sourceMappingURL=download-folders.js.map