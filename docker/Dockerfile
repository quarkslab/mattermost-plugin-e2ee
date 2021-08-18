FROM mattermost/mattermost-preview
COPY config_docker.json /mm/mattermost/config/config_docker.json
WORKDIR /mm
ENTRYPOINT ["/bin/sh","-c","./docker-entry.sh"]
