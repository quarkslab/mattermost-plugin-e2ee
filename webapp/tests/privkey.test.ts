import * as openpgp from 'openpgp';
import {jest} from '@jest/globals';

import 'mattermost-webapp/tests/setup';
import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';

import {AppPrivKey, AppPrivKeyIsDifferent} from '../src/privkey';
import APIClient from '../src/client';
import {PubKeyTypes, PrivKeyTypes} from '../src/action_types';
import {PublicKeyMaterial, PrivateKeyMaterial} from '../src/e2ee';
import {gpgBackupFormat} from '../src/backup_gpg';
import {StateID} from '../src/constants';

import {generateGPGKey, initOpenGPG, finiOpenGPG} from './helpers';

function testConfigureStore(initialState = {}) {
    return configureStore([thunk])(initialState);
}

const storeInitUser = {
    entities: {
        users: {
            currentUserId: 'myuserID',
        },
    },
    [StateID]: {
        pubkeys: new Map(),
    },
};

test('privkey/generateNoGPG', async () => {
    const store = testConfigureStore(storeInitUser);

    jest.spyOn(APIClient, 'getGPGPubKey').
        mockImplementation(async () => {
            return null;
        });
    jest.spyOn(APIClient, 'getPubKeys').
        mockImplementation(async () => {
            return new Map();
        });
    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(backupGPG).toStrictEqual(null);
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    const appKey = await AppPrivKey.init(store);
    const {privkey, backupGPG} = await appKey.generate();

    expect(store.getActions()).toMatchObject([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: privkey,
        },
        {
            type: PubKeyTypes.RECEIVED_PUBKEYS,
            data: new Map([['myuserID', privkey.pubKey()]]),
        },
    ]);

    // Test loading back from the key store
    const loadkey = await appKey.load();
    expect(loadkey).toBeInstanceOf(PrivateKeyMaterial);
});

test('privkey/generateWithGPG', async () => {
    const store = testConfigureStore(storeInitUser);

    initOpenGPG();
    const {privateKeyArmored, publicKeyArmored, revocationCertificate} = await generateGPGKey();

    jest.spyOn(APIClient, 'getGPGPubKey').
        mockImplementation(async () => {
            return publicKeyArmored;
        });
    jest.spyOn(APIClient, 'getPubKeys').
        mockImplementation(async () => {
            return new Map();
        });
    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(typeof backupGPG).toBe('string');
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    const appKey = await AppPrivKey.init(store);
    const {privkey, backupGPG} = await appKey.generate();

    finiOpenGPG();

    expect(store.getActions()).toMatchObject([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: privkey,
        },
        {
            type: PubKeyTypes.RECEIVED_PUBKEYS,
            data: new Map([['myuserID', privkey.pubKey()]]),
        },
    ]);

    // Test loading back from the key store
    const loadkey = await appKey.load();
    expect(loadkey).toBeInstanceOf(PrivateKeyMaterial);
});

test('privkey/import', async () => {
    const store = testConfigureStore(storeInitUser);

    const privkey = await PrivateKeyMaterial.create(true /* extractible */);
    const backup = await gpgBackupFormat(privkey);

    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(typeof backupGPG).toBe('string');
            expect(pubKey).toStrictEqual(privkey.pubKey());
        });

    const appKey = await AppPrivKey.init(store);
    const privkeyImp = await appKey.import(backup, true);

    expect(store.getActions()).toEqual([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: privkeyImp,
        },
        {
            type: PubKeyTypes.RECEIVED_PUBKEYS,
            data: new Map([['myuserID', privkeyImp.pubKey()]]),
        },
    ]);
});

test('privkey/importDifferent', async () => {
    const store = testConfigureStore(storeInitUser);

    const oldprivkey = await PrivateKeyMaterial.create(true /* extractible */);
    const privkey = await PrivateKeyMaterial.create(true /* extractible */);

    jest.spyOn(APIClient, 'getPubKeys').
        mockImplementation(async (userIds) => {
            expect(userIds).toStrictEqual(['myuserID']);
            return new Map([['myuserID', oldprivkey.pubKey()]]);
        });

    const appKey = await AppPrivKey.init(store);
    const backup = await gpgBackupFormat(privkey);
    await expect(appKey.import(backup, false)).rejects.toThrow(AppPrivKeyIsDifferent);
});
