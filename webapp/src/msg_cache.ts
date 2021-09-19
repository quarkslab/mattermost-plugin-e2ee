import {Post} from 'mattermost-redux/types/posts';

const MAX_MSGS = 5000;

class MsgCacheImpl {
    cacheDecrypted: Map<string, string>;

    constructor() {
        this.cacheDecrypted = new Map();
    }

    addMine(post: Post, orgMsg: string) {
        if (!post.props || !post.props.e2ee) {
            return;
        }
        this.cacheDecrypted.set(post.pending_post_id, orgMsg);
        MsgCacheImpl.checkSize(this.cacheDecrypted);
    }

    addDecrypted(post: Post, msg: string) {
        if (typeof post.id === 'undefined') {
            return;
        }
        this.cacheDecrypted.set(post.id, msg);
        MsgCacheImpl.checkSize(this.cacheDecrypted);
    }

    get(post: Post): string | null {
        if (!post.props || !post.props.e2ee) {
            return null;
        }
        if (typeof post.id === 'undefined') {
            return null;
        }
        let id: string;
        if (post.pending_post_id && post.pending_post_id !== '') {
            id = post.pending_post_id;
        } else {
            id = post.id;
        }
        return this.cacheDecrypted.get(id) || null;
    }

    private static checkSize(obj: Map<string, string>) {
        if (obj.size < MAX_MSGS) {
            return;
        }

        // This works because the order of insertion in the Map object is saved
        // (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).
        const first = obj.keys().next().value;
        obj.delete(first);
    }
}

const msgCache = new MsgCacheImpl();
export {msgCache, MsgCacheImpl};
