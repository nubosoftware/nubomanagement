# Nubomanagement

Node.js management server with a REST API. Migrated from Restify to Express via a
compatibility layer. Connected modules (enterprise, mobile, desktop) are loaded
dynamically. Uses Redis, MySQL (Sequelize) and Winston logging.

## Key files

- `src/restserver.js` — main server setup (Express with the compat layer)
- `src/expressCompat.js` — Restify→Express compatibility middleware
- `src/common.js` — shared state/config (`Common` object)
- `src/plugin.js` — plugin system with dynamic route add/remove
- `src/parameters-map.js` — per-route parameter/header/body validation rules
  (enforced by `@nubosoftware/permission-parser`)
- `Makefile` — build targets for the deb/rpm packages and the Docker images

## Building the Docker images

The Docker build context is the repository root, and the Dockerfiles copy the
working-tree `src/` directly (`ADD src ...`) — so local, uncommitted changes are
included in the image. The image version/tag (`serv_version-serv_buildid`, e.g.
`3.2-136`) is derived from git: `serv_buildid` counts commits from the
`nubo_release_3.2` tag to `HEAD`, so each new commit bumps the build id.

### Mobile

```bash
# Build the TEST image, tag it as :test, and push it to the dev registry
# (docker.nubosoftware.com:5000/nubo/nubomanagement-mobile:test).
# Uses --build-arg dev=TRUE. Pushing is part of the target.
make docker-mobile-test

# Build a clean release image (--no-cache --pull), no push:
make docker-mobile

# Build + push versioned tags (:<version>-<buildid> and :<version>):
make push-mobile

# Also push the floating :latest tag:
make push-mobile-latest
```

`make docker-mobile-test` runs, in order:
1. `docker build -t nubomanagement-mobile:<ver>-<build> --build-arg dev=TRUE --build-arg BUILD_VER=<ver>-<build> -f docker_build/Dockerfile-mobile .`
2. `docker tag ... docker.nubosoftware.com:5000/nubo/nubomanagement-mobile:test`
3. `docker push docker.nubosoftware.com:5000/nubo/nubomanagement-mobile:test`

### Desktop / Enterprise (for reference)

```bash
make docker-desktop        # clean release build, no push
make docker-desktop-test   # dev build, tag :test, push to nubosoftware/nubomanagement
make push-desktop          # build + push versioned tags
make push-desktop-ent      # build + push the enterprise image
```

### Prerequisites

- The build context needs the `nubo-management-mobile/`, `nubo-management-enterprise/`,
  `scripts/` and `utils/` directories present (they are checked into the repo).
- Docker must be able to reach `docker.nubosoftware.com:5000` for the push step of
  the `*-test` / `push-*` targets.

## Express compatibility layer notes

- `req.params` uses a getter/setter (`Object.defineProperty`) because Express resets
  `req.params = layer.params` for every router layer.
- `req.path` and `app.name` are overridden via `Object.defineProperty`.
- Route methods are wrapped to return `{ _layer }` refs so `app.rm()` can remove routes.
- `app.del` is an alias of `app.delete`.

## Parameter validation (`src/parameters-map.js`)

Every public route is validated by `@nubosoftware/permission-parser` against the rule
for its path:

- `constraints` — whitelist for URL/query params (URL mode).
- `bodyConstraints` — whitelist for the POST body (BODY mode). If a path receives a
  body but defines no `bodyConstraints`, the request is rejected.
- `headerConstraints` — required/validated request headers.
- Any parameter not present in the relevant whitelist is rejected ("not in whitelist"),
  so external webhooks (e.g. Twilio's `/receiveSMS`) must whitelist every field the
  caller may send.
