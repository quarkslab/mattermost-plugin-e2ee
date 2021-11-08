/* eslint max-nested-callbacks: ["error", 3] */

import PropTypes from 'prop-types';
import React, {useEffect, useState} from 'react';

// @ts-ignore
const {formatText, messageHtmlToComponent} = window.PostUtils;

import {decryptPost} from 'e2ee_post';
import {E2EEUnknownRecipient} from 'e2ee';
import {msgCache} from 'msg_cache';

import {E2EEPostProps} from './index';
import './e2ee_post.css';

export const E2EEPost: React.FC<E2EEPostProps> = (props) => {
    const {post, privkey, currentUserID, actions} = props;

    const [msgText, setMsgText] = useState('');
    const [headerClasses, setHeaderClasses] = useState('e2ee_post_header');
    const [postClasses, setPostClasses] = useState('e2ee_post_body');

    const formatOptions = {
        atMentions: true,
    };

    const setMsgSuccess = (text: string) => {
        if (text.length > 0) {
            const ftxt = messageHtmlToComponent(formatText(text, formatOptions));
            setMsgText(ftxt);
            setHeaderClasses('e2ee_post_header');
            setPostClasses('e2ee_post_body');
        } else {
            setHeaderClasses('e2ee_post_header e2ee__hidden');
            setPostClasses('e2ee_post_body e2ee__hidden');
        }
        post.message = "WARNING: if you read this text, it's probably because you are trying to edit an encrypted message. This is currently not possible. Indeed, the text saved in this box will be saved on the server unencrypted. It is due to a limitation in what plugins can do in Mattermost that will hopefully be fixed.";
    };

    const setMsgError = (text: string) => {
        setMsgText(text);
        setPostClasses('e2ee_post_body e2ee__error');
        setHeaderClasses('e2ee_post_header e2ee__error');
    };

    useEffect(() => {
        if (privkey == null) {
            setMsgError('e2ee needs to be setup');
            return;
        }
        const msgCached = msgCache.get(post);
        if (msgCached !== null) {
            setMsgSuccess(msgCached);
            return;
        }

        setMsgText('');
        setPostClasses('e2ee_post_body e2ee_post_body__decrypting');
        const uid = post.user_id;
        actions.getPubKeys([uid]).

            // TODO: AG: see src/types.ts to see why we need to ignore the type
            // checker (cf. MyActionResult)
            // @ts-ignore
            then(({data: reskey, error}) => {
                if (error) {
                    throw error;
                }
                const senderkey = reskey.get(uid) || null;
                if (senderkey == null) {
                    throw new Error('it is unknown');
                }
                decryptPost(post.props.e2ee, senderkey, privkey).
                    then((decrMsg) => {
                        msgCache.addDecrypted(post, decrMsg);
                        setMsgSuccess(decrMsg);
                    }).
                    catch((e) => {
                        if (e instanceof E2EEUnknownRecipient) {
                            setMsgError("This message hasn't been encrypted for us");
                        } else {
                            setMsgError('Error while decrypting: ' + e.message);
                        }
                    });
            }).
            catch((e) => {
                setMsgError('Error while getting identity of sender: ' + e.message);
            });
    }, [post, privkey, actions]);

    return (
        <div className='e2ee_post'>
            <div className={headerClasses}>{'🔐'}</div>
            <div className={postClasses}>{msgText}</div>
        </div>
    );
};

E2EEPost.propTypes = {

    // @ts-ignore
    post: PropTypes.object.isRequired,

    // @ts-ignore
    privkey: PropTypes.object.isRequired,

    currentUserID: PropTypes.string.isRequired,

    actions: {

        // @ts-ignore
        getPubKeys: PropTypes.func.isRequired,
    },
};
