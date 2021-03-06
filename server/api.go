package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"

	"github.com/gorilla/mux"
)

type HTTPHandlerFuncWithContext func(c *Context, w http.ResponseWriter, r *http.Request)

type Context struct {
	Ctx    context.Context
	UserID string
}

type PushPubKeyRequest struct {
	PK        PubKey  `json:"pubkey"`
	BackupGPG *string `json:"backupGPG"`
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
		http.Error(w, "invalid public key", http.StatusBadRequest)
		return
	}

	err := p.SetUserPubKey(userID, pubkey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	p.API.PublishWebSocketEvent("newPubkey",
		map[string]interface{}{
			"userID": userID,
		},
		&model.WebsocketBroadcast{OmitUsers: map[string]bool{userID: true}})

	if !p.GPGBackupEnabled() {
		return
	}

	if req.BackupGPG == nil {
		appErr := p.DeleteGPGBackup(userID)
		if appErr != nil {
			http.Error(w, appErr.Error(), http.StatusInternalServerError)
		}
		return
	}

	appErr := p.StoreGPGBackup(userID, *req.BackupGPG)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	appErr = p.SendGPGBackup(userID)
	if appErr != nil {
		http.Error(w, "Error while sending GPG backup: "+appErr.Error(), appErr.StatusCode)
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
		pubkey, err := p.GetUserPubKey(uid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		res.PubKeys[uid] = pubkey
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
		msg = fmt.Sprintf("@all: message on this channel are now encrypted. Set by @%s. Please note that **people not in this channel won't be able to read the backlog**.", user.Username)
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

type GetKeyServerResp struct {
	URL string `json:"url"`
}

func (p *Plugin) GetKeyServer(c *Context, w http.ResponseWriter, r *http.Request) {
	if !p.GPGBackupEnabled() {
		http.Error(w, "GPG backup disabled", http.StatusNotFound)
		return
	}
	gpgKeyServer := p.getConfiguration().GPGKeyServer
	w.Header().Set("Content-Type", "application/json")
	p.WriteJSON(w, GetKeyServerResp{URL: gpgKeyServer})
}

func (p *Plugin) GPGBackupEnabled() bool {
	return len(strings.TrimSpace(p.getConfiguration().GPGKeyServer)) > 0
}

func (p *Plugin) InitializeAPI() {
	p.ChanEncrMethods = NewChanEncrMethodDB(p.API)

	// Inspired by the Github plugin
	p.router = mux.NewRouter()
	p.router.Use(p.WithRecovery)

	apiRouter := p.router.PathPrefix("/api/v1").Subrouter()

	apiRouter.HandleFunc("/pubkey/push", p.CheckAuth(p.AttachContext(p.PushPubKey))).Methods(http.MethodPost)
	apiRouter.HandleFunc("/pubkey/get", p.CheckAuth(p.GetPubKeys)).Methods(http.MethodPost)
	apiRouter.HandleFunc("/channel/encryption_method", p.CheckAuth(p.AttachContext(p.GetChanEncryptionMethod))).Methods(http.MethodGet)
	apiRouter.HandleFunc("/channel/encryption_method", p.CheckAuth(p.AttachContext(p.SetChanEncryptionMethod))).Methods(http.MethodPost)
	apiRouter.HandleFunc("/gpg/key_server", p.CheckAuth(p.AttachContext(p.GetKeyServer))).Methods(http.MethodGet)
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
