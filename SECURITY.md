# Security policy

Do not report vulnerabilities in a public issue when they could expose a club device, account or member information. Contact the repository owner privately through their GitHub profile until a dedicated security-reporting address is published.

Never commit:

- Wi-Fi credentials.
- Google service-account JSON keys.
- Google, Raspberry Pi, Tapo or administrator passwords.
- Private presentation exports.
- Member booking information.

The local `.private-pi-audit/` folder contains a backup of the club's existing Pi configuration, including a plaintext Wi-Fi credential and published presentation URLs. It is Git-ignored but not encrypted. Never force-add, publish, or include it in deployment bundles; transfer it separately through a secure channel if needed on another development machine.

The public demonstration is not a production administration endpoint. It deliberately stores configuration only in the visitor's browser and accepts no credentials.
