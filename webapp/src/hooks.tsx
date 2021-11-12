import React from 'react';
import {Store} from 'redux';
import {getCurrentUser, getCurrentUserId, makeGetProfilesInChannel, getUser} from 'mattermost-redux/selectors/entities/users';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {Post} from 'mattermost-redux/types/posts';
import {Channel} from 'mattermost-redux/types/channels';
import {UserProfile} from 'mattermost-redux/types/users';
import {Client4} from 'mattermost-redux/client';
import * as UserActions from 'mattermost-redux/actions/users';

import Icon from './components/icon';
import {getPubKeys, getChannelEncryptionMethod, sendEphemeralPost, openImportModal} from './actions';
import {EncrStatutTypes, EventTypes, PubKeyTypes} from './action_types';
import {APIClient, GPGBackupDisabledError} from './client';
import {E2EE_CHAN_ENCR_METHOD_NONE, E2EE_CHAN_ENCR_METHOD_P2P, E2EE_POST_TYPE} from './constants';
// eslint-disable-next-line import/no-unresolved
import {PluginRegistry, ContextArgs} from './types/mattermost-webapp';
import {selectPubkeys, selectPrivkey, selectKS} from './selectors';
import {msgCache} from './msg_cache';
import {AppPrivKey} from './privkey';
import {encryptPost, decryptPost} from './e2ee_post';
import {PublicKeyMaterial} from './e2ee';
import {observeStore, isValidUsername} from './utils';
import {MyActionResult, PubKeysState} from './types';
import {pubkeyStore, getNewChannelPubkeys, storeChannelPubkeys} from './pubkeys_storage';
import {getE2EEPostUpdateSupported} from './compat';
import {shouldNotify} from './notifications';
import {sendDesktopNotification} from './notification_actions';

export default class E2EEHooks {
    store: Store
    getProfilesInChannel: ReturnType<typeof makeGetProfilesInChannel>

    constructor(store: Store) {
        this.store = store;
        this.getProfilesInChannel = makeGetProfilesInChannel();

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
        if (getE2EEPostUpdateSupported()) {
            registry.registerMessageWillBeUpdatedHook(this.messageWillBeUpdated.bind(this));
        }
        registry.registerSlashCommandWillBePostedHook(this.slashCommand.bind(this));

        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_channelStateChanged', this.channelStateChanged.bind(this));
        registry.registerWebSocketEventHandler('custom_com.quarkslab.e2ee_newPubkey', this.onNewPubKey.bind(this));
        registry.registerWebSocketEventHandler('posted', this.onPosted.bind(this));
        registry.registerReconnectHandler(this.onReconnect.bind(this));

        registry.registerChannelHeaderButtonAction(
            // eslint-disable-next-line react/jsx-filename-extension
            <Icon/>,
            this.toggleEncryption.bind(this),
            'Toggle channel encryption',
            'Toggle channel encryption',
        );
    }

    private async onPosted(message: any) {
        // Decrypt message and parse notifications, if asking for it.
        const curUser = getCurrentUser(this.store.getState());
        if (curUser.notify_props.desktop === 'none') {
            return;
        }
        try {
            const post = JSON.parse(message.data.post);
            if (post.type !== E2EE_POST_TYPE) {
                return;
            }
            const state = this.store.getState();
            const channel = getChannel(state, post.channel_id);
            if (channel.type === 'D' || channel.type === 'G') {
                // The mattermost system already sends a notification (but w/o
                // the decrypted message. Nothing we can do about it for now as
                // this callback is called **after** this notification happens).
                return;
            }
            const privkey = selectPrivkey(state);
            if (privkey === null) {
                return;
            }
            let decrMsg = msgCache.get(post);
            if (decrMsg === null) {
                const sender_uid = post.user_id;
                const {data, error} = await this.dispatch(getPubKeys([sender_uid]));
                if (error) {
                    throw error;
                }
                const senderkey = data.get(sender_uid) || null;
                if (senderkey === null) {
                    return;
                }
                decrMsg = await decryptPost(post.props.e2ee, senderkey, privkey);
                msgCache.addDecrypted(post, decrMsg);
            }
            if (shouldNotify(decrMsg, curUser)) {
                this.dispatch(sendDesktopNotification(post, decrMsg));
            }
        } catch (e) {
            // Ignore notification errors
        }
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
                const username = getUser(this.store.getState(), userID).username;
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
        const {data, error} = await this.dispatch(UserActions.getProfilesInChannel(chanID, 0));
        if (error) {
            return {error};
        }
        const profilesInChannel = this.getProfilesInChannel(this.store.getState(), chanID, {active: true});

        return {data: profilesInChannel.map((v: UserProfile) => v.id)};
    }

    private async encryptPost(post: Post, isUpdate = false): Promise<{post: Post} | {error: {message: string}}> {
        const chanID = post.channel_id;
        const {data: users, error: errUsers} = await this.getUserIdsInChannel(chanID);
        if (errUsers) {
            return {error: {message: 'Unable to get the list of users in this channel: ' + errUsers}};
        }

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

            const pubkeyValues: Array<PublicKeyMaterial> = Array.from(pubkeys.values());

            // Launch encryption in a promise, as in nominal operation we always need its result.
            const encryptProm = encryptPost(post, key, pubkeyValues);

            const newPubkeys = await getNewChannelPubkeys(chanID, pubkeys);
            if (newPubkeys.length > 0) {
                // Verify usernames consistency of this channel
                if (!this.verifyUsernamesInChannel(chanID)) {
                    return {error: {message: 'Inconsistency in the current channel users list. This can be due to a malicious/compromised server. Refusing to encrypt messages!'}};
                }
                let msg = 'Messages are now encrypted for these new recipients:';
                for (const [userID, _] of newPubkeys) {
                    msg += ' @' + getUser(this.store.getState(), userID).username;
                }
                this.sendEphemeralPost(msg, chanID);
            }
            await storeChannelPubkeys(chanID, pubkeyValues);

            await encryptProm;
            if (isUpdate) {
                msgCache.addUpdated(post, orgMsg);
            } else {
                msgCache.addMine(post, orgMsg);
            }
        }

        return {post};
    }

    private async messageWillBePosted(post: Post): Promise<{post: Post} | {error: {message: string}}> {
        return this.encryptPost(post);
    }

    private async messageWillBeUpdated(post: Post): Promise<{post: Post} | {error: {message: string}}> {
        if ((typeof post.props !== 'undefined') && (typeof post.props.e2ee !== 'undefined')) {
            delete post.props.e2ee;
        }
        if (post.message === '') {
            return {post};
        }
        return this.encryptPost(post, true /* isUpdate */);
    }

    private async dispatch(arg: any) {
        return this.store.dispatch(arg);
    }

    private verifyUsernamesInChannel(chanID: string): boolean {
        // Verify that the same username isn't used twice, and that none of
        // them are empty. A compromised server could do this to trick warning
        // messages.
        const users = this.getProfilesInChannel(this.store.getState(), chanID, {active: true});
        const usernames = new Set();
        for (const user of users) {
            const username = user.username;
            if (!isValidUsername(username)) {
                return false;
            }
            if (usernames.has(username)) {
                return false;
            }
            usernames.add(username);
        }
        return true;
    }
}

