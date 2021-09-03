package main

import (
	"fmt"
	"strings"
	"sync"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"
	"github.com/pkg/errors"

	"github.com/gorilla/mux"
)

const (
	helpTextHeader = "###### Mattermost E2EE Plugin - Slash command help\n"
	helpText       = `
* |/e2ee help| - print this help message.
* |/e2ee init [--force] [gpg key fingerprint]| - initialize E2EE for your account. This will generate a new key for your session. Use --force to erase an exisiting key.
* |/e2ee activate| - encrypt the messages you send in this channel.
* |/e2ee deactivate| - do not encrypt the messages you send in this channel.
* |/e2ee import [private_key]| - import your private key into this device.
* |/e2ee show_backup| - show saved encrypted GPG backup.
`
	autoCompleteDescription = "Available commands: init import help"
	autoCompleteHint        = "[command][subcommands]"
	pluginDescription       = "End to end message encryption"
	slashCommandName        = "e2ee"
)

// Plugin implements the interface expected by the Mattermost server to communicate between the server and plugin processes.
type Plugin struct {
	plugin.MattermostPlugin

	BotUserID string

	ChanEncrMethods *ChanEncrMethodDB

	// configurationLock synchronizes access to the configuration.
	configurationLock sync.RWMutex

	// configuration is the active plugin configuration. Consult getConfiguration and
	// setConfiguration for usage.
	configuration *configuration

	router *mux.Router
}

// ServeHTTP demonstrates a plugin that handles HTTP requests by greeting the world.

func GetSlashCommand() *model.Command {
	return &model.Command{
		Trigger:          slashCommandName,
		DisplayName:      slashCommandName,
		Description:      pluginDescription,
		AutoComplete:     true,
		AutoCompleteDesc: autoCompleteDescription,
		AutoCompleteHint: autoCompleteHint,
	}
}

func (p *Plugin) OnActivate() error {
	p.InitializeAPI()

	err := p.API.RegisterCommand(GetSlashCommand())
	if err != nil {
		return errors.Wrap(err, "OnActivate: failed to register command")
	}

	botID, err := p.Helpers.EnsureBot(&model.Bot{
		Username:    "e2ee",
		DisplayName: "E2EE",
		Description: "Created by the E2EE plugin.",
	})
	if err != nil {
		return errors.Wrap(err, "failed to ensure E2EE bot")
	}
	p.BotUserID = botID

	return nil
}

func (p *Plugin) postCommandResponse(args *model.CommandArgs, text string) {
	post := &model.Post{
		UserId:    p.BotUserID,
		ChannelId: args.ChannelId,
		Message:   text,
	}
	_ = p.API.SendEphemeralPost(args.UserId, post)
}

func (p *Plugin) ShowGPGBackup(args *model.CommandArgs) *model.AppError {
	backupGPG, appErr := p.API.KVGet(StoreBackupGPGKey(args.UserId))
	if appErr != nil {
		return appErr
	}
	if backupGPG == nil {
		return &model.AppError{Message: "unable to find a GPG backup"}
	}
	p.postCommandResponse(args, string(backupGPG))
	return nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	split := strings.Fields(args.Command)
	command := split[0]
	// parameters := []string{}
	action := "help"
	if len(split) > 1 {
		action = split[1]
	}
	/*if len(split) > 2 {
		parameters = split[2:]
	}*/

	if command != "/e2ee" {
		return &model.CommandResponse{}, nil
	}

	if action == "help" {
		p.postCommandResponse(args, helpTextHeader+helpText)
		return &model.CommandResponse{}, nil
	}

	if action == "show_backup" {
		appErr := p.ShowGPGBackup(args)
		if appErr != nil {
			return &model.CommandResponse{}, appErr
		}
		return &model.CommandResponse{}, nil
	}

	return &model.CommandResponse{}, &model.AppError{Message: fmt.Sprintf("unknown command %v", action)}
}

// See https://developers.mattermost.com/extend/plugins/server/reference/
