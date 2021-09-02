package main

import (
	"bytes"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin/plugintest"
	"github.com/stretchr/testify/mock"

	"github.com/quarkslab/mattermost-plugin-e2ee/server/testutils"
)

func SerializePubKey(x *big.Int, y *big.Int) []byte {
	CL := ECCurve.Params().BitSize / 8
	xb := make([]byte, CL)
	x.FillBytes(xb)
	yb := make([]byte, CL)
	y.FillBytes(yb)
	ret := bytes.Buffer{}
	ret.WriteByte(0x04) // uncompressed point
	ret.Write(xb)
	ret.Write(yb)
	return ret.Bytes()
}

func GenerateValidPubKey() PubKey {
	_, x0, y0, _ := elliptic.GenerateKey(ECCurve, rand.Reader)
	_, x1, y1, _ := elliptic.GenerateKey(ECCurve, rand.Reader)
	return PubKey{
		SerializePubKey(x0, y0),
		SerializePubKey(x1, y1),
	}
}

type TestDesc struct {
	name             string
	request          testutils.Request
	expectedResponse testutils.ExpectedResponse
	userID           string
}

func RunTests(tests *[]TestDesc, t *testing.T, mockAPI *plugintest.API) {
	httpTest := testutils.HTTPTest{
		T:       t,
		Encoder: testutils.EncodeJSON,
	}

	for _, tt := range *tests {
		t.Run(tt.name, func(t *testing.T) {
			p := Plugin{}
			p.SetAPI(mockAPI)
			p.InitializeAPI()
			req := httpTest.CreateHTTPRequest(tt.request)
			if tt.userID != "" {
				req.Header.Add("Mattermost-User-ID", tt.userID)
			}
			rr := httptest.NewRecorder()
			p.ServeHTTP(nil, rr, req)
			httpTest.CompareHTTPResponse(rr, tt.expectedResponse)
		})
	}
}

func Test_plugin_ServeHTTP_PushPubKey(t *testing.T) {
	mockAPI := plugintest.API{}
	// KVSet always work
	mockAPI.On("KVSet", "pubkey:user1", mock.AnythingOfType("[]uint8")).Return(nil)
	mockAPI.On("KVDelete", "backup_gpg:user1").Return(nil)
	apiURL := "/api/v1/pubkey/push"

	validPubKey := GenerateValidPubKey()
	invalidPubKeySame := PubKey{validPubKey.Encr, validPubKey.Encr}

	tests := []TestDesc{
		{
			name: "no userID",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL,
				Body:   PubKey{[]byte{0}, []byte{1}},
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusUnauthorized,
				Body:       nil,
			},
			userID: "",
		},
		{
			name: "bad body",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL,
				Body:   "{ encr: \"toto\", sign: \"tata\" }",
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusBadRequest,
			},
			userID: "user1",
		},
		{
			name: "invalid pub key",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL,
				Body:   invalidPubKeySame,
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusBadRequest,
			},
			userID: "user1",
		},
		{
			name: "success",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL,
				Body: PushPubKeyRequest{
					PK:        validPubKey,
					BackupGPG: nil,
				},
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
				Body:       nil,
			},
			userID: "user1",
		},
	}

	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_GetPubKeys(t *testing.T) {
	mockAPI := plugintest.API{}
	// KVGet returns a key for user1, but not for user2
	user1Key := PubKey{[]byte{0}, []byte{1}}
	user1KeyJSON, _ := json.Marshal(user1Key)
	mockAPI.On("KVGet", StoreKeyPubKey("user1")).Return(user1KeyJSON, nil)
	mockAPI.On("KVGet", StoreKeyPubKey("user2")).Return(nil, nil)
	apiURL := "/api/v1/pubkey/get"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL,
				Body:   GetPubKeysRequest{[]string{"user1", "user2"}},
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
				Body:       GetPubKeysResponse{map[string]*PubKey{"user1": &user1Key, "user2": nil}},
			},
			userID: "user",
		},
	}

	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_ChannelEncryptionMethodDefault(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	// Channel status never set
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(nil, &model.AppError{})
	// User is a member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(&model.ChannelMember{}, nil)

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "GET",
				URL:    apiURL + "?chanID=" + chanID,
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
				Body:       ChanEncryptionMethodResponse{"none"},
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_ChannelEncryptionMethodAlreadySet(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	// Channel status never set
	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(p2p, nil)
	// User is a member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(&model.ChannelMember{}, nil)

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "GET",
				URL:    apiURL + "?chanID=" + chanID,
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
				Body:       ChanEncryptionMethodResponse{"p2p"},
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_ChannelEncryptionMethodNotMember(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	// Channel status never set
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(nil, &model.AppError{})
	// User is a not member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(nil, &model.AppError{})

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "fail",
			request: testutils.Request{
				Method: "GET",
				URL:    apiURL + "?chanID=" + chanID,
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusUnauthorized,
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_SetChannelEncryptionMethodWillChange(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	none, _ := json.Marshal(ChanEncryptionMethodNone)
	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(none, nil)
	mockAPI.On("KVSet", ChanEncryptionMethodKey(chanID), p2p).Return(nil)
	// User is a not member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(&model.ChannelMember{}, nil)
	mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil)
	mockAPI.On("GetUser", userID).Return(&model.User{Username: "myuser"}, nil)
	mockAPI.On("PublishWebSocketEvent", "channelStateChanged",
		map[string]interface{}{
			"chanID": "chan1",
			"method": "p2p",
		},
		&model.WebsocketBroadcast{ChannelId: "chan1"}).Return()

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL + "?chanID=" + chanID + "&method=p2p",
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_SetChannelEncryptionMethodFirstTime(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(nil, nil)
	mockAPI.On("KVSet", ChanEncryptionMethodKey(chanID), p2p).Return(nil)
	// User is a not member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(&model.ChannelMember{}, nil)
	mockAPI.On("CreatePost", mock.AnythingOfType("*model.Post")).Return(&model.Post{}, nil)
	mockAPI.On("GetUser", userID).Return(&model.User{Username: "myuser"}, nil)
	mockAPI.On("PublishWebSocketEvent", "channelStateChanged",
		map[string]interface{}{
			"chanID": "chan1",
			"method": "p2p",
		},
		&model.WebsocketBroadcast{ChannelId: "chan1"}).Return()

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL + "?chanID=" + chanID + "&method=p2p",
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_SetChannelEncryptionMethodWillNotChange(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	p2p, _ := json.Marshal(ChanEncryptionMethodP2P)
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(p2p, nil)
	// User is a not member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(&model.ChannelMember{}, nil)
	mockAPI.On("SendEphemeralPost", mock.AnythingOfType("string"), mock.AnythingOfType("*model.Post")).Return(nil)

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL + "?chanID=" + chanID + "&method=p2p",
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_SetChannelEncryptionMethodWillNotChangeFirstTime(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	mockAPI.On("KVGet", ChanEncryptionMethodKey(chanID)).Return(nil, nil)
	// User is a not member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(&model.ChannelMember{}, nil)
	mockAPI.On("SendEphemeralPost", mock.AnythingOfType("string"), mock.AnythingOfType("*model.Post")).Return(nil)

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "success",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL + "?chanID=" + chanID + "&method=none",
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusOK,
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}

func Test_plugin_ServeHTTP_SetChannelEncryptionMethodUnauthorized(t *testing.T) {
	const chanID = "chan1"
	const userID = "user1"

	mockAPI := plugintest.API{}
	// User is not a not member of the channel
	mockAPI.On("GetChannelMember", chanID, userID).Return(nil, &model.AppError{})

	apiURL := "/api/v1/channel/encryption_method"

	tests := []TestDesc{
		{
			name: "fail",
			request: testutils.Request{
				Method: "POST",
				URL:    apiURL + "?chanID=" + chanID + "&method=p2p",
			},
			expectedResponse: testutils.ExpectedResponse{
				StatusCode: http.StatusUnauthorized,
			},
			userID: userID,
		},
	}
	RunTests(&tests, t, &mockAPI)
}
