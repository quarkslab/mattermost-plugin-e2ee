// Based on mattermost-webapp/actions/notification_actions.jsx. Original
// copyright is below.
//
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getProfilesByIds} from 'mattermost-redux/actions/users';
import {getChannel, getCurrentChannel, getMyChannelMember} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId, getCurrentUser, getStatusForUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import {isChannelMuted} from 'mattermost-redux/utils/channel_utils';
import {isSystemMessage} from 'mattermost-redux/utils/post_utils';
import {displayUsername} from 'mattermost-redux/utils/user_utils';

import {showNotification} from 'notifications';

const NOTIFY_TEXT_MAX_LENGTH = 50;

export function sendDesktopNotification(post, msg) {
    return async (dispatch, getState) => {
        const state = getState();
        const currentUserId = getCurrentUserId(state);

        if (currentUserId === post.user_id) {
            return;
        }

        if (isSystemMessage(post)) {
            return;
        }

        let userFromPost = getUser(state, post.user_id);
        if (!userFromPost) {
            const missingProfileResponse = await dispatch(getProfilesByIds([post.user_id]));
            if (missingProfileResponse.data && missingProfileResponse.data.length) {
                userFromPost = missingProfileResponse.data[0];
            }
        }

        const channel = getChannel(state, post.channel_id);
        const user = getCurrentUser(state);
        const userStatus = getStatusForUserId(state, user.id);
        const member = getMyChannelMember(state, post.channel_id);

        if (!member || isChannelMuted(member) || userStatus === 'dnd' || userStatus === 'ooo') {
            return;
        }

        const config = getConfig(state);
        let username = '';
        if (post.props.override_username && config.EnablePostUsernameOverride === 'true') {
            username = post.props.override_username;
        } else if (userFromPost) {
            username = displayUsername(userFromPost, getTeammateNameDisplaySetting(state), false);
        } else {
            username = 'Someone';
        }

        let title = 'Posted';
        if (channel) {
            title = channel.display_name;
        }

        let notifyText = msg;
        if (notifyText.length > NOTIFY_TEXT_MAX_LENGTH) {
            notifyText = notifyText.substring(0, NOTIFY_TEXT_MAX_LENGTH - 1) + '...';
        }
        let body = `@${username}`;
        body += `: ${notifyText}`;

        //Play a sound if explicitly set in settings
        const sound = !user.notify_props || user.notify_props.desktop_sound === 'true';

        // Notify if you're not looking in the right channel or when
        // the window itself is not active
        const activeChannel = getCurrentChannel(state);
        const channelId = channel ? channel.id : null;
        const notify = (activeChannel && activeChannel.id !== channelId) || !state.views.browser.focused;

        if (notify) {
            showNotification({
                title,
                body,
                requireInteraction: false,
                silent: !sound,
                onClick: () => {
                    window.focus();
                },
            });
        }
    };
}
