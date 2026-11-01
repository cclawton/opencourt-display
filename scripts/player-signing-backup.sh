#!/bin/sh
# Interactive local key backup/verification. Never accepts a passphrase argument.
set -eu
umask 077
mode=${1:-}
[ "$#" -gt 0 ] && shift
private_key= public_key= output= backup=
while [ "$#" -gt 0 ]; do
    [ "$#" -ge 2 ] || { echo 'Missing option value.' >&2; exit 1; }
    case "$1" in
        --private-key) private_key=$2 ;;
        --public-key) public_key=$2 ;;
        --output) output=$2 ;;
        --backup) backup=$2 ;;
        *) echo 'Unknown option.' >&2; exit 1 ;;
    esac
    shift 2
done
[ "$mode" = create ] || [ "$mode" = verify ] || { echo 'Choose create or verify.' >&2; exit 1; }
[ -t 0 ] || { echo 'Run interactively in a local Terminal; enter passphrases only there.' >&2; exit 1; }
test -f "$public_key"
temporary=$(mktemp -d "${TMPDIR:-/tmp}/opencourt-key-check.XXXXXX")
encrypted=
cleanup() {
    [ -z "$encrypted" ] || rm -f "$encrypted"
    rm -rf "$temporary"
}
trap cleanup EXIT
openssl pkey -pubin -in "$public_key" -pubout -outform DER -out "$temporary/trusted.der"
if [ "$mode" = create ]; then
    test -f "$private_key"
    [ -n "$output" ] && [ ! -e "$output" ] && [ ! -L "$output" ] || { echo 'Choose a new backup filename.' >&2; exit 1; }
    test -d "$(dirname -- "$output")"
    openssl pkey -in "$private_key" -pubout -outform DER -out "$temporary/master.der"
    cmp -s "$temporary/master.der" "$temporary/trusted.der" || { echo 'Private key does not match the trusted device key.' >&2; exit 1; }
    encrypted=$(mktemp "$(dirname -- "$output")/.opencourt-encrypted-key.XXXXXX")
    echo 'Choose a strong backup passphrase at the OpenSSL prompt. Do not send it in chat.'
    openssl pkey -in "$private_key" -aes-256-cbc -out "$encrypted"
    backup=$encrypted
fi
test -f "$backup"
echo 'Re-enter the backup passphrase to test recovery.'
openssl pkey -in "$backup" -pubout -outform DER -out "$temporary/recovered.der"
cmp -s "$temporary/recovered.der" "$temporary/trusted.der" || { echo 'Recovered backup does not match the trusted device key.' >&2; exit 1; }
if [ "$mode" = create ]; then
    # Same-directory temporary file permits an atomic, no-overwrite hard link.
    ln "$encrypted" "$output"
    echo 'Encrypted backup created and verified against the trusted device key.'
    echo 'Copy it to a second device/medium and run verify against that copied file.'
else
    echo 'Copied encrypted backup verified against the trusted device key.'
fi
