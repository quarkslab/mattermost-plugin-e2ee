import {Store, Action} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Post} from 'mattermost-redux/types/posts';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import {makeGetProfilesInChannel} from 'mattermost-redux/selectors/entities/users';
import {Client4} from 'mattermost-redux/client';

import * as UserActions from 'mattermost-redux/actions/users';

// eslint-disable-next-line import/no-unresolved

import APIClient from './client';
import manifest from './manifest';
import {getServerRoute, selectPubkeys, selectPrivkey, selectKS} from './selectors';
import {EncrStatutTypes, EventTypes, PubKeyTypes} from './action_types';
import {getPubKeys, getChannelEncryptionMethod, sendEphemeralPost, openImportModal} from './actions';
import Reducer from './reducers';
import {E2EE_POST_TYPE, E2EE_CHAN_ENCR_METHOD_NONE, E2EE_CHAN_ENCR_METHOD_P2P} from './constants';
import E2EEPost from './components/e2ee_post';
import {PublicKeyMaterial} from './e2ee';
import {encryptPost} from './e2ee_post';
import {AppPrivKey, AppPrivKeyIsDifferent} from './privkey';
// eslint-disable-next-line import/no-unresolved
import {PluginRegistry, ContextArgs} from './types/mattermost-webapp';
import {MyActionResult, PubKeysState} from './types';
import {observeStore} from './utils';
import {pubkeyStore} from './pubkeys_storage';
import {KeyStore} from './keystore';
import E2EEImportModal from './components/e2ee_import_modal';

const b64 = require('base64-arraybuffer');

export default class Plugin {
    store?: Store

    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        this.store = store;

        registry.registerRootComponent(E2EEImportModal);
        registry.registerReducer(Reducer);
        registry.registerMessageWillBePostedHook(this.messageWillBePosted.bind(this));
        registry.registerSlashCommandWillBePostedHook(this.slashCommand.bind(this));
        registry.registerPostTypeComponent(E2EE_POST_TYPE, E2EEPost);
        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_channelStateChanged', this.channelStateChanged.bind(this));
        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_newPubkey', this.onNewPubKey.bind(this));
        registry.registerReconnectHandler(this.onReconnect.bind(this));

        APIClient.setServerRoute(getServerRoute(store.getState()));

        observeStore(this.store, selectPubkeys, this.checkPubkeys.bind(this));

        // @ts-ignore
        await store.dispatch(AppPrivKey.init(store));
    }

    private async checkPubkeys(store: Store, pubkeys: PubKeysState) {
        for (const [userID, pubkey] of pubkeys) {
            if (pubkey.data === null) {
                continue;
            }
            // eslint-disable-next-line no-await-in-loop
            if ((await pubkeyStore(userID, pubkey.data))) {
                const chanID = getCurrentChannelId(store.getState());
                // eslint-disable-next-line no-await-in-loop
                const username = (await Client4.getUser(userID)).username;
                const msg = '**Warning**: public key of @' + username + ' has changed.';
                this.sendEphemeralPost(msg, chanID);
            }
        }
    }

    private async channelStateChanged(message: any) {
        await this.dispatch({
            type: EncrStatutTypes.RECEIVED_ENCRYPTION_STATUS,
            data: {chanID: message.data.chanID, method: message.data.method},
        });
    }

    private async onNewPubKey(message: any) {
        await this.dispatch({
            type: PubKeyTypes.PUBKEY_CHANGED,
            data: message.data.userID,
        });
    }

    private async onReconnect() {
        // Dispatch that we have been reconnected
        this.dispatch({
            type: EventTypes.GOT_RECONNECTED,
            data: {},
        });
    }

    private async handleInit(cmdArgs: Array<string>, ctxArgs: ContextArgs) {
        let msg;
        const force = cmdArgs[0] === '--force';
        const keyInBrowser = AppPrivKey.exists(this.store!.getState());
        const pubKeyRegistered = (await this.dispatch(AppPrivKey.getUserPubkey())) !== null;
        if (!force && keyInBrowser) {
            msg = 'A private key is already present in your browser, so we are not overriding it. Use --force to erase it.';
        } else if (!force && pubKeyRegistered) {
            msg = "A key is already known for your user to the Mattermost server. You can import its backup using /e2ee import.\nYou can use --force to still generate a new key, but you won't be able to read old encrypted messages, and other users won't be able to read your old messages.";
        } else {
            const {data} = await this.dispatch(AppPrivKey.generate());
            const {privkey, backupGPG, backupClear} = data;

            // Push the public key and backup to the server
            msg = 'A new private key has been generated. ';
            if (backupGPG === null) {
                msg += "Unfortunately, we didn't manage to encrypt it with your GPG key.";
            } else {
                msg += 'You should have received a GPG encrypted backup by mail.';
            }
            msg += '\n\nHere is also a clear text backup of your private key. You can store this in a secure storage, like KeePass:\n```\n';
            msg += backupClear;
            msg += '```\n\n\n**WARNING**: it will not be possible to easily recover this private key once this message disappear. Make sure you have a working backup!';
        }
        this.sendEphemeralPost(msg, ctxArgs.channel_id);
        return {};
    }

    private async setChannelEncryptionMethod(chanID: string, method: string) {
        await APIClient.setChannelEncryptionMethod(chanID, method);
        this.setLastEncryptionMethodForChannel(chanID, method);
    }

    private getLastEncryptionMethodForChannel(chanID: string) {
        const ret = localStorage.getItem('chanEncrMeth:' + chanID);
        if (ret === null) {
            return E2EE_CHAN_ENCR_METHOD_NONE;
        }
        return ret;
    }

    private setLastEncryptionMethodForChannel(chanID: string, method: string) {
        localStorage.setItem('chanEncrMeth:' + chanID, method);
    }

    private async slashCommand(message: string, ctxArgs: ContextArgs) {
        const args = message.split((/(\s+)/)).filter((e) => e.trim().length > 0);
        if (args[0] !== '/e2ee' || args.length <= 1) {
            return {message, args: ctxArgs};
        }
        const cmd = args[1];
        const cmdArgs = args.splice(2);
        const chanID = ctxArgs.channel_id;
        switch (cmd) {
        case 'init':
            return this.handleInit(cmdArgs, ctxArgs);

            // TODO: move these two are pure slash commands
        case 'activate': {
            await this.setChannelEncryptionMethod(chanID, E2EE_CHAN_ENCR_METHOD_P2P);
            return {};
        }
        case 'deactivate': {
            await this.setChannelEncryptionMethod(chanID, E2EE_CHAN_ENCR_METHOD_NONE);
            return {};
        }
        case 'import': {
            // @ts-ignore
            await this.dispatch(openImportModal());
            return {};
        }
        }
        return {message, args: ctxArgs};
    }

    private sendEphemeralPost(msg: string, chanID: string) {
        // @ts-ignore
        this.dispatch(sendEphemeralPost(msg, chanID));
    }

    private async getUserIdsInChannel(chanID: string): Promise<MyActionResult> {
        // @ts-ignore
        const {data, error} = await this.dispatch(UserActions.getProfilesInChannel(chanID, 0));
        if (error) {
            return {error};
        }
        return {data: data.map((v: any) => v.id)};
    }

    private async messageWillBePosted(post: Post): Promise<{post: Post} | {error: {message: string}}> {
        const {data: users, error: errUsers} = await this.getUserIdsInChannel(post.channel_id);
        if (errUsers) {
            return {error: {message: 'Unable to get the list of users in this channel: ' + errUsers}};
        }

        const chanID = post.channel_id;
        const lastMethod = this.getLastEncryptionMethodForChannel(chanID);

        // @ts-ignore
        const {data: method, error: errEM} = await this.dispatch(getChannelEncryptionMethod(chanID));
        if (errEM) {
            return {error: {message: 'Unable to get channel encryption status: ' + errEM}};
        }

        // Warn the user if, for this channel, the last message sent was
        // encrypted and it will not be anymore!
        if (lastMethod !== E2EE_CHAN_ENCR_METHOD_NONE && method === E2EE_CHAN_ENCR_METHOD_NONE) {
            // Waiting for a better UX...
            /* eslint-disable no-alert */
            if (!confirm('The last message you sent to this channel was encrypted, but encryption is disabled now. Do you still want to send your message in clear form?')) {
                return {error: {message: 'message discarded by the user'}};
            }
        }

        this.setLastEncryptionMethodForChannel(chanID, method);
        if (method === 'p2p') {
            // @ts-ignore
            const {data: pubkeys, error: errPK} = await this.dispatch(getPubKeys(users));
            if (errPK) {
                return {error: {message: 'Unable to get the public keys of the channel members: ' + errPK}};
            }
            if (pubkeys.length === 0) {
                return {error: {message: 'Noone in this channel has a public key to encrypt for!'}};
            }

            const key = selectPrivkey(this.store!.getState());
            if (key === null) {
                return {error: {message: "Channel is encrypted but you didn't setup your E2EE key yet. Please run /e2ee init"}};
            }
            await encryptPost(post, key, pubkeys.values());
        }

        return {post};
    }

    private async dispatch(arg: any) {
        return this.store!.dispatch(arg);
    }
}

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin());
