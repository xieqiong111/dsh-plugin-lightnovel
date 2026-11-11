/**
 * Traditional/Simplified Chinese normalisation + fuzzy title matching.
 *
 * The primary converter is OpenCC (opencc-js), which covers the full character
 * set. A small built-in fallback map keeps the plugin functional when the
 * optional dependency is unavailable (e.g. a stripped-down NAS image).
 */
/** Idempotent, safe to call from every tool invocation. */
export declare function ensureChinese(extraPairs?: string): Promise<void>;
/** Traditional -> Simplified (plus operator-supplied extra pairs). */
export declare function toSimplified(text: string): string;
/** Comparison key: NFKC + simplified + lowercase, punctuation and spacing removed. */
export declare function normalizeText(text: string): string;
/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export declare function diceSimilarity(a: string, b: string): number;
export interface FieldMatch {
    score: number;
    matchedBy: string[];
}
/** Score one book against a normalised query across title / alias / author / tags. */
export declare function scoreBook(query: string, fields: {
    title: string;
    aliases: string[];
    author: string;
    tags: string[];
    description?: string | null;
}): FieldMatch;
