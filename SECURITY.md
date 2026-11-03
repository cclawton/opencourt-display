# Security policy

Do not report vulnerabilities in a public issue when they could expose a club device, account or member information. Contact the repository owner privately through their GitHub profile until a dedicated security-reporting address is published.

Never commit:

- Wi-Fi credentials.
- Google service-account JSON keys.
- Google, Raspberry Pi, Tapo or administrator passwords.
- Private presentation exports.
- Member booking information.

Local appliance audits and backups may contain Wi-Fi credentials, device tokens, private records or presentation links. Keep them outside public source/deployment bundles, protect their storage and exclude them from Git. Never force-add a private backup; transfer it only through an approved secure channel.

The public demonstration is not a production administration endpoint. It deliberately stores configuration only in the visitor's browser and accepts no credentials.
