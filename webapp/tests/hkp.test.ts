import {jest} from '@jest/globals';
import 'mattermost-webapp/tests/setup';

import HKP from '../src/hkp';

test('hkp/index', async () => {
    const hkp = new HKP('https://server');
    const indexes = `
info:1:3
pub:79885E33920840DA65EEE2013F3519E42C47C59D:1:2048:1567427747::r
uid:Roger <roger@test.com>
pub:F407961CACD217A1C246F0C286B4406B454ABAC4:1:4096:1611760459:2611760459:
uid:Roger <roger@test.com>
pub:AD353BC4362B6F73870660B1F59254FCF963F61C:1:3072:1611758351::e
uid:Roger <roger@test.com>
`;

    jest.spyOn(hkp, 'doGet').mockImplementation(async (url) => {
        expect(url).toStrictEqual('https://server/pks/lookup?op=index&options=mr&search=roger%40test.com');
        return indexes;
    });

    const keys = await hkp.index('roger@test.com');
    expect(keys).toStrictEqual([
        {
            KeyID: '79885E33920840DA65EEE2013F3519E42C47C59D',
            Algo: 1,
            KeyLen: 2048,
            CreationDate: 1567427747,
            ExpirationDate: null,
            IsRevoked: true,
            IsDisabled: false,
            IsExpired: false,
        },
        {
            KeyID: 'F407961CACD217A1C246F0C286B4406B454ABAC4',
            Algo: 1,
            KeyLen: 4096,
            CreationDate: 1611760459,
            ExpirationDate: 2611760459,
            IsRevoked: false,
            IsDisabled: false,
            IsExpired: false,
        },
        {
            KeyID: 'AD353BC4362B6F73870660B1F59254FCF963F61C',
            Algo: 1,
            KeyLen: 3072,
            CreationDate: 1611758351,
            ExpirationDate: null,
            IsRevoked: false,
            IsDisabled: false,
            IsExpired: true,
        },
    ]);
});

test('hkp/index_invalid', async () => {
    const hkp = new HKP('https://server');
    const indexes = 'invalid text';

    jest.spyOn(hkp, 'doGet').mockImplementation(async (url) => {
        expect(url).toStrictEqual('https://server/pks/lookup?op=index&options=mr&search=roger%40test.com');
        return indexes;
    });

    const keys = await hkp.index('roger@test.com');
    expect(keys).toStrictEqual([]);
});
