// pdf.js 6 uses Map/WeakMap "upsert" methods that many current browsers do not have yet.
type Upsertable<K, V> = {
  has(k: K): boolean;
  get(k: K): V | undefined;
  set(k: K, v: V): unknown;
  getOrInsert?: (k: K, v: V) => V;
  getOrInsertComputed?: (k: K, fn: (k: K) => V) => V;
};

function patch(proto: Upsertable<unknown, unknown>): void {
  if (!proto.getOrInsert) {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      writable: true,
      value(this: Upsertable<unknown, unknown>, k: unknown, v: unknown) {
        if (!this.has(k)) this.set(k, v);
        return this.get(k);
      },
    });
  }
  if (!proto.getOrInsertComputed) {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value(this: Upsertable<unknown, unknown>, k: unknown, fn: (k: unknown) => unknown) {
        if (!this.has(k)) this.set(k, fn(k));
        return this.get(k);
      },
    });
  }
}

/** Math.sumPrecise is also missing from most browsers; a compensated sum is precise enough for drawing. */
function patchMath(): void {
  const m = Math as unknown as { sumPrecise?: (xs: Iterable<number>) => number };
  if (!m.sumPrecise) {
    m.sumPrecise = (xs) => {
      let sum = 0;
      let c = 0;
      for (const x of xs) {
        const y = x - c;
        const t = sum + y;
        c = t - sum - y;
        sum = t;
      }
      return sum;
    };
  }
}

patchMath();
patch(Map.prototype as unknown as Upsertable<unknown, unknown>);
patch(WeakMap.prototype as unknown as Upsertable<unknown, unknown>);

/** Source text of the same patch, prepended to the pdf.js worker (a separate JS realm). */
export const WORKER_POLYFILL = `(${patch.toString()})(Map.prototype);(${patch.toString()})(WeakMap.prototype);(${patchMath.toString()})();`;
