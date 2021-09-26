import {Client4} from 'mattermost-redux/client';
import {ClientError} from 'mattermost-redux/client/client4';

interface KeyListing {
    KeyID: string
    Algo: number
    KeyLen: number
    CreationDate: number
    ExpirationDate: number | null
    IsRevoked: boolean
    IsDisabled: boolean
    IsExpired: boolean
}

// https://datatracker.ietf.org/doc/html/rfc2440#section-9.1
const ValidAlgos: Set<number> = new Set([1, 2, 3, 16, 17, 18, 19, 20, 21]);

export default class HKP {
    baseURL: string

    constructor(baseURL: string) {
        this.baseURL = baseURL;
    }

    async index(query: string): Promise<Array<KeyListing>> {
        const url = this.baseURL + '/pks/lookup?op=index&options=mr&search=' + encodeURIComponent(query);
        const data = await this.doGet(url);
        return this.parseMachineReadableIndexes(data);
    }

    async get(query: string): Promise<string> {
        const url = this.baseURL + '/pks/lookup?op=get&options=mr&search=' + encodeURIComponent(query);
        const data = await this.doGet(url);
        if (!data || data.indexOf('-----END PGP PUBLIC KEY BLOCK-----') < 0) {
            throw new Error('invalid public key format');
        }
        return data.trim();
    }

    private parseMachineReadableIndexes(data: string): Array<KeyListing> {
        const lines = data.split('\n');
        const ret: Array<KeyListing> = [];
        for (let l of lines) {
            l = l.trim();
            const fields = l.split(':');
            if (fields.length !== 7 || fields[0] !== 'pub') {
                continue;
            }
            const KeyID = fields[1];
            const Algo = parseInt(fields[2], 10);
            if (isNaN(Algo) || !ValidAlgos.has(Algo)) {
                continue;
            }
            const KeyLen = parseInt(fields[3], 10);
            const CreationDate = parseInt(fields[4], 10);
            const ExpirationDateStr = fields[5].trim();
            const ExpirationDate = ExpirationDateStr === '' ? null : parseInt(fields[5], 10);

            if (isNaN(KeyLen) || isNaN(CreationDate) || (ExpirationDate !== null && isNaN(ExpirationDate))) {
                continue;
            }

            const flags = fields[6];
            const IsRevoked = flags === 'r';
            const IsDisabled = flags === 'd';
            const IsExpired = flags === 'e';
            ret.push({KeyID, Algo, KeyLen, CreationDate, ExpirationDate, IsRevoked, IsDisabled, IsExpired});
        }
        return ret;
    }

    private async doGet(url: string): Promise<string> {
        const resp = await fetch(url);
        const data = await resp.text();
        if (!resp.ok) {
            throw new ClientError(Client4.url, {
                message: data || '',
                status_code: resp.status,
                url,
            });
        }
        return data;
    }
}
