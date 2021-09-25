package main

import (
	"encoding/json"
	"testing"

	"github.com/mattermost/mattermost-server/v5/plugin/plugintest"
	"github.com/stretchr/testify/assert"
)

func Test_chanencrmeth_set_noexist(t *testing.T) {
	mockAPI := plugintest.API{}
	db := NewChanEncrMethodDB(&mockAPI)
	chanID := "chan1"
	tassert := assert.New(t)

	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(nil, nil)
	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVSet", ChanEncryptionMethodKey(chanID), p2p).Return(nil)

	changed, err := db.setIfDifferent(chanID, ChanEncryptionMethodP2P)
	tassert.Nil(err)
	tassert.Equal(changed, true)
}

func Test_chanencrmeth_set_different(t *testing.T) {
	mockAPI := plugintest.API{}
	db := NewChanEncrMethodDB(&mockAPI)
	chanID := "chan1"
	tassert := assert.New(t)

	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(p2p, nil)
	none, _ := json.Marshal(ChanEncryptionMethodNone)
	mockAPI.On("KVSet", ChanEncryptionMethodKey(chanID), none).Return(nil)

	changed, _ := db.setIfDifferent(chanID, ChanEncryptionMethodNone)
	tassert.Equal(changed, true)
}

func Test_chanencrmeth_set_same(t *testing.T) {
	mockAPI := plugintest.API{}
	db := NewChanEncrMethodDB(&mockAPI)
	chanID := "chan1"
	tassert := assert.New(t)

	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(p2p, nil)

	changed, _ := db.setIfDifferent(chanID, ChanEncryptionMethodP2P)
	tassert.Equal(changed, false)
}
