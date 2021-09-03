import {connect} from 'react-redux';
import {ActionCreatorsMapObject, bindActionCreators, Dispatch} from 'redux';
import {GenericAction, ActionResult, ActionFunc} from 'mattermost-redux/types/actions';
import {Post} from 'mattermost-redux/types/posts';

import {getPubKeys} from 'actions';
import {id as pluginId} from 'manifest';
import {PluginState} from 'types';
import {StateID} from '../../constants';

import {E2EEPost} from './e2ee_post';

function mapStateToProps(state: any) {
    // @ts-ignore
    const pstate: PluginState = state[StateID];
    return {privkey: pstate.privkey};
}

type Actions = {
    getPubKeys: (pubkeys: string[]) => Promise<ActionResult>;
};

function mapDispatchToProps(dispatch: Dispatch<GenericAction>) {
    return {
        actions: bindActionCreators<ActionCreatorsMapObject<ActionFunc>, Actions>({getPubKeys}, dispatch),
    };
}

export type E2EEPostProps = ReturnType<typeof mapStateToProps> &
ReturnType<typeof mapDispatchToProps> & {
    post: Post;
};

export default connect(mapStateToProps, mapDispatchToProps)(E2EEPost);
