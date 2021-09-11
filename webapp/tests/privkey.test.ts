import * as openpgp from 'openpgp';
import {jest} from '@jest/globals';

import 'mattermost-webapp/tests/setup';
import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';

import {AppPrivKey, AppPrivKeyIsDifferent} from '../src/privkey';
import APIClient from '../src/client';
import {PubKeyTypes, PrivKeyTypes, KSTypes} from '../src/action_types';
import {PublicKeyMaterial, PrivateKeyMaterial} from '../src/e2ee';
import {gpgBackupFormat} from '../src/backup_gpg';
import {StateID} from '../src/constants';
import {KeyStore} from '../src/keystore';

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

async function getStoreInit() {
    const ret = Object.assign({}, storeInitUser);
    ret[StateID].ks = await KeyStore.open(ret.entities.users.currentUserId);
    return ret;
}

test('privkey/init', async () => {
    const store = testConfigureStore(storeInitUser);
    const {data: ks} = await store.dispatch(AppPrivKey.init(store));

    expect(store.getActions()).toMatchObject([
        {
            type: KSTypes.GOT_KS,
            data: ks,
        },
    ]);
});

test('privkey/generateNoGPG', async () => {
    const store = testConfigureStore(await getStoreInit());

    jest.spyOn(APIClient, 'getGPGPubKey').
        mockImplementation(async () => {
            return null;
        });
    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(backupGPG).toStrictEqual(null);
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    const {data, error} = await store.dispatch(AppPrivKey.generate());
    expect(error).toBeUndefined();
    const {privkey, backupGPG} = data;

    expect(store.getActions()).toMatchObject([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: {privkey, pubkey: await privkey.pubKey(), userID: 'myuserID'},
        },
    ]);
});

test('privkey/generateWithGPG', async () => {
    const store = testConfigureStore(await getStoreInit());

    initOpenGPG();
    const {privateKeyArmored, publicKeyArmored, revocationCertificate} = await generateGPGKey();

    jest.spyOn(APIClient, 'getGPGPubKey').
        mockImplementation(async () => {
            return publicKeyArmored;
        });
    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(typeof backupGPG).toBe('string');
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    const {data, error} = await store.dispatch(AppPrivKey.generate());
    expect(error).toBeUndefined();
    const {privkey, backupGPG} = data;

    finiOpenGPG();

    expect(store.getActions()).toMatchObject([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: {privkey, pubkey: await privkey.pubKey(), userID: 'myuserID'},
        },
    ]);
});

test('privkey/import', async () => {
    const store = testConfigureStore(await getStoreInit());

    const privkey = await PrivateKeyMaterial.create(true /* extractible */);
    const backup = await gpgBackupFormat(privkey);

    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(typeof backupGPG).toBe('string');
            expect(pubKey).toStrictEqual(privkey.pubKey());
        });

    const {data: privkeyImp, error} = await store.dispatch(AppPrivKey.import(backup, true));
    expect(error).toBeUndefined();

    expect(store.getActions()).toEqual([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: {privkey: privkeyImp, pubkey: privkeyImp.pubKey(), userID: 'myuserID'},
        },
    ]);
});

test('privkey/importDifferent', async () => {
    const store = testConfigureStore(await getStoreInit());

    const oldprivkey = await PrivateKeyMaterial.create(true /* extractible */);
    const privkey = await PrivateKeyMaterial.create(true /* extractible */);

    jest.spyOn(APIClient, 'getPubKeysDebounced').
        mockImplementation(async (userIds) => {
            expect(userIds).toStrictEqual(['myuserID']);
            return new Map([['myuserID', oldprivkey.pubKey()]]);
        });

    const backup = await gpgBackupFormat(privkey);
    const {data, error} = await store.dispatch(AppPrivKey.import(backup, false));
    expect(error).toBeInstanceOf(AppPrivKeyIsDifferent);
});
