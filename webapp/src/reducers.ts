import {combineReducers} from 'redux';
import {RelationOneToOne} from 'mattermost-redux/types/utilities';
import {GenericAction} from 'mattermost-redux/types/actions';
import {ChannelTypes} from 'mattermost-redux/action_types';

import {PrivateKeyMaterial, PublicKeyMaterial} from 'e2ee';

import {PubKeyTypes, PrivKeyTypes, EncrStatutTypes, EventTypes} from './action_types';
import {PubKeysState, ChansEncrState} from './types';

function pubkeys(state: PubKeysState = new Map(), action: GenericAction) {
    switch (action.type) {
    case PubKeyTypes.RECEIVED_PUBKEYS: {
        const nextState = new Map([...state]);
        for (const [userId, pubkey] of action.data) {
            if (pubkey === null) {
                nextState.delete(userId);
            } else {
                nextState.set(userId, {data: pubkey, lastUpdate: Date.now()});
            }
        }
        return nextState;
    }
    default:
        return state;
    }
}

function privkey(state: PrivateKeyMaterial | null = null, action: GenericAction) {
    switch (action.type) {
    case PrivKeyTypes.GOT_PRIVKEY:
        return action.data;
    default:
        return state;
    }
}

function chansEncrMethod(state: ChansEncrState = new Map(), action: GenericAction) {
    switch (action.type) {
    case EncrStatutTypes.RECEIVED_ENCRYPTION_STATUS: {
        const nextState = new Map([...state]);
        nextState.set(action.data.chanID, action.data.method);
        return nextState;
    }
    case EventTypes.GOT_RECONNECTED: {
        // If we have been reconnected, clear all known statuses. Indeed, we
        // could have missed some websockets events.
        return new Map();
    }
    case ChannelTypes.LEAVE_CHANNEL: {
        // If we leave a channel, remove the state, as we won't get websockets
        // events anymore.
        const nextState = new Map([...state]);
        nextState.delete(action.data.id);
        return nextState;
    }
    default:
        return state;
    }
}

export default combineReducers({
    pubkeys,
    privkey,
    chansEncrMethod,
});
