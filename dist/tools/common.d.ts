import type { InferValue } from '@deepseek-ai/dsh-tools';
import type { PluginRuntime } from '../runtime.js';
/**
 * Every tool returns a *canonical lossless JSON value* (requirement #4/#12).
 * We declare the root as the annotation-only `json` schema: the DSL compiles it
 * to `{}`, which accepts any JSON value while still enforcing losslessness and
 * letting PTC mode re-enter the normal tool pipeline with a typed result.
 */
export declare const CANONICAL_SCHEMA: {
    readonly type: "json";
};
export type CanonicalValue = InferValue<typeof CANONICAL_SCHEMA>;
/** Domain values -> lossless JSON, stripping undefined/class instances. */
export declare function canonical(value: unknown): CanonicalValue;
/** Fresh output projection for one tool definition (never mutate after register). */
export declare function jsonOutput(): {
    schema: {
        readonly type: "json";
    };
    render: (_args: unknown, value: unknown) => {
        type: "text";
        text: string;
    }[];
};
export interface ToolFailure {
    code: string;
    message: string;
    retryable: boolean;
}
/** Map internal errors to stable, agent-readable codes. */
export declare function classifyError(error: unknown): ToolFailure;
/**
 * Uniform tool envelope: wait for plugin init, then either return the domain
 * result or a structured `{ ok: false, error }` value.
 *
 * Returning a canonical error value (instead of throwing) is deliberate: the
 * agent can read `error.code`, correct its arguments and try again without the
 * runtime marking the whole tool as a broken infrastructure call.
 */
export declare function runTool(runtime: PluginRuntime, scope: string, fn: () => Promise<unknown>): Promise<CanonicalValue>;
export declare function ok(value: Record<string, unknown>): Record<string, unknown>;
