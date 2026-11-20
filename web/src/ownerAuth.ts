const SALT = "mesghalyar-owner-v1";
const HASH = "2334dfe3fc020bee9648c09a39eb3aca2d59f92d47d811f06d3f3af51b6514a2";

/**
 * The panel is client-side only, so this gate keeps casual visitors out of the
 * owner settings; it is not a server-enforced credential. Only the salted hash
 * ships in the bundle, never the password itself.
 */
export async function checkOwnerPassword(input: string): Promise<boolean> {
  if (!input) return false;
  try {
    const data = new TextEncoder().encode(`${SALT}:${input}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === HASH;
  } catch {
    return false;
  }
}
