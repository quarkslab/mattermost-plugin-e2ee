import {connect} from 'react-redux';
import {ActionCreatorsMapObject, bindActionCreators, Dispatch} from 'redux';
import {GlobalState} from 'mattermost-redux/types/store';
import {GenericAction, ActionResult, ActionFunc} from 'mattermost-redux/types/actions';
import {Post} from 'mattermost-redux/types/posts';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getPubKeys} from 'actions';
import {id as pluginId} from 'manifest';
import {PluginState} from 'types';
import {getPluginState} from 'selectors';

import {E2EEPost} from './e2ee_post';

function mapStateToProps(state: GlobalState) {
    // @ts-ignore
    const pstate: PluginState = getPluginState(state);
    const currentUserID: string = getCurrentUserId(state);
    return {privkey: pstate.privkey, currentUserID};
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
