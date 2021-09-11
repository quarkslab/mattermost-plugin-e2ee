/* eslint-disable no-await-in-loop */

import 'mattermost-webapp/tests/setup';

import {webcrypto} from '../src/webcrypto';
import {EncryptedP2PMessage, PrivateKeyMaterial, PublicKeyMaterial, getPubkeyID, E2EEValidationError} from '../src/e2ee';

const b64 = require('base64-arraybuffer');
const subtle = webcrypto.subtle;

test('e2ee/EncryptedP2PMessage', async () => {
    // Create keys
    const u0 = await PrivateKeyMaterial.create();
    const u1 = await PrivateKeyMaterial.create();
    const u2 = await PrivateKeyMaterial.create();

    // u0 sends a message to itself, u1 & u2
    const msg = Buffer.from('hello world!', 'ascii');
    const encrMsg = await EncryptedP2PMessage.encrypt(msg, u0, [u0.pubKey(), u1.pubKey(), u2.pubKey()]);

    // Verify the message with u0's public key
    const valid = await encrMsg.verify(u0.pubKey());
    expect(valid).toStrictEqual(true);

    for (const key of [u0, u1, u2]) {
        // Decrypt the message with the user's private key
        const decrMsg = await encrMsg.decrypt(key);
        expect(decrMsg).toStrictEqual(msg.buffer);

        // Do the same with the verifyAndDecrypt API
        const decrMsg2 = await encrMsg.verifyAndDecrypt(u0.pubKey(), key);
        expect(decrMsg2).toStrictEqual(msg.buffer);
    }

    // This new user can't decrypt data
    const u3 = await PrivateKeyMaterial.create();
    await expect(encrMsg.decrypt(u3)).rejects.toThrow(Error);
});

test('e2ee/ModifiedMsg', async () => {
    // Create keys
    const u0 = await PrivateKeyMaterial.create();
    const u1 = await PrivateKeyMaterial.create();

    // u0 sends a message to itself & u1
    const msg = Buffer.from('hello world!', 'ascii');
    const encrMsg = await EncryptedP2PMessage.encrypt(msg, u0, [u0.pubKey(), u1.pubKey()]);

    // Modify the encrypted data, verifies it is catched
    new Uint8Array(encrMsg.encryptedData)[0] ^= 1;

    const valid = await encrMsg.verify(u0.pubKey());
    expect(valid).toStrictEqual(false);

    await expect(encrMsg.verifyAndDecrypt(u0.pubKey(), u0)).rejects.toThrow(new E2EEValidationError());

    // Modify the wrapped key of u1, verifies it is catched
    // TODO: we can't test this as node-webcrypto-ossl doesn't properly check for
    // integrity in AES-KW. See
    // https://github.com/PeculiarVentures/node-webcrypto-ossl/issues/175
    /*const pkID = await getPubkeyID(u1.pubECDHKey())
    const wrappedKey = encrMsg.encryptedKey[b64.encode(pkID)]
    new Uint8Array(wrappedKey)[0] ^= 1
    await expect(encrMsg.decrypt(u1.ecdh)).rejects.toThrow(E2EEValidationError)*/
});

test('e2ee/pubidCache', async () => {
    const own = await PrivateKeyMaterial.create();
    const pub = own.pubKey();

    const id = pub.id();
    const orgDigest = subtle.digest;
    subtle.digest = jest.fn();
    const id2 = pub.id();
    expect(subtle.digest).not.toHaveBeenCalled();
    subtle.digest = orgDigest;
    expect(id).toStrictEqual(id2);
});

test('e2ee/jsonPub', async () => {
    const own = await PrivateKeyMaterial.create();
    const recv = await PrivateKeyMaterial.create();
    const recvPub = recv.pubKey();

    const jsonable = await recvPub.jsonable();
    const recvPub2 = await PublicKeyMaterial.fromJsonable(jsonable);
    expect(recvPub2).toStrictEqual(recvPub);

    // Encrypt a message by own for recv
    const msg = Buffer.from('hello world!', 'ascii');
    const encrMsg = await EncryptedP2PMessage.encrypt(msg, own, [recvPub2]);

    // And decrypt
    const decrMsg = await encrMsg.decrypt(recv);
    expect(decrMsg).toStrictEqual(msg.buffer);

    // Now, json back & forth the decrypted message, and try to decript it
    const encrMsgJson = await encrMsg.jsonable();
    const encrMsg2 = await EncryptedP2PMessage.fromJsonable(encrMsgJson);
    const decrMsg2 = await encrMsg2.decrypt(recv);
    expect(decrMsg2).toStrictEqual(msg.buffer);
});

test('e2ee/jsonPriv', async () => {
    const own = await PrivateKeyMaterial.create(true /* exportable */);

    const jsonable = await own.jsonable(true /* b64 */);
    const own2 = await PrivateKeyMaterial.fromJsonable(jsonable, true /* b64 */, true /* exportable */);

    expect(own2).toStrictEqual(own);
    expect(await own2.jsonable(true)).toStrictEqual(jsonable);
});
