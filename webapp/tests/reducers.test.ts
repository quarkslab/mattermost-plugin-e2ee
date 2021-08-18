/* eslint-disable max-nested-callbacks, no-undefined */

import assert from 'assert';
import {ChannelTypes} from 'mattermost-redux/action_types';

import {PubKeyTypes, EncrStatutTypes, EventTypes} from '../src/action_types';
import reducer from '../src/reducers';

describe('Reducers.pubkeys', () => {
    describe('known pub keys', () => {
        it('initial state', () => {
            const state = undefined;
            const action = {};
            const expectedState = new Map();

            const newState = reducer(state, action);
            assert.deepEqual(newState.pubkeys, expectedState);
        });

        it('add key', () => {
            const state = undefined;
            const action = {
                type: PubKeyTypes.RECEIVED_PUBKEYS,
                data: new Map([['user1', 'mykey']]),
            };

            const newState = reducer(state, action);
            assert.strictEqual(newState.pubkeys.get('user1').data, 'mykey');
        });

        it('add and modifiy key', () => {
            const state = undefined;
            let action = {
                type: PubKeyTypes.RECEIVED_PUBKEYS,
                data: new Map([['user1', 'mykey']]),
            };

            let newState = reducer(state, action);
            assert.strictEqual(newState.pubkeys.get('user1').data, 'mykey');

            action = {
                type: PubKeyTypes.RECEIVED_PUBKEYS,
                data: new Map([['user1', 'mykey2']]),
            };

            newState = reducer(state, action);
            assert.strictEqual(newState.pubkeys.get('user1').data, 'mykey2');
        });

        it('add keys', () => {
            const state = undefined;
            const action = {
                type: PubKeyTypes.RECEIVED_PUBKEYS,
                data: new Map([['user1', 'key1'], ['user2', 'key2']]),
            };

            const newState = reducer(state, action);
            assert.strictEqual(newState.pubkeys.get('user1').data, 'key1');
            assert.strictEqual(newState.pubkeys.get('user2').data, 'key2');
        });

        it('add keys null', () => {
            const state = {
                pubkeys: new Map([['user1', {data: 'mykey', lastUpdate: 0}]]),
            };
            const action = {
                type: PubKeyTypes.RECEIVED_PUBKEYS,
                data: new Map([['user1', null], ['user2', 'key2']]),
            };

            const newState = reducer(state, action);
            assert.strictEqual(newState.pubkeys.has('user1'), false);
            assert.strictEqual(newState.pubkeys.get('user2').data, 'key2');
        });
    });

    describe('channel encryption method', () => {
        it('initial state', () => {
            const state = undefined;
            const action = {};
            const expectedState = new Map();

            const newState = reducer(state, action);
            assert.deepEqual(newState.chansEncrMethod, expectedState);
        });

        it('add status', () => {
            const state = undefined;
            const action = {
                type: EncrStatutTypes.RECEIVED_ENCRYPTION_STATUS,
                data: {chanID: 'chan1', method: 'p2p'},
            };

            const newState = reducer(state, action);
            assert.strictEqual(newState.chansEncrMethod.get('chan1'), 'p2p');
        });

        it('clear status', () => {
            const state = {
                chansEncrMethod: new Map([['chan1', 'p2p']]),
            };
            const action = {
                type: EventTypes.GOT_RECONNECTED,
                data: {},
            };

            const newState = reducer(state, action);
            assert.strictEqual(newState.chansEncrMethod.size, 0);
        });

        it('leave channel', () => {
            const state = {
                chansEncrMethod: new Map([['chan1', 'p2p'], ['chan2', 'p2p']]),
            };
            const action = {
                type: ChannelTypes.LEAVE_CHANNEL,
                data: {id: 'chan1'},
            };

            const newState = reducer(state, action);
            assert.strictEqual(newState.chansEncrMethod.get('chan2'), 'p2p');
            assert.strictEqual(newState.chansEncrMethod.has('chan1'), false);
        });
    });
});
