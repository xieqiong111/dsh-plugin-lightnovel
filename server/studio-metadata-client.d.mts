export function callStudioMetadata(
  action: string,
  body: Record<string, unknown>,
  config: { url: string | undefined, tokenFile: string | undefined },
): Promise<unknown>
