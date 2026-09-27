#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
builder_dir=${RPI_IMAGE_GEN_DIR:-}

if [ -z "$builder_dir" ] || [ ! -x "$builder_dir/rpi-image-gen" ]; then
  printf '%s\n' 'Set RPI_IMAGE_GEN_DIR to an rpi-image-gen v2.6.0 checkout.' >&2
  printf '%s\n' 'The supported build host is 64-bit Raspberry Pi OS or Debian Trixie on ARM64.' >&2
  exit 2
fi

if [ -z "${OPENCOURT_APP_URL:-}" ]; then
  printf '%s\n' 'Set OPENCOURT_APP_URL to the deployed HTTPS application URL.' >&2
  exit 2
fi

exec "$builder_dir/rpi-image-gen" build \
  -S "$script_dir" \
  -c opencourt.yaml \
  -- "IGconf_opencourt_app_url=$OPENCOURT_APP_URL"
