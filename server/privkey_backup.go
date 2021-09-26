package main

import (
	"net/http"

	"github.com/mattermost/mattermost-server/v5/model"
)

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
