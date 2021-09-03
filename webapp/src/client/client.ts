import {Client4} from 'mattermost-redux/client';
import {ClientError} from 'mattermost-redux/client/client4';

import {id as pluginId} from 'manifest';
import {PublicKeyMaterial, PublicKeyMaterialJSON} from 'e2ee';

export default class ClientClass {
    url!: string

    setServerRoute(url: string) {
        this.url = url + `/plugins/${pluginId}/api/v1`;
    }

    async pushPubKey(pubkey: PublicKeyMaterial, backupGPG: string | null) {
        return this.doPost(this.url + '/pubkey/push',
            {pubkey: await pubkey.jsonable(), backupGPG});
    }

    async getPubKeys(userIds: Array<string>): Promise<Map<string, PublicKeyMaterial>> {
        const resp = await this.doPost(this.url + '/pubkey/get', {userIds});
        const data = await resp.json();
        const ret = new Map();
        await Promise.all(Object.entries(data.pubKeys).map(async ([userId, pubKeyData]) => {
            let pubkey: PublicKeyMaterial | null = null;
            if (pubKeyData !== null) {
                pubkey = await PublicKeyMaterial.fromJsonable(pubKeyData as PublicKeyMaterialJSON);
            }
            ret.set(userId, pubkey);
        }));
        return ret;
    }

    async getChannelEncryptionMethod(chanID: string): Promise<string> {
        const resp = await this.doGet(this.url + '/channel/encryption_method?chanID=' + chanID).then((r) => r.json());
        return resp.method;
    }

    async setChannelEncryptionMethod(chanID: string, method: string): Promise<void> {
        await this.doPost(this.url + '/channel/encryption_method?chanID=' + chanID + '&method=' + method, {});
    }

    async getGPGPubKey(): Promise<string> {
        return (await this.doGet(this.url + '/gpg/get_pub_key').then((r) => r.json())).key;
    }

    private async doGet(url: string, headers = {}) {
        const options = {
            method: 'get',
            headers,
        };

        const response = await fetch(url, Client4.getOptions(options));

        if (response.ok) {
            return response;
        }

        const text = await response.text();

        throw new ClientError(Client4.url, {
            message: text || '',
            status_code: response.status,
            url,
        });
    }

    private async doPost(url: string, body: object, headers = {}) {
        const options = {
            method: 'post',
            body: JSON.stringify(body),
            headers,
        };

        const response = await fetch(url, Client4.getOptions(options));

        if (response.ok) {
            return response;
        }

        const text = await response.text();

        throw new ClientError(Client4.url, {
            message: text || '',
            status_code: response.status,
            url,
        });
    }
}
