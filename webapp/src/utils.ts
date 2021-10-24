import {Store} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';

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

export function arrayBufferEqual(A: ArrayBuffer, B: ArrayBuffer) {
    const VA = new DataView(A);
    const VB = new DataView(B);
    if (VA.byteLength !== VB.byteLength) {
        return false;
    }
    for (let i = 0; i < VA.byteLength; i++) {
        if (VA.getUint8(i) !== VB.getUint8(i)) {
            return false;
        }
    }
    return true;
}

export function observeStore<T>(store: Store, select: (s: GlobalState) => T, onChange: (store: Store, v: T) => Promise<void>) {
    let currentState: T;

    async function handleChange() {
        const nextState = select(store.getState());
        if (nextState !== currentState) {
            currentState = nextState;
            await onChange(store, currentState);
        }
    }

    const unsubscribe = store.subscribe(handleChange);
    handleChange();
    return unsubscribe;
}

export function debouncedMerge<T, R>(func: (a: Array<T>) => Promise<R>, reducer: (res: R, org: Array<T>) => R, wait: number): (a: Array<T>) => Promise<R> {
    const merged = new Set<T>();
    let timeout: any = null;
    let cbs_success: any = [];
    let cbs_reject: any = [];
    return async (arg: Array<T>): Promise<R> => {
        for (const v of arg) {
            merged.add(v);
        }
        return new Promise((resolve, reject) => {
            const doCall = () => {
                timeout = null;

                // We copy & clean the shared state **before** calling the
                // asynchronous function, as we could yield back into the
                // debounced function, which would modify the state during the
                // call, hence ending up in a race condition!
                // We then clear this shared state so that we can properly
                // register the next round.
                const local_cbs_success = [...cbs_success];
                const local_cbs_reject = [...cbs_reject];
                const local_merged = [...merged];
                merged.clear();
                cbs_success = [];
                cbs_reject = [];
                func(local_merged).then((res) => {
                    for (const cb of local_cbs_success) {
                        cb(res);
                    }
                }).catch((e) => {
                    for (const cb of local_cbs_reject) {
                        cb(e);
                    }
                });
            };
            cbs_success.push((res: R) => {
                try {
                    resolve(reducer(res, arg));
                } catch (e) {
                    reject(e);
                }
            });
            cbs_reject.push((e: any) => {
                reject(e);
            });
            if (timeout === null) {
                timeout = setTimeout(doCall, wait);
            }
        });
    };
}

export function debouncedMergeMapArrayReducer<K, V>(funcres: Map<K, V>, keys: Array<K>) {
    const ret = new Map();
    for (const v of keys) {
        ret.set(v, funcres.get(v));
    }
    return ret;
}

// Based on mattermost-webapp/utils/utils.jsx
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 22;
const RESERVED_USERNAMES = [
    'valet',
    'all',
    'channel',
    'here',
    'matterbot',
    'system',
    'e2ee',
];

export function isValidUsername(name: string): boolean {
    if (!name) {
        return false;
    } else if (name.length < MIN_USERNAME_LENGTH || name.length > MAX_USERNAME_LENGTH) {
        return false;
    } else if (!(/^[a-z0-9.\-_]+$/).test(name)) {
        return false;
    } else if (!(/[a-z]/).test(name.charAt(0))) { //eslint-disable-line no-negated-condition
        return false;
    }
    for (const reserved of RESERVED_USERNAMES) {
        if (name === reserved) {
            return false;
        }
    }

    return true;
}
