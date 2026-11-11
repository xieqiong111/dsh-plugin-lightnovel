export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
    ts: string;
    level: LogLevel;
    scope: string;
    event: string;
    message?: string;
    [key: string]: unknown;
}
export interface Logger {
    debug(scope: string, event: string, fields?: Record<string, unknown>): void;
    info(scope: string, event: string, fields?: Record<string, unknown>): void;
    warn(scope: string, event: string, fields?: Record<string, unknown>): void;
    error(scope: string, event: string, fields?: Record<string, unknown>): void;
    child(defaultScope: string): Logger;
    recent(limit?: number): LogEntry[];
    flush(): Promise<void>;
    close(): Promise<void>;
}
/** Structured JSON-lines logger with an in-memory ring buffer and daily files. */
export declare function createLogger(logsDir: string, level?: LogLevel, echo?: boolean): Logger;
