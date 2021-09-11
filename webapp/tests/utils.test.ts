import 'mattermost-webapp/tests/setup';

import {debouncedMerge, debouncedMergeMapArrayReducer} from '../src/utils';

test('utils/debouncedMerge', async () => {
    const myget = async (vals: Array<number>): Promise<Map<number, number>> => {
        const ret = new Map();
        for (const v of vals) {
            ret.set(v, v ** 2);
        }
        return ret;
    };

    jest.useFakeTimers();
    let expectedVals = [1, 2, 4, 5, 6];
    const mygetDebounced = debouncedMerge(
        async (vals: Array<number>) => {
            expect(vals).toStrictEqual(expectedVals);
            return myget(vals);
        },
        debouncedMergeMapArrayReducer, 1);
    const promises = [
        mygetDebounced([1, 2]),
        mygetDebounced([2, 4]),
        mygetDebounced([4, 5]),
        mygetDebounced([5, 6]),
    ];
    jest.runAllTimers();
    const vals = await Promise.all(promises);
    expect(vals[0]).toStrictEqual(new Map([[1, 1], [2, 4]]));
    expect(vals[1]).toStrictEqual(new Map([[2, 4], [4, 16]]));
    expect(vals[2]).toStrictEqual(new Map([[4, 16], [5, 25]]));
    expect(vals[3]).toStrictEqual(new Map([[5, 25], [6, 36]]));

    expectedVals = [1, 2];
    const prom = mygetDebounced([1, 2]);
    jest.runAllTimers();
    expect(await prom).toStrictEqual(new Map([[1, 1], [2, 4]]));

    jest.useRealTimers();
});

test('utils/debouncedMergeErrorFunc', async () => {
    const myget = async (vals: Array<number>): Promise<Map<number, number>> => {
        if (vals[0] === 1) {
            throw new Error('failure');
        }
    };

    const myreducer = (funcres: Map<number, number>, args: Array<number>): Map<number, number> => {
        return funcres;
    };

    jest.useFakeTimers();
    const mygetDebounced = debouncedMerge(myget, myreducer, 1);
    const prom0 = mygetDebounced([1]);
    const prom1 = mygetDebounced([2]);
    jest.runAllTimers();
    await expect(prom0).rejects.toThrow(new Error('failure'));
    await expect(prom1).rejects.toThrow(new Error('failure'));

    jest.useRealTimers();
});

test('utils/debouncedMergeErrorReducer', async () => {
    const myget = async (vals: Array<number>): Promise<Array<number>> => {
        return vals;
    };

    const myreducer = (funcres: Map<number, number>, args: Array<number>): Map<number, number> => {
        if (args[0] === 1) {
            throw new Error('failure');
        }
        return funcres;
    };

    jest.useFakeTimers();
    const mygetDebounced = debouncedMerge(myget, myreducer, 1);
    const prom0 = mygetDebounced([1]);
    const prom1 = mygetDebounced([2]);
    jest.runAllTimers();
    await expect(prom0).rejects.toThrow(new Error('failure'));
    expect(await prom1).toStrictEqual([1, 2]);

    jest.useRealTimers();
});
