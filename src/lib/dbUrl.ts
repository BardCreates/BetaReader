/**
 * The pg driver treats sslmode=prefer/require/verify-ca as verify-full today, warns that this
 * will change to weaker libpq semantics in its next major version, and prints a warning on
 * every start. Spell out verify-full so connections keep full certificate checks either way.
 * (Neon's default connection string uses sslmode=require.)
 */
export function withStrictSsl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
}
