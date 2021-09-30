import React from 'react';
import {Store, Action} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Client4} from 'mattermost-redux/client';

import manifest from './manifest';
import {APIClient} from './client';
import {getServerRoute} from './selectors';
import Reducer from './reducers';
import {E2EE_POST_TYPE} from './constants';
import E2EEPost from './components/e2ee_post';
// eslint-disable-next-line import/no-unresolved
import {PluginRegistry} from './types/mattermost-webapp';
import E2EEHooks from './hooks';
import E2EEImportModal from './components/e2ee_import_modal';

const b64 = require('base64-arraybuffer');

export default class Plugin {
    hooks?: E2EEHooks

    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        this.hooks = new E2EEHooks(store);
        this.hooks.register(registry);

        registry.registerRootComponent(E2EEImportModal);
        registry.registerReducer(Reducer);
        registry.registerPostTypeComponent(E2EE_POST_TYPE, E2EEPost);

        APIClient.setServerRoute(getServerRoute(store.getState()));
    }
}

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void
    }
}

window.registerPlugin(manifest.id, new Plugin());
