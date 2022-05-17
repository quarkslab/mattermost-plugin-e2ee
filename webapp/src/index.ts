import React from 'react';
import {Store, Action} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {Client4} from 'mattermost-redux/client';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

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
import {setE2EEPostUpdateSupported} from './compat';

const b64 = require('base64-arraybuffer');

export default class Plugin {
    hooks?: E2EEHooks

    public async initialize(registry: PluginRegistry, store: Store<GlobalState, Action<Record<string, unknown>>>) {
        const mmconfig = getConfig(store.getState());

        // Mattermost >= 6.6 has a new way to edit widget, but it doesn't call
        // update hooks :/
        // (https://github.com/mattermost/mattermost-webapp/blob/a93fda4aa87de490e890225ae09f854d9043bcb1/components/edit_post/edit_post.tsx
        // never calls hooks).
        // Waiting for it to be fixed, let's go back to the pre-6.1 old way :(
        // Moreover, update is broken for version >= 6.4, because of
        // https://github.com/mattermost/mattermost-webapp/commit/8a925e8f95f9a8e9b81512de8203c7163c5d1eea
        let postUpdateSupported = (typeof registry.registerMessageWillBeUpdatedHook !== 'undefined');
        if (typeof mmconfig.BuildNumber !== 'undefined') {
            const version = mmconfig.BuildNumber.split('.').map((s) => parseInt(s, 10));
            const verHookNotCalled = (version[0] === 6) && (version[1] >= 6);
            postUpdateSupported = postUpdateSupported && !verHookNotCalled;
        }
        setE2EEPostUpdateSupported(postUpdateSupported);

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
