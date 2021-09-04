import 'mattermost-webapp/tests/setup';
import {jest} from '@jest/globals';

import {pubkeyStore} from '../src/pubkeys_storage';
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
