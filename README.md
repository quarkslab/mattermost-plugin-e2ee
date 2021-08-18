# Mattermost E2EE plugin

URL test: http://127.0.0.1:8065/plugins/com.quarkslab.mm-e2ee

## Development

### Environment

We make a build environment based on Mattermost's [local node docker](https://docs.mattermost.com/install/setting-up-local-machine-using-docker.html).

We adapt the `mattermost/mattermost-preview` image to add various things:

* enable local mode (see below)
* enable the creation of tokens
* enable the creation of accounts without invitations

The provided `docker/Dockerfile` will create a new docker image with these modifications.

First, build the image:

```
$ cd docker && docker build -t matterdev .
```

Then, run the Mattermost instance. We need to mount `/var/tmp` as an external
volume to get a Mattermost unix socket that will help easily deploy our plugin:

```
$ cd /path/to/project
$ docker run --name mminstance -d --publish 8065:8065 --add-host dockerhost:127.0.0.1 -v $PWD/docker/mattersock:/var/tmp/ matterdev 
```

It takes a few minutes to boot. You can then access the instance at `http://127.0.0.1:8065`. Create a user and a team.

The next step is to create a user token. Go to Account settings, Security and
add a new personnal token. This is needed to deploy the plugin (see below).

To rerun the docker container (if stopped), just do `docker start mminstance`. To
run a shell within this container, you can do `docker exec -it mminstance
/bin/bash`.

### Deploying

Based on [these instructions](https://github.com/mattermost/mattermost-plugin-starter-template#deploying-with-local-mode).

First, copy `dev.env.example` into `dev.example`, and setup the user token you
just created above. Then:

```
$ source dev.env
$ make watch
```

This will do two things:

* build the server plugin and upload it on the mattermost instance
* build the webapp, watch for changes and rebuild it when a file changes

Note that changing the server-side code requires at least doing `make deploy`
to build & deploy the changes.

### Build the plugin (release)

Build your plugin:
```
make
```

This will produce a single plugin file (with support for multiple
architectures) for upload to your Mattermost server:

```
dist/com.quarkslab.mm-e2ee.tar.gz
```

## Q&A

### How do I build the plugin with unminified JavaScript?
Setting the `MM_DEBUG` environment variable will invoke the debug builds. The simplist way to do this is to simply include this variable in your calls to `make` (e.g. `make dist MM_DEBUG=1`).
