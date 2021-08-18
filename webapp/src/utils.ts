export const isNode = typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

export function concatArrayBuffers(...args: Array<ArrayBuffer>) {
    const buffers = Array.prototype.slice.call(args);
    const buffersLengths = buffers.map((b) => {
        return b.byteLength;
    });
    const totalBufferlength = buffersLengths.reduce((p, c) => {
        return p + c;
    }, 0);
    const unit8Arr = new Uint8Array(totalBufferlength);
    buffersLengths.reduce((p, c, i) => {
        unit8Arr.set(new Uint8Array(buffers[i]), p);
        return p + c;
    }, 0);
    return unit8Arr.buffer;
}

export function eqSet<T>(A: Set<T>, B: Set<T>) {
    if (A.size !== B.size) {
        return false;
    }
    for (const a of A) {
        if (!B.has(a)) {
            return false;
        }
    }
    return true;
}
