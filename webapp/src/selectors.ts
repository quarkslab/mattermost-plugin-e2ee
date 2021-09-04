import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {GlobalState} from 'mattermost-redux/types/store';

import {PluginState} from './types';
import {StateID} from './constants';

import {id as pluginId} from './manifest';

export function getPluginState(state: GlobalState): PluginState {
    // @ts-ignore
    return state[StateID] || {};
}

export function isEnabled(state: GlobalState) {
    return getPluginState(state).enabled;
}

export function getServerRoute(state: GlobalState) {
    const config = getConfig(state);
    let basePath = '';
    if (config && config.SiteURL) {
        basePath = new URL(config.SiteURL).pathname;
        if (basePath && basePath[basePath.length - 1] === '/') {
            basePath = basePath.substr(0, basePath.length - 1);
        }
    }

    return basePath;
}

export function selectPubkeys(state: GlobalState) {
    return getPluginState(state).pubkeys;
}
