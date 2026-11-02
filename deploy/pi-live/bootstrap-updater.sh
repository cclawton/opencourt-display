#!/bin/sh
# One-time root installation. No OS/package, network or enrolment changes.
set -eu
payload=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec /usr/bin/python3 -B "$payload/bootstrap_install.py" install --payload "$payload"
