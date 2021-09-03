import {Store, Action} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Post} from 'mattermost-redux/types/posts';
import {getMembersInChannel} from 'mattermost-redux/selectors/entities/common';
import {makeGetProfilesInChannel} from 'mattermost-redux/selectors/entities/users';

import * as UserActions from 'mattermost-redux/actions/users';

// eslint-disable-next-line import/no-unresolved

import APIClient from './client';
import manifest from './manifest';
import {getServerRoute} from './selectors';
import {EncrStatutTypes, EventTypes, PubKeyTypes} from './action_types';
import {getPubKeys, getChannelEncryptionMethod, sendEphemeralPost} from './actions';
import Reducer from './reducers';
import {E2EE_POST_TYPE, E2EE_CHAN_ENCR_METHOD_NONE, E2EE_CHAN_ENCR_METHOD_P2P} from './constants';
import E2EEPost from './components/e2ee_post';
import {PublicKeyMaterial} from './e2ee';
import {encryptPost} from './e2ee_post';
import {AppPrivKey, AppPrivKeyIsDifferent} from './privkey';
// eslint-disable-next-line import/no-unresolved
import {PluginRegistry, ContextArgs} from './types/mattermost-webapp';
import {MyActionResult} from './types';

const b64 = require('base64-arraybuffer');

export default class Plugin {
    key?: AppPrivKey
    store?: Store

    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        this.store = store;
        this.key = await AppPrivKey.init(store);

        registry.registerReducer(Reducer);
        registry.registerMessageWillBePostedHook(this.messageWillBePosted.bind(this));
        registry.registerSlashCommandWillBePostedHook(this.slashCommand.bind(this));
        registry.registerPostTypeComponent(E2EE_POST_TYPE, E2EEPost);
        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_channelStateChanged', this.channelStateChanged.bind(this));
        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_newPubkey', this.onNewPubKey.bind(this));
        registry.registerReconnectHandler(this.onReconnect.bind(this));

        APIClient.setServerRoute(getServerRoute(store.getState()));

        try {
            await this.key.load();
        } catch (e) {
            if (!(e instanceof AppPrivKeyIsDifferent)) {
                throw e;
            }
        }
    }

    private async channelStateChanged(message: any) {
        await this.store!.dispatch({
            type: EncrStatutTypes.RECEIVED_ENCRYPTION_STATUS,
            data: {chanID: message.data.chanID, method: message.data.method},
        });
    }

    private async onNewPubKey(message: any) {
        await this.store!.dispatch({
            type: PubKeyTypes.PUBKEY_CHANGED,
            data: message.data.userID,
        });
    }

    private async onReconnect() {
        // Dispatch that we have been reconnected
        this.store!.dispatch({
            type: EventTypes.GOT_RECONNECTED,
            data: {},
        });
    }

    private async handleInit(cmdArgs: Array<string>, ctxArgs: ContextArgs) {
        let msg;
        const force = cmdArgs[0] === '--force';
        const keyInBrowser = this.key!.exists();
        const pubKeyRegistered = (await this.key!.getUserPubkey()) !== null;
        if (!force && keyInBrowser) {
            msg = 'A private key is already present in your browser, so we are not overriding it. Use --force to erase it.';
        } else if (!force && pubKeyRegistered) {
            msg = "A key is already known for your user to the Mattermost server. You can import its backup using /e2ee import.\nYou can use --force to still generate a new key, but you won't be able to read old encrypted messages, and other users won't be able to read your old messages.";
        } else {
            const {privkey, backupGPG} = await this.key!.generate();

            // Push the public key and backup to the server
            msg = 'A new private key has been generate. ';
            if (backupGPG === null) {
                msg += "Unfortunately, we didn't manage to encrypt it with your GPG key.";
            } else {
                msg += 'You should have received a GPG encrypted backup by mail.';
            }
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
            if (cmdArgs.length === 0) {
                return {message: '/e2ee', args: ctxArgs};
            }
            let privKey = cmdArgs[0];
            let force = false;
            if (privKey === '--force') {
                if (cmdArgs.length <= 1) {
                    return {message: '/e2ee', args: ctxArgs};
                }
                force = true;
                privKey = cmdArgs[1];
            }
            this.key!.import(privKey, force).
                then((key) => {
                    this.sendEphemeralPost('Key has been imported with success!', chanID);
                }).
                catch((e) => {
                    if (e instanceof AppPrivKeyIsDifferent) {
                        this.sendEphemeralPost('**Error**: the private key you want to import does not have the same public key as the one known by this Mattermost server. Importing a different private key would prevent you from reading old encrypted messages, and prevent other users from reading your old messages.\nIf you still want to import a different key, use /e2ee import --force', chanID);
                    } else {
                        this.sendEphemeralPost('Unable to import key: ' + e, chanID);
                    }
                });
            return {};
        }
        }
        return {message, args: ctxArgs};
    }

    private sendEphemeralPost(msg: string, chanID: string) {
        // @ts-ignore
        this.store!.dispatch(sendEphemeralPost(msg, chanID));
    }

    private async getUserIdsInChannel(chanID: string): Promise<MyActionResult> {
        // @ts-ignore
        const {data, error} = await this.store!.dispatch(UserActions.getProfilesInChannel(chanID, 0));
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
        const {data: method, error: errEM} = await this.store!.dispatch(getChannelEncryptionMethod(chanID));
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
            const {data: pubkeys, error: errPK} = await this.store.dispatch(getPubKeys(users));
            if (errPK) {
                return {error: {message: 'Unable to get the public keys of the channel members: ' + errPK}};
            }
            if (pubkeys.length === 0) {
                return {error: {message: 'Noone in this channel has a public key to encrypt for!'}};
            }

            const key = this.key!.getPrivKey();
            if (key === null) {
                return {error: {message: "Channel is encrypted but you didn't setup your E2EE key yet. Please run /e2ee init"}};
            }
            await encryptPost(post, key, pubkeys.values());
        }

        return {post};
    }
}

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin());
