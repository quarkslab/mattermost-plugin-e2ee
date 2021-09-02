package main

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"
)

type ChanEncryptionMethod int

const (
	ChanEncryptionMethodNone ChanEncryptionMethod = 0
	ChanEncryptionMethodP2P  ChanEncryptionMethod = 1
)

func ChanEncryptionMethodKey(chanID string) string {
	return fmt.Sprintf("chanEncrMethod:%s", chanID)
}

func ChanEncryptionMethodString(m ChanEncryptionMethod) string {
	switch m {
	case ChanEncryptionMethodP2P:
		return "p2p"
	case ChanEncryptionMethodNone:
		return "none"
	default:
		return "none"
	}
}

func ChanEncryptionMethodFromString(m string) ChanEncryptionMethod {
	switch m {
	case "p2p":
		return ChanEncryptionMethodP2P
	case "none":
		return ChanEncryptionMethodNone
	default:
		return ChanEncryptionMethodNone
	}
}

type ChanEncrMethodDB struct {
	mutex sync.RWMutex
	API   plugin.API
}

func NewChanEncrMethodDB(p *Plugin) *ChanEncrMethodDB {
	return &ChanEncrMethodDB{mutex: sync.RWMutex{}, API: p.API}
}

func (db *ChanEncrMethodDB) get(chanID string) ChanEncryptionMethod {
	db.mutex.RLock()
	defer db.mutex.RUnlock()

	method, appErr := db.API.KVGet(ChanEncryptionMethodKey(chanID))
	if method == nil || appErr != nil {
		return ChanEncryptionMethodNone
	}
	var ret ChanEncryptionMethod
	err := json.Unmarshal(method, &ret)
	if err != nil {
		return ChanEncryptionMethodNone
	}
	return ret
}

func (db *ChanEncrMethodDB) setIfDifferent(chanID string, newMethod ChanEncryptionMethod) (bool, *model.AppError) {
	db.mutex.Lock()
	defer db.mutex.Unlock()

	// TODO: KVCompareAndUpdate does not seem to return true if the key doesn't
	// exist. Using a mutex here waiting for better...
	key := ChanEncryptionMethodKey(chanID)
	omJS, appErr := db.API.KVGet(key)
	if appErr != nil {
		return false, appErr
	}
	var oldMethod ChanEncryptionMethod
	if omJS == nil {
		oldMethod = ChanEncryptionMethodNone
	} else {
		err := json.Unmarshal(omJS, &oldMethod)
		if err != nil {
			return false, &model.AppError{}
		}
	}
	if newMethod == oldMethod {
		return false, nil
	}
	nmJS, _ := json.Marshal(newMethod)
	appErr = db.API.KVSet(key, nmJS)
	if appErr != nil {
		return false, appErr
	}
	return true, nil
}
