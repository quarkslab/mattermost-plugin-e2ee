package main

import (
	"crypto/elliptic"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"

	"github.com/mattermost/mattermost-server/v5/model"
)

var ECCurve = elliptic.P256()

func StoreKeyPubKey(userID string) string {
	return fmt.Sprintf("pubkey:%s", userID)
}

func StoreBackupGPGKey(userID string) string {
	return fmt.Sprintf("backup_gpg:%s", userID)
}

type PubKey struct {
	Encr []byte `json:"sign"`
	Sign []byte `json:"encr"`
}

type ECPoint struct {
	x big.Int
	y big.Int
}

func (pt *ECPoint) Equals(o *ECPoint) bool {
	return pt.x.Cmp(&o.x) == 0 && pt.y.Cmp(&o.y) == 0
}

// https://neilmadden.blog/2017/05/17/so-how-do-you-validate-nist-ecdh-public-keys/
func ValidateECPoint(data []byte) *ECPoint {
	ECParams := ECCurve.Params()
	CL := ECParams.BitSize / 8
	if len(data) != 2*CL+1 {
		return nil
	}
	if data[0] != 0x04 {
		// We only support uncompressed points
		return nil
	}
	// SetBytes considers integer as big-endian
	x := big.Int{}
	y := big.Int{}
	x.SetBytes(data[1:(CL + 1)])
	y.SetBytes(data[(1 + CL):])

	// Check that no coordinate is zero
	zero := big.NewInt(0)
	if x.Cmp(zero) == 0 || y.Cmp(zero) == 0 {
		return nil
	}

	// Check that x < N && y < N
	N := ECParams.N
	// x.Cmp(N) >= 0 <=> x >= N
	if x.Cmp(N) >= 0 || y.Cmp(N) >= 0 {
		return nil
	}

	if !ECCurve.IsOnCurve(&x, &y) {
		return nil
	}

	// Check that N*P == 0
	Nbytes := make([]byte, CL)
	N.FillBytes(Nbytes)
	tx, ty := ECCurve.ScalarMult(&x, &y, Nbytes)
	if tx.Cmp(zero) != 0 || ty.Cmp(zero) != 0 {
		return nil
	}
	return &ECPoint{x, y}
}

func (pubkey *PubKey) Validate() bool {
	encr := ValidateECPoint(pubkey.Encr)
	if encr == nil {
		return false
	}
	sign := ValidateECPoint(pubkey.Sign)
	if sign == nil {
		return false
	}
	// encr & sign must be different
	return !encr.Equals(sign)
}

func (p *Plugin) SetUserPubKey(userID string, pk *PubKey) error {
	pubkeyData, err := json.Marshal(pk)
	if err != nil {
		return err
	}

	appErr := p.API.KVSet(StoreKeyPubKey(userID), pubkeyData)
	if appErr != nil {
		return errors.New(appErr.Error())
	}
	return nil
}

func (p *Plugin) GetUserPubKey(userID string) (*PubKey, error) {
	pubkeyJSON, appErr := p.API.KVGet(StoreKeyPubKey(userID))
	if appErr != nil {
		return nil, errors.New(appErr.Error())
	}
	if pubkeyJSON == nil {
		return nil, nil
	}
	var pubkey PubKey
	err := json.Unmarshal(pubkeyJSON, &pubkey)
	if err != nil {
		return nil, err
	}
	return &pubkey, nil
}

func (p *Plugin) HasUserPubKey(userID string) (bool, *model.AppError) {
	pk, appErr := p.API.KVGet(StoreKeyPubKey(userID))
	if appErr != nil {
		return false, appErr
	}
	return pk != nil, nil
}

func (p *Plugin) GetChannelMembersWithoutKeys(chanID string) ([]string, *model.AppError) {
	ret := make([]string, 0)

	cfg := p.API.GetConfig()
	maxUsersPerTeam := *cfg.TeamSettings.MaxUsersPerTeam
	members, appErr := p.API.GetChannelMembers(chanID, 0, maxUsersPerTeam)
	if appErr != nil {
		return ret, appErr
	}

	for _, member := range *members {
		userID := member.UserId
		hasKey, appErr := p.HasUserPubKey(userID)
		if appErr != nil {
			return ret, appErr
		}
		if !hasKey {
			ret = append(ret, userID)
		}
	}
	return ret, nil
}
