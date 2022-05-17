FROM mattermost/mattermost-preview:6.1.0
COPY config_docker.json /mm/mattermost/config/config_docker.json
WORKDIR /mm
ENTRYPOINT ["/bin/sh","-c","./docker-entry.sh"]
