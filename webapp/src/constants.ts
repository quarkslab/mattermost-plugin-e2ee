import {id as pluginId} from 'manifest';

const E2EE_POST_TYPE = 'custom_e2ee';

// https://stackoverflow.com/questions/54334701/is-there-currently-anyway-to-concatenate-two-or-more-string-literal-types-to-a-s
/*function makePluginID<NS extends string, N extends string>(namespace: NS, name: N) {
    return namespace + '-' + name as `${NS}-${N}`;
}*/

const StateID = `plugins-${pluginId}`;

const E2EE_CHAN_ENCR_METHOD_NONE = 'none';
const E2EE_CHAN_ENCR_METHOD_P2P = 'p2p';

export {E2EE_POST_TYPE, E2EE_CHAN_ENCR_METHOD_NONE, E2EE_CHAN_ENCR_METHOD_P2P, StateID};
