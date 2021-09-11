# Mattermost E2EE plugin design

This document describes the attack models considered, and the chosen
cryptographic design.

## Attack models

### Passive attacker

In this attack model, we consider that the attacker either has access to the data
that the server receives (but won't modify them), or can somehow read the
database of the Mattermost server (but can't/won't write anything to it).

In this model, end-to-end encryption is pretty efficient, as the server (in
theory) does not own any secret to decrypt the transmitted posts. Also, he
can't inject malicious Javascript as in the active attacker model described
below.

### Active attacker

In this attack model, the attacker has full control over the server, or
communications between clients and the server. It means that it can, among other things:

1. deliver fake public keys for some users (some form of MiTM), and get
   messages encrypted for a private key he owns
2. deliver compromised Javascript to clients

The second problem is currently unsolved for Mattermost webapp plugins. It is
described in the [known limitations section](../README.md#known-limitations).
By delivering compromised Javascript, an attacker can, for instance:

* decrypt the same old messages that the user can,
* send the original decrypted messages to the server that the user is sending

Note that the attacker can't easily extract the private key of the users.
Indeed, these keys are generated as [non
extractable](https://www.w3.org/TR/WebCryptoAPI/#dfn-CryptoKey-extractable).
The attacker would need to exploit the browser itself using unpatched
vulnerabilities.

Considering 2. is solved, 1. is already taken care of in the current version of
the plugin. Indeed, the public key identifiers (IDs) for each user are saved
locally in the browser as they are known to it. If the client receives a public
key for a user with an ID different from the one it already knows, a warning is
shown to the user. This is the equivalent of the "security code has changed"
notification that exists in apps like Signal or WhatsApp.

## Cryptographic protocol  

For now, we only have one encryption mode, that we call "P2P". In this mode,
each message is encrypted for each member of the channel. There is no
per-channel encryption key shared among the participants. We might develop this
"channel shared key" mode in the future.

The implementation of this protocol is mainly in `webapp/src/e2ee.ts`,
with tests in `webapp/tests/e2ee.test.ts`.

### Why P-256?

The asymmetric keys we use are on the P-256 curve. On one side, the [WebCrypto
API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) provides
the nice features that the cryptographic primitives runs natively & that
private keys can be *non extractable*, protecting them from being extracted via
XSS or [malicious Javascript code injected](#active-attacker). On the other
side, it doesn't give much choices regarding [the supported
curves](https://developer.mozilla.org/en-US/docs/Web/API/EcKeyGenParams).


### E2EE Private key

An E2EE private key consists of two asymmetric keys over the P-256 elliptic curve (EC):

* a key used to decrypt encrypted messages using ECDH (then named `ecdh_key`)
* a key used for signature with ECDSA (then named `ecdsa_key`)

### E2EE Public key

An E2EE public key consists of the two EC public counterparts of the two EC private keys.

The identifier of a public key is computed as `SHA256(exported_ecdh_key ||
exported_ecdsa_key)`, where `exported_*_key` is the uncompressed point
representing an EC public key, with the following format (`1+32*2=65` bytes in total):

```
04 || big_endian_x || big_endian_y
```

### Message encryption & signature

The version 1 of an encrypted message ends up with a
`EncryptedP2PMessage` structure containing:

* `IV`: a 16-byte randomly generated IV
* `pubECDHE`: the public counterpart of an ephemeral ECDH asymmetric key
* `encryptedKey`: an array of `(pubkey ID, wrapped message key)` tuple, with
  one for each recipient
* `encryptedData`: encrypted data with AES-CTR 
* `signature`: an ECDSA signature of the data

#### Encryption

(Implemented in `EncryptedP2PMessage.encrypt`)

Messages are encrypted using AES128-CTR. The IV is generated randomly and
stored in clear text in `EncryptedP2PMessage`. The key `MK` is also randomly generated.

`MK` is then wrapped using
[AES-KW](https://datatracker.ietf.org/doc/html/rfc3394), using a key `KWK` derived
for each recipient through ECDH with an ephemeral ECDH key. In more details:

* an ephemeral ECDH `keyECDHE` is generated. Its public counterpart is stored in `EncryptedP2PMessage` in `pubECDHE`
* for each recipient:
  * ECDH is performed against the private counterpart of `keyECDHE` & the
    public key of this recipient. The resulting shared secret is named `DHSS`
  * `KWK` is then computed as `SHA256(DHSS)`.
  * we store the result of `AES-KW(KWK, MK)` associated with the recipient's public key ID in the `encryptedKey` field

In the end, the `encryptedKey` field is an **ordered** array containing one `(pubkey ID, wrapped KW)` tuple per recipient.

#### Signature

Signature is performed with ECDSA / SHA256 with the following concatenated data (in this order) (implemented in `EncryptedP2PMessage.signData`):

* 16-bytes IV
* `SHA256(pubECDHEData)`, where `pubECDHEData` is the uncompressed point
  representing the ECDHE public key.
* the number of recipients, encoded as a 32-bit unsigned integer in big endian
* a concatenation of the public key IDs of the recipients, in the order
  created by the encryption process (see above)
* the length of the encrypted message, encoded as a 32-bit unsigned integer in big endian
* the encrypted message

The resulting signature is stored in the `signature` field of `EncryptedP2PMessage`.

### Message authentication & decryption 

(Implemented in `EncryptedP2PMessage.verifyAndDecrypt`)

Signature verification is performed using the data described
[above](#signature), with the public key currently associated with the user
that posted the message.

If the message doesn't contain a wrapped key for the recipient, then the decryption process is aborted.

Otherwise, decryption is done by performing ECDH against `pubECDHE` and the private key of
the recipient. Then, the same key derivation process is performed as explained
[above](#encryption). `AES-KW` checks the integrity of the unwrapped key, and
an error is emitted if this guarantee isn't verified. The resulting AES key is
then used to decrypt the encrypted message using AES128-CTR and the IV
(available in `EncryptedP2PMessage`).

### Some possible future optimisations

There might be some space/performance optimisation opportunities to consider in the future.

#### Small messages optimisation?

If the message length is lower than 32 bytes (the output length of
`SHA256(DHSS)`), then we could simply XOR the message with this shared secret,
for each recipient. This would save `N` (== # of recipients) `AES-KW`
computations and the final `AES-CTR` encryption.

The drawback is that we now need to include more data into the ECDSA / SHA256
signature process to assess for the integrity of the encrypted versions of the
message. Thus we save `N` `AES-KW` instances & the final `AES-CTR`, but we need
to feed (at most) `N*32` more bytes into `SHA256`. Some benchmarks need to be
done to figure out whether this really is interesting. There might be other way
to assess for the integrity of the encrypted message. To be continued.
