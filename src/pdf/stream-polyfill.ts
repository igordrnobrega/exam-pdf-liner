/**
 * Safari (up to at least 18) has no ReadableStream[Symbol.asyncIterator], but
 * pdf.js 6 relies on `for await (const chunk of stream)` both on the main
 * thread (getTextContent) and in the worker (DecompressionStream). Install a
 * minimal implementation when it is missing.
 */
export function installStreamPolyfill(): void {
  if (typeof ReadableStream === 'undefined') return;
  const proto = ReadableStream.prototype as ReadableStream & {
    values?: (opts?: { preventCancel?: boolean }) => AsyncIterableIterator<unknown>;
  };
  if (typeof proto[Symbol.asyncIterator] === 'function') return;

  async function* iterate(
    this: ReadableStream,
    opts?: { preventCancel?: boolean },
  ): AsyncGenerator<unknown> {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      if (!opts?.preventCancel) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  proto.values = iterate;
  Object.defineProperty(proto, Symbol.asyncIterator, {
    value: iterate,
    writable: true,
    configurable: true,
  });
}

installStreamPolyfill();
