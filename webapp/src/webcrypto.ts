/* eslint-disable global-require */

import {isNode} from './utils';

let webcrypto: Crypto;

if (isNode) {
    const WebCrypto = require('node-webcrypto-ossl');
    webcrypto = new WebCrypto.Crypto();
} else {
    webcrypto = window.crypto;
}

export {webcrypto};
