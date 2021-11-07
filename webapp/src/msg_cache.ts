import {Post} from 'mattermost-redux/types/posts';

const MAX_MSGS = 5000;

class MsgCacheImpl {
    cacheDecrypted: Map<string, [string, string]>;

    constructor() {
        this.cacheDecrypted = new Map();
    }

    addMine(post: Post, orgMsg: string) {
        if (!post.props || !post.props.e2ee) {
            return;
        }
        this.cacheDecrypted.set(post.pending_post_id, [orgMsg, post.props.e2ee.signature]);
        MsgCacheImpl.checkSize(this.cacheDecrypted);
    }

    addDecrypted(post: Post, msg: string) {
        if (typeof post.id === 'undefined') {
            return;
        }
        const id = MsgCacheImpl.postID(post);
        this.cacheDecrypted.set(id, [msg, post.props.e2ee.signature]);
        MsgCacheImpl.checkSize(this.cacheDecrypted);
    }

    addUpdated(post: Post, msg: string) {
        // On updated messages, pending_post_id is still there, but the post
        // already has an actual post ID. So force the usage of the ID in this
        // case.
        if (typeof post.id === 'undefined') {
            return;
        }
        this.cacheDecrypted.set(post.id, [msg, post.props.e2ee.signature]);
        MsgCacheImpl.checkSize(this.cacheDecrypted);
    }

    get(post: Post): string | null {
        if (!post.props || !post.props.e2ee) {
            return null;
        }
        if (typeof post.id === 'undefined') {
            return null;
        }
        const id = MsgCacheImpl.postID(post);
        const data = this.cacheDecrypted.get(id) || null;
        if (data === null) {
            return null;
        }
        const [msg, signature] = data;
        return (post.props.e2ee.signature === signature) ? msg : null;
    }

    clear() {
        this.cacheDecrypted.clear();
    }

    private static checkSize(obj: Map<string, [string, string]>) {
        if (obj.size < MAX_MSGS) {
            return;
        }

        // This works because the order of insertion in the Map object is saved
        // (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).
        const first = obj.keys().next().value;
        obj.delete(first);
    }

    private static postID(post: Post): string {
        if (post.pending_post_id && post.pending_post_id !== '') {
            return post.pending_post_id;
        }
        return post.id;
    }
}

const msgCache = new MsgCacheImpl();
export {msgCache, MsgCacheImpl};
