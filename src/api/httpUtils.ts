export async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const atobFn = globalThis.atob as ((d: string) => string) | undefined;
    if (!atobFn) return null;
    const binary = atobFn(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function decodeJwtEmail(token: string): string | undefined {
  const payload = decodeJwtPayload<{ email?: string }>(token);
  return typeof payload?.email === 'string' ? payload.email : undefined;
}
