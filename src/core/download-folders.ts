import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

export interface DownloadFolders {
  novelFolder: string | null
  mangaFolder: string
  mangaPrevious: string[]
}

export function validSubfolder(folder: unknown): folder is string {
  return typeof folder === 'string' && folder.length <= 512 && (folder === '' || folder.split('/').every(
    (name) => name.length > 0 && !name.startsWith('.') && !/[\\:\x00-\x1f\x7f]/.test(name),
  ))
}

/** Resolve existing directories below an administrator-provided mount without following symlinks. */
export async function folderWithin(root: string, relative: string): Promise<string> {
  if (!path.isAbsolute(root) || !validSubfolder(relative)) throw new Error('Invalid download folder')
  const base = await realpath(root)
  let dir = base
  for (const name of relative ? relative.split('/') : []) {
    dir = path.join(dir, name)
    if (!(await lstat(dir)).isDirectory()) throw new Error('Download folder must be a directory')
  }
  if (!(await lstat(dir)).isDirectory()) throw new Error('Download folder must be a directory')
  return dir
}

export async function readDownloadFolders(filename: string): Promise<DownloadFolders> {
  const initial = { novelFolder: null, mangaFolder: '', mangaPrevious: [] }
  if (!filename) return initial
  let raw: string
  try {
    raw = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initial
    throw error
  }
  const data = JSON.parse(raw)
  if (!data || !(data.novelFolder === null || validSubfolder(data.novelFolder)) || !validSubfolder(data.mangaFolder)
    || !Array.isArray(data.mangaPrevious) || !data.mangaPrevious.every(validSubfolder)) {
    throw new Error('Invalid saved download folders')
  }
  return data
}
