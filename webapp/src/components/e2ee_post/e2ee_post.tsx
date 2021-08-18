/* eslint max-nested-callbacks: ["error", 3] */

import PropTypes from 'prop-types';
import React, {useEffect, useState} from 'react';
import {ActionResult} from 'mattermost-redux/types/actions';

// @ts-ignore
const {formatText, messageHtmlToComponent} = window.PostUtils;

import {decryptPost} from 'e2ee_post';
import {getPubKeys} from 'actions';
import {E2EEUnknownRecipient, PrivateKeyMaterial} from 'e2ee';

import {E2EEPostProps} from './index';
import './e2ee_post.css';

export const E2EEPost: React.FC<E2EEPostProps> = (props) => {
    const {post, privkey, actions} = props;

    // TODO: "..." moving dots while decrypting
    const [msgText, setMsgText] = useState('Decrypting...');
    const [bgColor, setBgColor] = useState('bg');

    const setMsgSuccess = (text: string) => {
        const ftxt = messageHtmlToComponent(formatText(text));
        setMsgText(ftxt);
        setBgColor('#ffff0040');
    };
    const setMsgError = (text: string) => {
        setMsgText(text);
        setBgColor('#ff000040');
    };

    useEffect(() => {
        if (privkey == null) {
            setMsgError('e2ee needs to be setup');
            return;
        }
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
                        setMsgSuccess(decrMsg);
                        post.message = "WARNING: if you read this text, it's probably because you are trying to edit an encrypted message. This is currently not possible. Indeed, the text saved in this box will be saved on the server unencrypted. It is due to a limitation in what plugins can do in Mattermost that will hopefully be fixed.";
                    }).
                    catch((e) => {
                        if (e instanceof E2EEUnknownRecipient) {
                            setMsgError("This message hasn't been encrypted for us");
                        } else {
                            setMsgError('Error while decrypting: ' + e.message);
                        }
                    });
            }).
            catch((e) => setMsgError('Error while getting identity of sender: ' + e.message));
    }, [post, privkey, actions]);

    return (
        <div className='e2ee_post'>
            <span style={{backgroundColor: bgColor}}>{'E2EE'}</span>{' | '}{msgText}
        </div>
    );
};

E2EEPost.propTypes = {

    // @ts-ignore
    post: PropTypes.object.isRequired,

    // @ts-ignore
    privkey: PropTypes.object.isRequired,
    actions: {

        // @ts-ignore
        getPubKeys: PropTypes.func.isRequired,
    },
};
