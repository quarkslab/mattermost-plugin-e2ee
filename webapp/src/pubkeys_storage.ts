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

export async function getNewChannelPubkeys(chanID: string, pubkeys: Map<string, PublicKeyMaterial>): Promise<Array<[string, PublicKeyMaterial]>> {
    const ret: Array<[string, PublicKeyMaterial]> = [];
    const key = 'e2eeChannelRecipients:' + chanID;
    const chanRecipients = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    for (const [userID, pubkey] of pubkeys) {
        // eslint-disable-next-line no-await-in-loop
        if (!chanRecipients.has(b64.encode(await pubkey.id()))) {
            ret.push([userID, pubkey]);
        }
    }
    return ret;
}

export async function storeChannelPubkeys(chanID: string, pubkeys: Array<PublicKeyMaterial>) {
    const key = 'e2eeChannelRecipients:' + chanID;
    const val = await Promise.all(pubkeys.map((pk) => pk.id().then((v) => b64.encode(v))));
    localStorage.setItem(key, JSON.stringify(val));
}
