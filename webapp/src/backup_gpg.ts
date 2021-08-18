import * as openpgp from 'openpgp';

import {PrivateKeyMaterial} from './e2ee';

const b64 = require('base64-arraybuffer');

export async function gpgBackupFormat(privKey: PrivateKeyMaterial): Promise<string> {
    const data = JSON.stringify(await privKey.jsonable(true /* tob64 */));
    return b64.encode(new TextEncoder().encode(data));
}

export async function gpgParseBackup(backup: string, exportable: boolean): Promise<PrivateKeyMaterial> {
    const data = JSON.parse(new TextDecoder().decode(b64.decode(backup)));
    return PrivateKeyMaterial.fromJsonable(data, true /* fromb64 */, exportable);
}

export async function gpgEncrypt(data: string, gpgPubKeyArmored: string): Promise<string> {
    const keys = (await openpgp.key.readArmored(gpgPubKeyArmored)).keys;
    const {data: encrypted} = await openpgp.encrypt({
        message: await openpgp.message.fromText(data),
        publicKeys: keys,
    });
    return encrypted;
}
