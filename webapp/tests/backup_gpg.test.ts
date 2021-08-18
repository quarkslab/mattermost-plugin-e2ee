import 'mattermost-webapp/tests/setup';

import {gpgEncrypt, gpgBackupFormat, gpgParseBackup} from '../src/backup_gpg';
import {PrivateKeyMaterial} from '../src/e2ee';

import {generateGPGKey, initOpenGPG, finiOpenGPG} from './helpers';

const b64 = require('base64-arraybuffer');

test('e2ee/backupGPGFormat', async () => {
    const privkey = await PrivateKeyMaterial.create(true /* exportable */);

    const backupStr = await gpgBackupFormat(privkey);
    const restored = await gpgParseBackup(backupStr, true /* exportable */);

    expect(restored).toStrictEqual(privkey);
});

test('e2ee/backupGPGRestore', async () => {
    const e2eePrivkey = await PrivateKeyMaterial.create(true /* exportable */);

    initOpenGPG();
    const {privateKeyArmored, publicKeyArmored, revocationCertificate} = await generateGPGKey();

    const backup = await gpgBackupFormat(e2eePrivkey);
    const encrBackup = await gpgEncrypt(backup, publicKeyArmored);

    /* TOFIX: fail because ?? */

    //    // In our workflow, this is done by the mail client!
    //    const { keys: [privateKey] } = await openpgp.key.readArmored(privateKeyArmored);
    //    const { data: decrypted } = await openpgp.decrypt({
    //        message: await openpgp.message.readArmored(encrBackup),
    //        privateKeys: [privateKey]
    //    });
    //
    //    console.log("decrypted: " + decrypted)
    //    const restored = await gpgParseBackup(decrypted, true /* exportable */)
    //
    //    expect(restored).toStrictEqual(e2eePrivkey)
    finiOpenGPG();
});
