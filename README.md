# Dola Studio — custom modular build

Account, proxy and video-task console with compatible management and video APIs.
See CUSTOM_LICENSE.md, THIRD_PARTY_NOTICES.md, NOTICE.md and LICENSE before redistribution; this is a derivative build.

## Run
Use Linux with Python 3.11+ and install requirements.txt in an isolated virtual environment.
The managed-account browser uses Linux file locks; Windows is not a supported production host.
CloakBrowser is pinned to the 0.6.3 runtime used by this acceptance run. Browser binaries, Xvfb,
FFmpeg, proxy configuration and private account data must be prepared separately.
A completely fresh Linux installation has not been acceptance-tested in this run.
Configure the existing DOLA_* environment variables and private data locations.
Start with `uvicorn server:app --host 127.0.0.1 --port 8002`. Do not expose
administrator APIs without authentication and appropriate network controls.

## Layout
- web/index.html: shell, no embedded business JavaScript or stylesheet.
- web/app/manifest.json: ordered classic-script modules; boot is last.
- web/app/request-client.js: coalesced reads, typed failures, no write retries.
- studio_views.py: public privacy allowlist and account-group projections.
- web/docs/: local operator guides, no dependency on external project links.

## Updating
Automatic upstream installation is off by default. Set DOLA_UPDATE_REPO only
to a trusted compatible release channel. Existing deploy/docker scripts are
legacy infrastructure compatibility tools, not a new custom-build release feed.
Do not run them blindly over this customized distribution.

Account/session/env/export identifiers remain compatible. Chat and work mode,
15-second options and the disabled-by-default upscale gate are preserved.
Unit tests use controlled dependencies and do not prove live generation.
The 2026-11-25 acceptance run additionally used real browser clicks, management APIs,
persisted task state and actual video playback. See docs/LIVE-ACCEPTANCE.md for its coverage
and remaining limits; a successful example is not a stability-rate measurement.

## Read synchronization
StudioRefresh schedules per-resource reads. Automatic failures back off from
2s up to 30s; explicit manual refresh bypasses that delay and, when a read is
already running, queues one additional read of the original tab. Offline/hidden
background reads are skipped. No mutation/generation retries are introduced.
