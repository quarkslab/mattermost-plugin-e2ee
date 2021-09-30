import React from 'react';
import {Store} from 'redux';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import {Post} from 'mattermost-redux/types/posts';
import {Channel} from 'mattermost-redux/types/channels';
import {Client4} from 'mattermost-redux/client';
import * as UserActions from 'mattermost-redux/actions/users';

import Icon from './components/icon';
import {getPubKeys, getChannelEncryptionMethod, sendEphemeralPost, openImportModal} from './actions';
import {EncrStatutTypes, EventTypes, PubKeyTypes} from './action_types';
import {APIClient, GPGBackupDisabledError} from './client';
import {E2EE_CHAN_ENCR_METHOD_NONE, E2EE_CHAN_ENCR_METHOD_P2P} from './constants';
// eslint-disable-next-line import/no-unresolved
import {PluginRegistry, ContextArgs} from './types/mattermost-webapp';
import {selectPubkeys, selectPrivkey, selectKS} from './selectors';
import {msgCache} from './msg_cache';
import {AppPrivKey} from './privkey';
import {encryptPost} from './e2ee_post';
import {observeStore} from './utils';
import {MyActionResult, PubKeysState} from './types';
import {pubkeyStore} from './pubkeys_storage';

export default class E2EEHooks {
    store: Store

    constructor(store: Store) {
        this.store = store;

        observeStore(store, selectPubkeys, this.checkPubkeys.bind(this));
        observeStore(store, selectPrivkey, async (s: any, v: any) => {
            msgCache.clear();
        });
        observeStore(store, getCurrentUserId, async (s: any, v: any) => {
            msgCache.clear();

            // @ts-ignore
            await store.dispatch(AppPrivKey.init(store));
        });
    }

    register(registry: PluginRegistry) {
        registry.registerMessageWillBePostedHook(this.messageWillBePosted.bind(this));
        registry.registerSlashCommandWillBePostedHook(this.slashCommand.bind(this));

        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_channelStateChanged', this.channelStateChanged.bind(this));
        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_newPubkey', this.onNewPubKey.bind(this));
        registry.registerReconnectHandler(this.onReconnect.bind(this));

        registry.registerChannelHeaderButtonAction(
            // eslint-disable-next-line react/jsx-filename-extension
            <Icon/>,
            this.toggleEncryption.bind(this),
            'Toggle channel encryption',
            'Toggle channel encryption',
        );
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

    private async toggleEncryption(channel: Channel) {
        const chanID = channel.id;
        const {data: method, error} = await this.dispatch(getChannelEncryptionMethod(chanID));
        if (error) {
            return;
        }
        this.setChannelEncryptionMethod(chanID, method === 'none' ? 'p2p' : 'none');
    }

    private async handleInit(cmdArgs: Array<string>, ctxArgs: ContextArgs) {
        let msg;
        const force = cmdArgs[0] === '--force';
        const keyInBrowser = AppPrivKey.exists(this.store.getState());
        const {data: pubKeyRegistered} = await this.dispatch(AppPrivKey.userHasPubkey());
        if (!force && keyInBrowser) {
            msg = 'A private key is already present in your browser, so we are not overriding it. Use --force to erase it.';
        } else if (!force && pubKeyRegistered) {
            msg = "A key is already known for your user to the Mattermost server. You can import its backup using /e2ee import.\nYou can use --force to still generate a new key, but you won't be able to read old encrypted messages, and other users won't be able to read your old messages.";
        } else {
            const {data, error} = await this.dispatch(AppPrivKey.generate());
            if (error) {
                msg = 'Error while generating: ' + error;
            } else {
                const {privkey, backupGPG, backupClear} = data;

                // Push the public key and backup to the server
                msg = 'A new private key has been generated. ';
                if (backupGPG.error) {
                    if (backupGPG.error instanceof GPGBackupDisabledError) {
                        msg += "We didn't backup it because GPG backup has been disabled by your administrator.";
                    } else {
                        msg += "Unfortunately, we didn't manage to encrypt it with your GPG key: " + backupGPG.error;
                    }
                } else {
                    msg += 'You should have received a GPG encrypted backup by mail.';
                }
                msg += '\n\nHere is also a clear text backup of your private key. You can store this in a secure storage, like KeePass:\n```\n';
                msg += backupClear;
                msg += '```\n\n\n**WARNING**: it will not be possible to easily recover this private key once this message disappear. Make sure you have a working backup!';
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

        // TODO: move these two as pure slash commands
        case 'start': {
            await this.setChannelEncryptionMethod(chanID, E2EE_CHAN_ENCR_METHOD_P2P);
            return {};
        }
        case 'stop': {
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

            const key = selectPrivkey(this.store.getState());
            if (key === null) {
                return {error: {message: "Channel is encrypted but you didn't setup your E2EE key yet. Please run /e2ee init"}};
            }
            const orgMsg = post.message;
            await encryptPost(post, key, pubkeys.values());
            msgCache.addMine(post, orgMsg);
        }

        return {post};
    }

    private async dispatch(arg: any) {
        return this.store.dispatch(arg);
    }
}
