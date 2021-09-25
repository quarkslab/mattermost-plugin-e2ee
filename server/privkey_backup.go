package main

import (
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/mattermost-server/v5/model"
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

func GpgServerExtractFirstNotRevokedID(gpgKeyServer string, email string) (string, error) {
	resp, err := http.Get(fmt.Sprintf("%s/pks/lookup?op=index&options=mr&search=%s", gpgKeyServer, url.QueryEscape(email)))
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
			return i.KeyID, nil
		}
	}
	return "", fmt.Errorf("no valid key found")
}

func (p *Plugin) SendGPGBackup(userID string) *model.AppError {
	user, appErr := p.API.GetUser(userID)
	if appErr != nil {
		return appErr
	}

	backupGPG, appErr := p.GetGPGBackup(userID)
	if appErr != nil {
		return appErr
	}

	if backupGPG == nil {
		return model.NewAppError("SendGPGBackup", "mm-e2ee.no_backup", nil, "", http.StatusNotFound)
	}

	return p.API.SendMail(user.Email, "Mattermost E2EE private key backup", "<pre>"+*backupGPG+"</pre>")
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

func (p *Plugin) StoreGPGBackup(userID string, backupGPG string) *model.AppError {
	return p.API.KVSet(StoreBackupGPGKey(userID), []byte(backupGPG))
}

func (p *Plugin) DeleteGPGBackup(userID string) *model.AppError {
	return p.API.KVDelete(StoreBackupGPGKey(userID))
}

func (p *Plugin) GetGPGBackup(userID string) (*string, *model.AppError) {
	data, appErr := p.API.KVGet(StoreBackupGPGKey(userID))
	if appErr != nil {
		return nil, appErr
	}
	ret := string(data)
	return &ret, nil
}
