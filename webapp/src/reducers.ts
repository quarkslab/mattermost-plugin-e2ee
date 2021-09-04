import {combineReducers} from 'redux';
import {RelationOneToOne} from 'mattermost-redux/types/utilities';
import {GenericAction} from 'mattermost-redux/types/actions';
import {ChannelTypes} from 'mattermost-redux/action_types';

import {PrivateKeyMaterial, PublicKeyMaterial} from './e2ee';
import {KeyStore} from './keystore';
import {PubKeyTypes, PrivKeyTypes, EncrStatutTypes, EventTypes, ImportModalTypes, KSTypes} from './action_types';
import {PubKeysState, ChansEncrState, ImportModalState} from './types';

function pubkeys(state: PubKeysState = new Map(), action: GenericAction) {
    switch (action.type) {
    case PubKeyTypes.RECEIVED_PUBKEYS: {
        const nextState = new Map([...state]);
        for (const [userId, pubkey] of action.data) {
            nextState.set(userId, {data: pubkey});
        }
        return nextState;
    }
    case PrivKeyTypes.GOT_PRIVKEY: {
        const nextState = new Map([...state]);
        nextState.set(action.data.userID, {data: action.data.pubkey});
        return nextState;
    }
    case EventTypes.GOT_RECONNECTED: {
        // If we have been reconnected, clear all known statuses. Indeed, we
        // could have missed some websockets events.
        return new Map();
    }
    case PubKeyTypes.PUBKEY_CHANGED: {
        const nextState = new Map([...state]);
        nextState.delete(action.data);
        return nextState;
    }
    default:
        return state;
    }
}

function privkey(state: PrivateKeyMaterial | null = null, action: GenericAction) {
    switch (action.type) {
    case PrivKeyTypes.GOT_PRIVKEY:
        return action.data.privkey;
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

function importModal(state: ImportModalState = {visible: false}, action: GenericAction) {
    switch (action.type) {
    case ImportModalTypes.IMPORT_MODAL_OPEN: {
        return {visible: true};
    }
    case ImportModalTypes.IMPORT_MODAL_CLOSE: {
        return {visible: false};
    }
    default:
        return state;
    }
}

function ks(state: KeyStore | null = null, action: GenericAction) {
    switch (action.type) {
    case KSTypes.GOT_KS: {
        return action.data;
    }
    default:
        return state;
    }
}

export default combineReducers({
    pubkeys,
    privkey,
    chansEncrMethod,
    importModal,
    ks,
});
