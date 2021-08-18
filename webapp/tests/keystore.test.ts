import 'mattermost-webapp/tests/setup';
import {KeyStore, KeyStoreError} from '../src/keystore';

const {Crypto} = require('node-webcrypto-ossl');
const crypto = new Crypto();
const subtle = crypto.subtle;

const TestECParams: EcKeyGenParams = {
    name: 'ECDSA',
    namedCurve: 'P-256',
};

test('keystore/read_none', async () => {
    const key = await subtle.generateKey(TestECParams, false, ['sign', 'verify']);
    const ks = await KeyStore.open();
    await expect(ks.loadKey('__unk__', key)).rejects.toThrow(KeyStoreError);
});

test('keystore/store_read', async () => {
    const key = await subtle.generateKey(TestECParams, false, ['sign', 'verify']);

    const ks = await KeyStore.open();
    await ks.saveKey('a', key);
    const key_loaded = await ks.loadKey('a');

    /*expect(key_loaded.publicKey).toStrictEqual(key.publicKey)

  const data = Buffer.from("hello!")
  const sign_algo = {name: "ECDSA", hash: "SHA-256"}
  const sign = await subtle.sign(sign_algo, key_loaded.privateKey, data)
  const valid = await subtle.verify(sign_algo, key.publicKey, sign, data)
  expect(valid).toStrictEqual(true)*/
});

test('keystore/erase', async () => {
    const key = await subtle.generateKey(TestECParams, false, ['sign', 'verify']);

    const ks = await KeyStore.open();
    await ks.saveKey('erase', key, true);
    await ks.saveKey('erase', key, true);
});
