export interface DownloadFolders {
    novelFolder: string | null;
    mangaFolder: string;
    mangaPrevious: string[];
}
export declare function validSubfolder(folder: unknown): folder is string;
/** Resolve existing directories below an administrator-provided mount without following symlinks. */
export declare function folderWithin(root: string, relative: string): Promise<string>;
export declare function readDownloadFolders(filename: string): Promise<DownloadFolders>;
