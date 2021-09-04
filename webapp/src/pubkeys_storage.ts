import {PublicKeyMaterial} from './e2ee';
import {arrayBufferEqual} from './utils';

const b64 = require('base64-arraybuffer');

// Returns true if the key has changed, and false if we didn't know the key, or
// if it is the same we already had.
export async function pubkeyStore(userID: string, pubkey: PublicKeyMaterial): Promise<boolean> {
    const pubkeyID = await pubkey.id();
    return new Promise((resolve, reject) => {
        const key = 'pubkeyID:' + userID;
        const knownPubkey = localStorage.getItem(key);
        try {
            if (knownPubkey === null) {
                localStorage.setItem(key, b64.encode(pubkeyID));
                resolve(false);
                return;
            }
            if (arrayBufferEqual(b64.decode(knownPubkey), pubkeyID)) {
                resolve(false);
                return;
            }
            localStorage.setItem(key, b64.encode(pubkeyID));
            resolve(true);
        } catch (e) {
            reject(e);
        }
    });
}
