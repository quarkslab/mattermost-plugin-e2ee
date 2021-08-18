# Mattermost E2EE plugin

## Attack model

* someone pwn the mattermost server
* someone just dumps the DB (included in 1) obviously) w/o pwning the server (e.g. path concatenation attacks, dump the disk from the hypervisor, and so on)
Tricky things: in 1), we can't really trust the web app as it would be downloaded from a compromised server (e.g. inject JS to leak keys)

Idea:
- keys can be protected in browsers: https://security.stackexchange.com/questions/169371/javascript-client-side-encryption-key-storage
- https://www.pageintegrity.net/ to check the integrity of the mattermost app

## Exisiting work

### Anonymous plugin

URL: https://github.com/bakurits/mattermost-plugin-anonymous:

- based on node-rsa (https://github.com/rzcoder/node-rsa/) to encrypt/decrypt data
- key created and stored in the browser, but can be exported by the user, so I guess not using the "key in a browser protection" above
- not really space optimized and efficient on the encryption scheme (do RSA-OAEP on each message "block" for every key)
- copy/paste code from node-rsa w/o understanding what's happening. Indeed, when reading https://github.com/bakurits/mattermost-plugin-anonymous/blob/master/webapp/src/encrypt/key_manager.js#L7 , you might think "WTF". But if you read the code of node-rsa this is fine thanks to https://github.com/bakurits/mattermost-plugin-anonymous/blob/master/webapp/src/encrypt/key_manager.js#L15 , which regenerate a 2048 bit key by default. But that's the very example on the node-rsa readme page.
- node-rsa has code that generates RSA keys in JS, and just writing it seems like a bad idea

## Crypto protocol  

TODO
