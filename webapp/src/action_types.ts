import keyMirror from 'mattermost-redux/utils/key_mirror';

const PubKeyTypes = keyMirror({
    RECEIVED_PUBKEYS: null,
});

const PrivKeyTypes = keyMirror({
    GOT_PRIVKEY: null,
});

const EncrStatutTypes = keyMirror({
    RECEIVED_ENCRYPTION_STATUS: null,
});

const EventTypes = keyMirror({
    GOT_RECONNECTED: null,
});

export {PubKeyTypes, PrivKeyTypes, EncrStatutTypes, EventTypes};
