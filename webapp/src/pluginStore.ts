// AG: this is hacky, but I don't know how to get the store from a component
import {Store} from 'redux';

let pluginStore: Store;

export function setPluginStore(store: Store) {
    pluginStore = store;
}

export function getPluginStore() {
    return pluginStore;
}
