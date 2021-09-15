package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"

	"github.com/gorilla/mux"
)

// Algos Cf https://datatracker.ietf.org/doc/html/rfc2440#section-9.1
var Algos = map[int]string{
	1:  "RSAEncryptOrSign",
	2:  "RSAEncrypt",
	3:  "RSASign",
	16: "ElGamalEncrypt",
	17: "DSA",
	18: "EC",
	19: "ECDSA",
	20: "ElGamalEncryptOrSign",
	21: "DH",
}

type HTTPHandlerFuncWithContext func(c *Context, w http.ResponseWriter, r *http.Request)

type Context struct {
	Ctx    context.Context
	UserID string
}

type PushPubKeyRequest struct {
	PK        PubKey  `json:"pubkey"`
	BackupGPG *string `json:"backupGPG"`
}

func (p *Plugin) SendGPGBackup(userID string) *model.AppError {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		return appErr
	}

	backupGPG, appErr := p.API.KVGet(StoreBackupGPGKey(userID))
	if appErr != nil {
		return appErr
	}

	return p.API.SendMail(user.Email, "Mattermost E2EE private key backup", "<pre>"+string(backupGPG)+"</pre>")
}

func (p *Plugin) PushPubKey(c *Context, w http.ResponseWriter, r *http.Request) {
	userID := c.UserID

	var req PushPubKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	pubkey := &req.PK
	if !pubkey.Validate() {
		http.Error(w, "invalid elliptic curve key", http.StatusBadRequest)
		return
	}

	pubkeyData, err := json.Marshal(pubkey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	appErr := p.API.KVSet(StoreKeyPubKey(userID), pubkeyData)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	p.API.PublishWebSocketEvent("newPubkey",
		map[string]interface{}{
			"userID": userID,
		},
		&model.WebsocketBroadcast{OmitUsers: map[string]bool{userID: true}})

	kvGPGBackup := StoreBackupGPGKey(userID)
	if req.BackupGPG == nil {
		appErr = p.API.KVDelete(kvGPGBackup)
		if appErr != nil {
			http.Error(w, appErr.Error(), http.StatusInternalServerError)
		}
		return
	}

	appErr = p.API.KVSet(kvGPGBackup, []byte(*req.BackupGPG))
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	appErr = p.SendGPGBackup(userID)
	if appErr != nil {
		http.Error(w, "Error while sending GPG backup: "+appErr.Error(), http.StatusInternalServerError)
		return
	}
}

type GetPubKeysRequest struct {
	UserIds []string `json:"userIds"`
}

type GetPubKeysResponse struct {
	PubKeys map[string]*PubKey `json:"pubKeys"`
}

func NewGetPubKeysReponse() *GetPubKeysResponse {
	ret := new(GetPubKeysResponse)
	ret.PubKeys = make(map[string]*PubKey)
	return ret
}

func (p *Plugin) GetPubKeys(w http.ResponseWriter, r *http.Request) {
	var req GetPubKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	res := NewGetPubKeysReponse()
	for _, uid := range req.UserIds {
		pubkeyJSON, appErr := p.API.KVGet(StoreKeyPubKey(uid))
		if appErr != nil {
			http.Error(w, appErr.Error(), http.StatusInternalServerError)
			return
		}
		if pubkeyJSON == nil {
			res.PubKeys[uid] = nil
			continue
		}
		var pubkey PubKey
		err := json.Unmarshal(pubkeyJSON, &pubkey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		res.PubKeys[uid] = &pubkey
	}

	w.Header().Set("Content-Type", "application/json")
	p.WriteJSON(w, res)
}

type ChanEncryptionMethodResponse struct {
	Method string `json:"method"`
}

// From mattermost-plugin-github
func (p *Plugin) WriteJSON(w http.ResponseWriter, v interface{}) {
	err := json.NewEncoder(w).Encode(v)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (p *Plugin) GetChanEncryptionMethod(c *Context, w http.ResponseWriter, r *http.Request) {
	userID := c.UserID
	chanID := r.URL.Query().Get("chanID")

	// Check user is in channel
	_, appErr := p.API.GetChannelMember(chanID, userID)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	method := ChanEncryptionMethodString(p.ChanEncrMethods.get(chanID))
	p.WriteJSON(w, ChanEncryptionMethodResponse{method})
}

func (p *Plugin) SetChanEncryptionMethod(c *Context, w http.ResponseWriter, r *http.Request) {
	userID := c.UserID
	chanID := r.URL.Query().Get("chanID")

	// Check user is in channel and has the right to do so
	_, appErr := p.API.GetChannelMember(chanID, userID)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusUnauthorized)
		return
	}
	// TODO: check rights

	method := ChanEncryptionMethodFromString(r.URL.Query().Get("method"))
	changed, appErr := p.ChanEncrMethods.setIfDifferent(chanID, method)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}
	if !changed {
		post := &model.Post{
			Message:   fmt.Sprintf("Channel is already on encryption mode '%s'", ChanEncryptionMethodString(method)),
			UserId:    p.BotUserID,
			ChannelId: chanID,
		}
		_ = p.API.SendEphemeralPost(userID, post)
		return
	}

	p.API.PublishWebSocketEvent("channelStateChanged",
		map[string]interface{}{
			"chanID": chanID,
			"method": ChanEncryptionMethodString(method),
		},
		&model.WebsocketBroadcast{ChannelId: chanID})

	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	var msg string
	if method == ChanEncryptionMethodNone {
		msg = fmt.Sprintf("@all: messages on this channel **aren't encrypted anymore**. Set by @%s", user.Username)
	} else {
		msg = fmt.Sprintf("@all: message on this channel are now encrypted. Set by @%s.\n**WARNING**: people not in this channel won't be able to read the backlog.", user.Username)
		noPubKeys, appErrMWK := p.GetChannelMembersWithoutKeys(chanID)
		if appErrMWK != nil {
			http.Error(w, appErrMWK.Error(), http.StatusInternalServerError)
			return
		}
		if len(noPubKeys) > 0 {
			msg += "\n**WARNING**: these people in the channel do not have setup an encryption key, and therefore won't be able to read messages:"
			for _, nokeyUID := range noPubKeys {
				nokeyUser, appErrU := p.API.GetUser(nokeyUID)
				if appErrU != nil {
					http.Error(w, appErrU.Error(), http.StatusInternalServerError)
					return
				}
				msg += " @" + nokeyUser.Username
			}
		}
	}

	post := &model.Post{
		Message:   msg,
		UserId:    p.BotUserID,
		ChannelId: chanID,
	}
	_, appErr = p.API.CreatePost(post)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
	}
}

// https://stackoverflow.com/a/62555190
func GetStringInBetweenTwoString(str string, startS string, endS string) (result string, found bool) {
	s := strings.Index(str, startS)
	if s == -1 {
		return result, false
	}
	newS := str[s+len(startS):]
	e := strings.Index(newS, endS)
	if e == -1 {
		return result, false
	}
	result = newS[:e]
	return result, true
}

func SanitizeGPGPubKey(str string) (string, error) {
	const gpgHeader = "-----BEGIN PGP PUBLIC KEY BLOCK-----"
	const gpgFooter = "-----END PGP PUBLIC KEY BLOCK-----"
	key, found := GetStringInBetweenTwoString(str, gpgHeader, gpgFooter)
	if !found {
		return "", errors.New("invalid format")
	}
	return fmt.Sprintf("%s%s%s", gpgHeader, key, gpgFooter), nil
}

type GetGPGPubKeyResp struct {
	Key string `json:"key"`
}

type KeyListing struct {
	KeyID          string
	Algo           int
	KeyLen         int
	CreationDate   time.Time
	ExpirationDate time.Time
	IsRevoked      bool
	IsDisabled     bool
	IsExpired      bool
}

func (k KeyListing) GetLast8KeyIDBytes() string {
	return k.KeyID[len(k.KeyID)-8:]
}

func (k KeyListing) String() string {
	flags := ""
	if k.IsRevoked {
		flags += "r"
	}
	if k.IsDisabled {
		flags += "d"
	}
	if k.IsExpired {
		flags += "e"
	}
	return fmt.Sprintf("%s [%s:%d] Created at %s Expired at %s %s", k.KeyID,
		Algos[k.Algo],
		k.KeyLen,
		k.CreationDate,
		k.ExpirationDate,
		flags,
	)
}

func ParseMachineReadableIndexes(str string) []KeyListing {
	var ret []KeyListing
	for _, line := range strings.Split(str, "\n") {
		splittedLine := strings.Split(line, ":")

		if len(splittedLine) == 7 && splittedLine[0] == "pub" {
			keyListing := KeyListing{}
			keyListing.KeyID = splittedLine[1]

			if algo, err := strconv.ParseUint(splittedLine[2], 10, 32); err == nil {
				if _, isAlgoValid := Algos[int(algo)]; isAlgoValid {
					keyListing.Algo = int(algo)
				}
			}

			if kL, err := strconv.ParseUint(splittedLine[3], 10, 32); err == nil {
				keyListing.KeyLen = int(kL)
			}
			if unixTime, err := strconv.ParseInt(splittedLine[4], 10, 64); err == nil {
				keyListing.CreationDate = time.Unix(unixTime, 0)
			}

			if unixTime, err := strconv.ParseInt(splittedLine[5], 10, 64); err == nil {
				keyListing.ExpirationDate = time.Unix(unixTime, 0)
			}
			keyListing.IsRevoked = splittedLine[6] == "r"
			keyListing.IsDisabled = splittedLine[6] == "d"
			keyListing.IsExpired = splittedLine[6] == "e"

			ret = append(ret, keyListing)
		}
	}
	return ret
}
func GpgServerExtractFirstNotRevokedLink(gpgkeyserver string, email string) (string, error) {
	resp, err := http.Get(fmt.Sprintf("%s/pks/lookup?op=index&options=mr&search=%s", gpgkeyserver, email))
	if nil != err {
		return "", err
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if nil != err {
		return "", err
	}

	for _, i := range ParseMachineReadableIndexes(string(body)) {
		if !i.IsExpired && !i.IsDisabled && !i.IsRevoked {
			return fmt.Sprintf("%s/pks/lookup?op=get&search=0x%s", gpgkeyserver, i.GetLast8KeyIDBytes()), nil
		}
	}
	return "", fmt.Errorf("no valid key found in server %s for user %s", gpgkeyserver, email)
}
func (p *Plugin) GetGPGPubKey(c *Context, w http.ResponseWriter, r *http.Request) {
	userID := c.UserID
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	// http://keys.qb/pks/lookup?op=get&options=mr&search=aguinet@quarkslab.com
	// https://keys.openpgp.org/vks/v1/by-email/adrien@guinet.me
	// Support PKS for now (keys.qb doesn't support vks)
	gpgKeyServer := p.getConfiguration().GPGKeyServer
	url, err := GpgServerExtractFirstNotRevokedLink(gpgKeyServer, url.QueryEscape(user.Email))
	if err != nil {
		http.Error(w, fmt.Sprintf("Unable to get GPG key for '%s': %s", user.Email, err.Error()), http.StatusInternalServerError)
		return
	}
	//nolint:gosec
	resp, err := http.Get(url)
	if err != nil {
		http.Error(w, fmt.Sprintf("Unable to get GPG key for '%s': %s", user.Email, err.Error()), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		http.Error(w, fmt.Sprintf("Unable to get GPG key for '%s': GPG key server returned status code %d", user.Email, resp.StatusCode), resp.StatusCode)
		return
	}

	// We sanitize the GPG key as some server wraps it around some <pre></pre>
	// HTML tags (e.g. keys.qb)
	keytxt, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	key, err := SanitizeGPGPubKey(string(keytxt))
	if err != nil {
		http.Error(w, "Error while parsing the GPG key returned by the server: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/pgp-keys")
	p.WriteJSON(w, GetGPGPubKeyResp{Key: key})
}

func (p *Plugin) InitializeAPI() {
	p.ChanEncrMethods = NewChanEncrMethodDB(p)

	// Inspired by the Github plugin
	p.router = mux.NewRouter()
	p.router.Use(p.WithRecovery)

	apiRouter := p.router.PathPrefix("/api/v1").Subrouter()

	apiRouter.HandleFunc("/pubkey/push", p.CheckAuth(p.AttachContext(p.PushPubKey))).Methods(http.MethodPost)
	apiRouter.HandleFunc("/pubkey/get", p.CheckAuth(p.GetPubKeys)).Methods(http.MethodPost)
	apiRouter.HandleFunc("/channel/encryption_method", p.CheckAuth(p.AttachContext(p.GetChanEncryptionMethod))).Methods(http.MethodGet)
	apiRouter.HandleFunc("/channel/encryption_method", p.CheckAuth(p.AttachContext(p.SetChanEncryptionMethod))).Methods(http.MethodPost)
	apiRouter.HandleFunc("/gpg/get_pub_key", p.CheckAuth(p.AttachContext(p.GetGPGPubKey))).Methods(http.MethodGet)
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

func (p *Plugin) WithRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if x := recover(); x != nil {
				p.API.LogError("Recovered from a panic",
					"url", r.URL.String(),
					"error", x,
					"stack", string(debug.Stack()))
			}
		}()

		next.ServeHTTP(w, r)
	})
}

func (p *Plugin) CreateContext(_ http.ResponseWriter, r *http.Request) (*Context, context.CancelFunc) {
	userID := r.Header.Get("Mattermost-User-ID")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

	context := &Context{
		Ctx:    ctx,
		UserID: userID,
	}

	return context, cancel
}

func (p *Plugin) AttachContext(handler HTTPHandlerFuncWithContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		context, cancel := p.CreateContext(w, r)
		defer cancel()

		handler(context, w, r)
	}
}

func (p *Plugin) CheckAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("Mattermost-User-ID")
		if userID == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}

		handler(w, r)
	}
}
