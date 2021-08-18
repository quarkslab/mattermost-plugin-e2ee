package main

import (
	"crypto/elliptic"
	"fmt"
	"math/big"
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
