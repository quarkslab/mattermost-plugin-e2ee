import 'mattermost-webapp/tests/setup';
import {MsgCacheImpl} from '../src/msg_cache';

test('e2ee/msgMine', async () => {
    const cache = new MsgCacheImpl();
    const post_id = 'user1:0';
    const post = {
        props: {
            e2ee: {
                signature: 'mysign',
            },
        },
        pending_post_id: post_id,
    };
    const msg = 'coucou';
    cache.addMine(post, msg);
    post.id = post_id;
    expect(cache.get(post)).toStrictEqual(msg);
});

test('e2ee/msgDecrypted', async () => {
    const cache = new MsgCacheImpl();
    const myuid = 'user1';
    const other = 'user2';
    const post = {
        props: {
            e2ee: { },
        },
        user_id: other,
        id: 'postid',
    };
    const msg = 'coucou';
    cache.addDecrypted(post, msg);
    expect(cache.get(post)).toStrictEqual(msg);
    expect(cache.get({user_id: other, id: 'postid2'})).toStrictEqual(null);
});
