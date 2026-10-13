/** Never log raw database errors: they can include credentials or submitted data. */
export function databaseDiagnostic(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    DB_URL_INVALID:
      "DATABASE_URL is invalid. Paste only the postgres:// or postgresql:// URL, without a variable name, quotes, or psql command.",
    DB_DIRECT_URL_INVALID:
      "DATABASE_URL_UNPOOLED is invalid. Paste Neon's direct connection URL, without a variable name, quotes, or psql command.",
    ENOTFOUND:
      "Database hostname could not be resolved. Check the Neon connection URL.",
    ECONNREFUSED:
      "Database connection refused. Check the endpoint and access settings.",
    ETIMEDOUT:
      "Database connection timed out. Check Neon availability and network access.",
    EHOSTUNREACH: "Database endpoint is unreachable. Check network access.",
    "28P01":
      "Database password rejected. Copy a fresh connection URL from Neon.",
    "3D000":
      "Configured database does not exist. Check the database selected in Neon Connect.",
    "42501": "Database role lacks permission to initialise the schema.",
    "53300":
      "Database connection limit reached. Use Neon's pooled application URL.",
    SELF_SIGNED_CERT_IN_CHAIN:
      "Database TLS certificate verification failed. Keep TLS enabled and check certificate trust.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      "Database TLS certificate verification failed. Keep TLS enabled and check certificate trust.",
  };
  return (
    messages[code] ||
    "Database initialisation or query failed. Check Neon connection settings and schema permissions; raw error details have been withheld."
  );
}
