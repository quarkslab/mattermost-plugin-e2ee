/* eslint-disable global-require */

import {Post} from 'mattermost-redux/types/posts.js';

import {PrivateKeyMaterial, PublicKeyMaterial, EncryptedP2PMessage, EncryptedP2PMessageJSON} from './e2ee';
import {isNode} from './utils';
import {E2EE_POST_TYPE} from './constants';

// TODO: put this mess somewhere else, or do it with helpers
let UtilTextEncoder: typeof TextEncoder;
let UtilTextDecoder: typeof TextDecoder;

if (isNode) {
    const nodeUtil = require('util');
    UtilTextEncoder = nodeUtil.TextEncoder;
    UtilTextDecoder = nodeUtil.TextDecoder;
} else {
    UtilTextEncoder = TextEncoder;
    UtilTextDecoder = TextDecoder;
}

export async function encryptPost(post: Post, privkey: PrivateKeyMaterial, pubkeys: Array<PublicKeyMaterial>) {
    const postMsg = new UtilTextEncoder().encode(post.message);
    const encrMsg = await EncryptedP2PMessage.encrypt(postMsg, privkey, pubkeys);
    const encrMsgJson = await encrMsg.jsonable(true /* encb64 */);
    post.props = {e2ee: encrMsgJson};
    post.message = 'Encrypted message';

    // TODO: AG: TS isn't happy here because PostType is a fixed set of string
    // literals. I don't see how we can extend PostType, so ignore this error
    // for now.
    // @ts-ignore
    post.type = E2EE_POST_TYPE;
}

// Throws E2EEValidationError is the post's integrity can't be verified or authenticated
export async function decryptPost(e2ee: EncryptedP2PMessageJSON, senderkey: PublicKeyMaterial, privkey: PrivateKeyMaterial): Promise<string> {
    const encrMsg = await EncryptedP2PMessage.fromJsonable(e2ee, true /* decb64 */);

    const msg = await encrMsg.verifyAndDecrypt(senderkey, privkey);
    return new UtilTextDecoder('utf-8').decode(msg);
}

export function isEncryptedPost(post: Post): boolean {
    return (typeof post.props !== 'undefined') && (typeof post.props.e2ee !== 'undefined');
}
