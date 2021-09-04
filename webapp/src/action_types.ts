import keyMirror from 'mattermost-redux/utils/key_mirror';

const PubKeyTypes = keyMirror({
    RECEIVED_PUBKEYS: null,
    PUBKEY_CHANGED: null,
});

const PrivKeyTypes = keyMirror({
    GOT_PRIVKEY: null,
});

const KSTypes = keyMirror({
    GOT_KS: null,
});

const EncrStatutTypes = keyMirror({
    RECEIVED_ENCRYPTION_STATUS: null,
});

const EventTypes = keyMirror({
    GOT_RECONNECTED: null,
});

const ImportModalTypes = keyMirror({
    IMPORT_MODAL_OPEN: null,
    IMPORT_MODAL_CLOSE: null,
});

export {PubKeyTypes, PrivKeyTypes, EncrStatutTypes, EventTypes, ImportModalTypes, KSTypes};
