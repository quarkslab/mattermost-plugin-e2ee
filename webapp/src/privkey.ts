import {Store, Action} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';

import {StateID} from './constants';
import {PrivateKeyMaterial, PublicKeyMaterial, pubkeyEquals} from './e2ee';
import {KeyStore, KeyStoreError} from './keystore';
import APIClient from './client';
import {PrivKeyTypes, PubKeyTypes} from './action_types';
import {gpgBackupFormat, gpgEncrypt, gpgParseBackup} from './backup_gpg';
import {getPubKeys} from './actions';

type StoreTy = Store;

export class AppPrivKeyIsDifferent extends Error { }

function getCurrentUserId(state: GlobalState) {
    return state.entities.users.currentUserId;
}

interface GeneratedKey {
    privkey: PrivateKeyMaterial;
    backupGPG: string | null;
}

export class AppPrivKey {
    store: Store
    ks: KeyStore

    constructor(store: StoreTy, ks: KeyStore) {
        this.store = store;
        this.ks = ks;
    }

    static async init(store: StoreTy): Promise<AppPrivKey> {
        const user = getCurrentUserId(store.getState());
        const ks = await KeyStore.open(user);
        return new AppPrivKey(store, ks);
    }

    async getUserPubkey(): Promise<PublicKeyMaterial | null> {
        const userId = this.getCurrentUserId();

        // @ts-ignore
        const {data: pubkeys, error} = await this.store.dispatch(getPubKeys([userId]));
        if (error) {
            throw error;
        }
        return pubkeys.get(userId) || null;
    }

    async import(backupGPG: string, force: boolean): Promise<PrivateKeyMaterial> {
        const key = await gpgParseBackup(backupGPG, false /* exportable */);
        if (!force) {
            await this.checkPrivKey(key);
        }
        await this.setPrivKey(key, true /* store */, backupGPG);
        return key;
    }

    async load() {
        try {
            const key = await PrivateKeyMaterial.load(this.ks, this.getCurrentUserId());
            await this.checkPrivKey(key);
            await this.setPrivKey(key, false /* store */, null);
            return key;
        } catch (e) {
            if (e instanceof KeyStoreError) {
                return null;
            }
            throw e;
        }
    }

    private async checkPrivKey(key: PrivateKeyMaterial) {
        const curpubkey = await this.getUserPubkey();
        if (curpubkey !== null &&
            (!(await pubkeyEquals(await key.pubKey(), curpubkey)))) {
            throw new AppPrivKeyIsDifferent();
        }
    }

    async generate(): Promise<GeneratedKey> {
        const gpgArmoredPubKey = await APIClient.getGPGPubKey().catch((e) => {
            return null;
        });
        let privkey: PrivateKeyMaterial;
        let backupGPG = null;
        if (typeof gpgArmoredPubKey == 'undefined' || gpgArmoredPubKey === null) {
            privkey = await PrivateKeyMaterial.create();
        } else {
            // Create a key and save a GPG encrypted backup
            privkey = await PrivateKeyMaterial.create(true /* extractible */);
            const backup_clear = await gpgBackupFormat(privkey);
            backupGPG = await gpgEncrypt(backup_clear, gpgArmoredPubKey);

            //new TextDecoder('utf-8').decode(gpgArmoredPubKey));

            // Reimport the key as non extractible
            privkey = await gpgParseBackup(backup_clear, false /* extractible */);
        }

        await this.setPrivKey(privkey, true /* store */, backupGPG);
        return {privkey, backupGPG};
    }

    exists() {
        return this.getPrivKey() !== null;
    }

    getPrivKey() {
        return this.getState()[StateID].privkey || null;
    }

    private async setPrivKey(key: PrivateKeyMaterial, store: boolean, backupGPG: string | null) {
        await key.save(this.ks, this.getCurrentUserId(), true);
        if (store) {
            await APIClient.pushPubKey(key.pubKey(), backupGPG);
        }
        await this.store.dispatch({
            type: PrivKeyTypes.GOT_PRIVKEY,
            data: key,
        });
        await this.store.dispatch({
            type: PubKeyTypes.RECEIVED_PUBKEYS,
            data: new Map([[this.getCurrentUserId(), key.pubKey()]]),
        });
    }

    private getCurrentUserId() {
        return getCurrentUserId(this.getState());
    }

    private getState() {
        return this.store.getState();
    }
}
