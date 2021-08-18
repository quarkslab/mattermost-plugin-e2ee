/* eslint-disable global-require */

import * as openpgp from 'openpgp';

// Don't ask me why
// https://github.com/openpgpjs/openpgpjs/issues/1036#issuecomment-644188981
const oldTextEncoder = global.TextEncoder;
const oldTextDecoder = global.TextDecoder;

export async function initOpenGPG() {
    const textEncoding = require('text-encoding-utf-8');
    global.TextEncoder = textEncoding.TextEncoder;
    global.TextDecoder = textEncoding.TextDecoder;
}

export async function finiOpenGPG() {
    global.TextEncoder = oldTextEncoder;
    global.TextDecoder = oldTextDecoder;
}

export async function generateGPGKey() {
    return openpgp.generateKey({
        userIds: [{name: 'Jon Smith', email: 'jon@example.com'}],
        curve: 'ed25519',
    });
}
