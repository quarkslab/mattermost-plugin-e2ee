import {ActionFunc, DispatchFunc, GetStateFunc, ActionResult} from 'mattermost-redux/types/actions';
import {PostTypes} from 'mattermost-redux/action_types';

import {PubKeyTypes, EncrStatutTypes} from './action_types';
import APIClient from './client';
import {StateID} from './constants';
import {PublicKeyMaterial} from './e2ee';
import manifest from './manifest';

const CACHE_PUBKEY_TIMEOUT = 5 * 1000; // 5s

export function getPubKeys(userIds: string[]): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc): Promise<ActionResult> => {
        // Find if we have suitable ones in cache
        let ret = new Map<string, PublicKeyMaterial>();
        const setIds = new Set(userIds);

        // AG: we can extend GlobalState to add the plugin's state. Let's
        // ignore the typescrypt error here!
        // @ts-ignore
        const state_pubkeys = getState()[StateID].pubkeys || null;
        const now = Date.now();
        for (const userId of userIds) {
            const cached = state_pubkeys.get(userId) || null;
            if (cached == null) {
                continue;
            }
            if ((now - cached.lastUpdate) <= CACHE_PUBKEY_TIMEOUT) {
                ret.set(userId, cached.data);
                setIds.delete(userId);
            }
        }
        if (setIds.size > 0) {
            try {
                const apires = await APIClient.getPubKeys(Array.from(setIds));
                ret = new Map<string, PublicKeyMaterial>([...ret, ...apires]);
            } catch (error) {
                return {error};
            }
        }
        dispatch(
            {
                type: PubKeyTypes.RECEIVED_PUBKEYS,
                data: ret,
            });
        return {data: ret};
    };
}

export function getChannelEncryptionMethod(chanID: string): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        // @ts-ignore
        const method = getState()[StateID].chansEncrMethod.get(chanID) || null;
        if (method != null) {
            return {data: method};
        }

        try {
            const apimethod = await APIClient.getChannelEncryptionMethod(chanID);
            dispatch({
                type: EncrStatutTypes.RECEIVED_ENCRYPTION_STATUS,
                data: {chanID, method: apimethod},
            });
            return {data: apimethod};
        } catch (error) {
            return {error};
        }
    };
}

// From mattermost-plugin-anonymous
export function sendEphemeralPost(message: string, channelId: string) {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const timestamp = Date.now();
        const post = {
            id: manifest.id + Date.now(),
            user_id: getState().entities.users.currentUserId,
            channel_id: channelId,
            message,
            type: 'system_ephemeral',
            create_at: timestamp,
            update_at: timestamp,
            root_id: '',
            parent_id: '',
            props: {},
        };

        dispatch({
            type: PostTypes.RECEIVED_NEW_POST,
            data: post,
            channelId,
        });
    };
}
