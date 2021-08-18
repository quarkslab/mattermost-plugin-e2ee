import 'mattermost-webapp/tests/setup';

import {PrivateKeyMaterial, PublicKeyMaterial, E2EEValidationError} from '../src/e2ee';
import {encryptPost, decryptPost} from '../src/e2ee_post';

import {E2EE_POST_TYPE} from 'constants';

const b64 = require('base64-arraybuffer');

function fakePost(msg) {
    return {message: msg};
}

test('e2ee_post/EncryptDecrypt', async () => {
    // Create keys
    const u0 = await PrivateKeyMaterial.create();
    const u1 = await PrivateKeyMaterial.create();

    const msg = 'hello world';
    const post = fakePost(msg);

    await encryptPost(post, u0, [u0.pubKey(), u1.pubKey()]);
    expect(post.props.e2ee).toBeDefined();

    const e2ee = post.props.e2ee;
    const decrMsg = await decryptPost(e2ee, u0.pubKey(), u1);
    expect(msg).toStrictEqual(decrMsg);

    // Test that we detect message manipulation
    const encrData = b64.decode(e2ee.encryptedData);
    new Uint8Array(encrData)[0] ^= 1;
    e2ee.encryptedData = b64.encode(encrData);

    await expect(decryptPost(e2ee, u0.pubKey(), u1)).rejects.toThrow(new E2EEValidationError());
});
