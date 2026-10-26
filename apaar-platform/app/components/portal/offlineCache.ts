/** The Cache Storage bucket the verifier page is saved in. public/sw.js uses the same name. */
export const OFFLINE_CACHE = "apaar-offline-v1";

/** Forget the saved page, for example on sign-out, so it is not left behind on a shared device. */
export async function clearOfflineCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(OFFLINE_CACHE);
  } catch {
    /* nothing to clear */
  }
}
