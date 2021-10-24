import {UserProfile} from 'mattermost-redux/types/users';
import {Post} from 'mattermost-redux/types/posts';

import {isMacApp} from 'user_agent';

// regular expression from mattermost-server/app/command.go. Replace :alnum: by
// [A-Za-z0-9]. /g is necessary to be able to match all mentions.
const atMentionRegexp = /\B@([A-Za-z0-9][A-Za-z0-9\\.\-_:]*)(\s|$)/g;

export function shouldNotify(msg: string, user: UserProfile) {
    const notify_props = user.notify_props;

    const mentionChannel = notify_props.channel === 'true';
    const username = user.username;
    const mentions = msg.matchAll(atMentionRegexp);
    for (const m of mentions) {
        const name = m[1];
        if (name === 'all' || name === 'channel') {
            return mentionChannel;
        }
        if (name === 'here') {
            return mentionChannel && notify_props.push_status === 'online';
        }
        if (m[1] === username) {
            return true;
        }
    }

    // See
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#comparing_strings
    // as to why toUpperCase is used (and not toLowerCase).
    const mention_keys = new Set();
    for (const m of notify_props.mention_keys.split(',')) {
        const s = m.trim();
        if (s.length > 0) {
            mention_keys.add(s.toUpperCase());
        }
    }

    // First name check is case **sensitive**
    const check_fn = notify_props.first_name === 'true';
    if (mention_keys.size === 0 && !check_fn) {
        return false;
    }

    const words = msg.split(/\s+/);
    for (const w of words) {
        if (mention_keys.has(w.toUpperCase())) {
            return true;
        }
        if (check_fn && w === user.first_name) {
            return true;
        }
    }
    return false;
}

// Adapted from mattermost-webapp/utils/notifications.tsx
let requestedNotificationPermission = false;

// showNotification displays a platform notification with the configured parameters.
//
// If successful in showing a notification, it resolves with a callback to manually close the
// notification. If no error occurred but the user did not grant permission to show notifications, it
// resolves with a no-op callback. Notifications that do not require interaction will be closed automatically after
// the Constants.DEFAULT_NOTIFICATION_DURATION. Not all platforms support all features, and may
// choose different semantics for the notifications.

export interface ShowNotificationParams {
    title: string;
    body: string;
    requireInteraction: boolean;
    silent: boolean;
    onClick?: (this: Notification, e: Event) => any | null;
}

export async function showNotification(
    {
        title,
        body,
        requireInteraction,
        silent,
        onClick,
    }: ShowNotificationParams = {
        title: '',
        body: '',
        requireInteraction: false,
        silent: false,
    },
) {
    if (!('Notification' in window)) {
        throw new Error('Notification not supported');
    }

    if (typeof Notification.requestPermission !== 'function') {
        throw new Error('Notification.requestPermission not supported');
    }

    if (Notification.permission !== 'granted' && requestedNotificationPermission) {
        // User didn't allow notifications
        // eslint-disable no-empty-function
        return () => { /* do nothing */ };
    }

    requestedNotificationPermission = true;

    let permission = await Notification.requestPermission();
    if (typeof permission === 'undefined') {
        // Handle browsers that don't support the promise-based syntax.
        permission = await new Promise((resolve) => {
            Notification.requestPermission(resolve);
        });
    }

    if (permission !== 'granted') {
        // User has denied notification for the site
        return () => { /* do nothing */ };
    }

    const notification = new Notification(title, {
        body,
        tag: body,
        requireInteraction,
        silent,
    });

    if (onClick) {
        notification.onclick = onClick;
    }

    notification.onerror = () => {
        throw new Error('Notification failed to show.');
    };

    // Mac desktop app notification dismissal is handled by the OS
    if (!requireInteraction && !isMacApp()) {
        setTimeout(() => {
            notification.close();
        }, 5000 /* Constants.DEFAULT_NOTIFICATION_DURATION */);
    }

    return () => {
        notification.close();
    };
}
