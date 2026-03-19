export function withLibpqSslCompatibility(connectionString: string): string {
  try {
    const url = new URL(connectionString);

    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    url.searchParams.set("uselibpqcompat", "true");
    url.searchParams.set("sslmode", "require");

    return url.toString();
  } catch {
    const separator = connectionString.includes("?") ? "&" : "?";
    return `${connectionString}${separator}uselibpqcompat=true&sslmode=require`;
  }
}