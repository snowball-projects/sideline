/** Read decoded response bytes with a hard bound, including chunked responses.
 * Content-Length is only an early rejection hint; the stream is authoritative.
 */
export async function readResponseText(response, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError("Invalid response byte limit.");
  const tooLarge = () => new Error("Shared data exceeds the " + maxBytes + " byte limit.");
  const length = response.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    try { await response.body?.cancel(); } catch { /* Preserve the size error. */ }
    throw tooLarge();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  // Coalesce into a bounded buffer rather than retaining one object per chunk.
  // Even a stream delivering a byte at a time has bounded bookkeeping cost.
  let buffer = new Uint8Array(Math.min(maxBytes, 64 * 1024));
  let bytes = 0;
  let emptyChunks = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // An injected stream can resolve empty reads forever without letting a
      // timeout task run. Tolerate a short empty burst, then fail without timers.
      if (value.byteLength === 0) {
        if (++emptyChunks > 32) throw new Error("Shared data stream made no byte progress.");
        continue;
      }
      emptyChunks = 0;
      const nextBytes = bytes + value.byteLength;
      if (nextBytes > maxBytes) throw tooLarge();
      if (nextBytes > buffer.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes,
          Math.max(nextBytes, buffer.byteLength * 2)));
        grown.set(buffer.subarray(0, bytes));
        buffer = grown;
      }
      buffer.set(value, bytes);
      bytes = nextBytes;
    }
    return new TextDecoder().decode(buffer.subarray(0, bytes));
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the read/size error. */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
