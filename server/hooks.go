package main

import (
	"fmt"

	"github.com/mattermost/mattermost-server/v5/model"
	"github.com/mattermost/mattermost-server/v5/plugin"
)

func (p *Plugin) MessageWillBePosted(c *plugin.Context, post *model.Post) (*model.Post, string) {
	// Bypass for our bot
	if post.UserId == p.BotUserID {
		return nil, ""
	}

	// Nothing to further check if we are not encrypting that channel
	encrMeth := p.KVGetChanEncryptionMethod(post.ChannelId)
	if encrMeth == ChanEncryptionMethodNone {
		return nil, ""
	}

	// If configured to do so, bypass for all bots
	if p.getConfiguration().BotCanAlwaysPost {
		user, appErr := p.API.GetUser(post.UserId)
		if appErr != nil {
			return nil, fmt.Sprintf("unable to check if user is a bot: %s", appErr.Error())
		}
		if user.IsBot {
			return nil, ""
		}
	}

	// If the message is not encrypted, rejects it!
	if post.Type != "custom_e2ee" {
		return nil, "Unencrypted messages can't be sent on an encrypted channel."
	}

	return nil, ""
}
