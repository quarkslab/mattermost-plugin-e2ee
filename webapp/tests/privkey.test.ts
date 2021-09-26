import * as openpgp from 'openpgp';
import {jest} from '@jest/globals';

import 'mattermost-webapp/tests/setup';
import {Client4} from 'mattermost-redux/client';
import {ClientError} from 'mattermost-redux/client/client4';

import configureStore from 'redux-mock-store';
import thunk from 'redux-thunk';

import {AppPrivKey, AppPrivKeyIsDifferent} from '../src/privkey';
import {APIClient} from '../src/client';
import {PubKeyTypes, PrivKeyTypes, KSTypes} from '../src/action_types';
import {PublicKeyMaterial, PrivateKeyMaterial} from '../src/e2ee';
import {gpgBackupFormat} from '../src/backup_gpg';
import {StateID} from '../src/constants';
import {KeyStore} from '../src/keystore';
import HKP from '../src/hkp';

import {generateGPGKey, initOpenGPG, finiOpenGPG} from './helpers';

function testConfigureStore(initialState = {}) {
    return configureStore([thunk])(initialState);
}

const curUserID = 'myuserID';
const storeInitUser = {
    entities: {
        users: {
            currentUserId: curUserID,
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

afterAll(() => {
    jest.restoreAllMocks();
});

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

test('privkey/hasPubkeyFalse', async () => {
    const store = testConfigureStore(storeInitUser);
    jest.spyOn(APIClient, 'getPubKeysDebounced').
        mockImplementation(async (userIds) => {
            expect(userIds).toStrictEqual([curUserID]);
            return new Map([[curUserID, null]]);
        });
    expect(await store.dispatch(AppPrivKey.userHasPubkey())).toStrictEqual({data: false});
});

test('privkey/hasPubkeyTrue', async () => {
    const store = testConfigureStore(await getStoreInit());
    const key = await PrivateKeyMaterial.create(false /* exportable */);

    jest.spyOn(APIClient, 'getPubKeysDebounced').
        mockImplementation(async (userIds) => {
            expect(userIds).toStrictEqual([curUserID]);
            return new Map([[curUserID, key.pubKey()]]);
        });
    expect(await store.dispatch(AppPrivKey.userHasPubkey())).toStrictEqual({data: true});
});

test('privkey/generateNoGPG', async () => {
    const store = testConfigureStore(await getStoreInit());

    jest.spyOn(Client4, 'getUser').mockImplementation(async (userID) => {
        expect(userID).toStrictEqual(curUserID);
        return {email: 'roger@test.com'};
    });

    jest.spyOn(APIClient, 'getGPGKeyServer').
        mockImplementation(async () => {
            throw new ClientError(Client4.url, {
                message: '',
                status_code: 404,
                url: ''});
        });
    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(backupGPG).toStrictEqual(null);
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    const {data, error} = await store.dispatch(AppPrivKey.generate());
    expect(error).toBeUndefined();
    const {privkey, backupGPG, backupClear} = data;
    expect(backupGPG.error).not.toBeUndefined();
    expect(backupGPG.data).toBeUndefined();

    expect(store.getActions()).toMatchObject([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: {privkey, pubkey: await privkey.pubKey(), userID: curUserID},
        },
    ]);
});

test('privkey/generateWithGPG', async () => {
    const store = testConfigureStore(await getStoreInit());

    initOpenGPG();
    const {privateKeyArmored, publicKeyArmored, revocationCertificate} = await generateGPGKey();

    const fakeGPGServ = 'https://localhost:1111';

    jest.spyOn(Client4, 'getUser').mockImplementation(async (userID) => {
        expect(userID).toStrictEqual(curUserID);
        return {email: 'roger@test.com'};
    });

    jest.spyOn(APIClient, 'getGPGKeyServer').
        mockImplementation(async () => {
            return fakeGPGServ;
        });

    const indexes = `
pub:79885E33920840DA65EEE2013F3519E42C47C59D:1:2048:1567427747::
`;
    jest.spyOn(HKP.prototype, 'doGet').mockImplementation(async (url) => {
        if (url === fakeGPGServ + '/pks/lookup?op=index&options=mr&search=roger%40test.com') {
            return indexes;
        }
        if (url === fakeGPGServ + '/pks/lookup?op=get&options=mr&search=0x79885E33920840DA65EEE2013F3519E42C47C59D') {
            return publicKeyArmored;
        }
        throw new ClientError(Client4.url, {
            message: '',
            status_code: 404,
            url});
    });

    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(typeof backupGPG).toBe('string');
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    window.confirm = jest.fn().mockImplementation(() => true);

    const {data, error} = await store.dispatch(AppPrivKey.generate());
    expect(error).toBeUndefined();
    const {privkey, backupGPG, backupClear} = data;
    expect(typeof backupGPG.data).toBe('string');
    expect(backupGPG.error).toBeUndefined();

    expect(store.getActions()).toMatchObject([
        {
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: {privkey, pubkey: await privkey.pubKey(), userID: 'myuserID'},
        },
    ]);
    expect(window.confirm).toHaveBeenCalled();

    finiOpenGPG();
});

test('privkey/generateWithGPGNoKeys', async () => {
    const store = testConfigureStore(await getStoreInit());

    const userEmail = 'roger@test.com';
    jest.spyOn(Client4, 'getUser').mockImplementation(async (userID) => {
        expect(userID).toStrictEqual(curUserID);
        return {email: userEmail};
    });
    jest.spyOn(HKP.prototype, 'index').mockImplementation(async (query) => {
        expect(query).toStrictEqual(userEmail);
        return [];
    });

    jest.spyOn(APIClient, 'pushPubKey').
        mockImplementation(async (pubKey, backupGPG) => {
            expect(backupGPG).toStrictEqual(null);
            expect(pubKey).toBeInstanceOf(PublicKeyMaterial);
        });

    const {data, error} = await store.dispatch(AppPrivKey.generate());
    expect(error).toBeUndefined();
    const {privkey, backupGPG, backupClear} = data;
    expect(backupGPG.data).toBeUndefined();
    expect(backupGPG.error).toStrictEqual('no valid key found');

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
            data: {privkey: privkeyImp, pubkey: privkeyImp.pubKey(), userID: curUserID},
        },
    ]);
});

test('privkey/importDifferent', async () => {
    const store = testConfigureStore(await getStoreInit());

    const oldprivkey = await PrivateKeyMaterial.create(true /* extractible */);
    const privkey = await PrivateKeyMaterial.create(true /* extractible */);

    jest.spyOn(APIClient, 'getPubKeysDebounced').
        mockImplementation(async (userIds) => {
            expect(userIds).toStrictEqual([curUserID]);
            return new Map([[curUserID, oldprivkey.pubKey()]]);
        });

    const backup = await gpgBackupFormat(privkey);
    const {data, error} = await store.dispatch(AppPrivKey.import(backup, false));
    expect(error).toBeInstanceOf(AppPrivKeyIsDifferent);
});
