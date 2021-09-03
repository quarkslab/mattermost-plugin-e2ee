import {GlobalState} from 'mattermost-redux/types/store';

import {StateID} from './constants';
import {PrivateKeyMaterial, PublicKeyMaterial} from './e2ee';

export interface CachedPubKey {
    data: PublicKeyMaterial | null;
}

export type PubKeysState = Map<string, CachedPubKey>;
export type ChansEncrState = Map<string, string>;

export interface PluginState {
    privkey?: PrivateKeyMaterial;
    pubkeys?: PubKeysState;
    chansEncrMethod?: ChansEncrState;
}

// ActionResult, in v5, is defined as { data: any } | { error: any }, which
// makes the typescript type checker fails on code like this:
// const {data, error} = ...
// It seems to be fixed in v6. We define this type waiting for that migration.
export interface MyActionResult {
    data?: any;
    error?: any;
}
