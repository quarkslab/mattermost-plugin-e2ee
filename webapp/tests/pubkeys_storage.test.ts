import 'mattermost-webapp/tests/setup';
import {jest} from '@jest/globals';

import {pubkeyStore, getNewChannelPubkeys, storeChannelPubkeys} from '../src/pubkeys_storage';
import {PrivateKeyMaterial} from '../src/e2ee';

test('pubkeysStore', async () => {
    const privkey = await PrivateKeyMaterial.create(false /* exportable */);
    const pubkey = await privkey.pubKey();

    let hasChanged = await pubkeyStore('user1', pubkey);
    expect(hasChanged).toStrictEqual(false);

    hasChanged = await pubkeyStore('user1', pubkey);
    expect(hasChanged).toStrictEqual(false);

    const privkey2 = await PrivateKeyMaterial.create(false /* exportable */);
    const pubkey2 = await privkey2.pubKey();

    hasChanged = await pubkeyStore('user1', pubkey2);
    expect(hasChanged).toStrictEqual(true);
});

test('channelPubkeys', async () => {
    const privkey0 = await PrivateKeyMaterial.create(false /* exportable */);
    const pubkey0 = await privkey0.pubKey();
    const uid0 = 'user0';
    const privkey1 = await PrivateKeyMaterial.create(false /* exportable */);
    const pubkey1 = await privkey1.pubKey();
    const uid1 = 'user1';

    const chanID = 'mychan';
    const pubkeys = new Map([[uid0, pubkey0]]);
    let ret = await getNewChannelPubkeys(chanID, pubkeys);
    expect(ret).toStrictEqual(Array.from(pubkeys));
    await storeChannelPubkeys(chanID, Array.from(pubkeys.values()));

    ret = await getNewChannelPubkeys(chanID, pubkeys);
    expect(ret).toStrictEqual([]);

    pubkeys.set(uid1, pubkey1);
    ret = await getNewChannelPubkeys(chanID, pubkeys);
    expect(ret).toStrictEqual([[uid1, pubkey1]]);
});
