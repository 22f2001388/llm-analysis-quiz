export function encode(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64');
}

export function decode(s: string): string {
  return Buffer.from(s, 'base64').toString('utf-8');
}
