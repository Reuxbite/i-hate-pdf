# Security policy

## Supported version

The current `main` branch is the supported development version.

## Reporting

Use the repository's **Security** tab and choose **Report a vulnerability** for a private report. Do not open a public issue containing a private document, password, GitHub token, encrypted vault export, or proof-of-concept that includes personal data. Report the smallest reproducible case and remove secrets before sharing it.

## Security invariants

- No automatic upload or background synchronization.
- Only encrypted `.ihpdf` envelopes may be sent to GitHub.
- Web GitHub tokens are session-scoped; Android tokens use secure storage.
- Vault encryption must use a fresh salt and IV per object.
- Decryption failure must remain indistinguishable between a wrong password and authenticated-data tampering.
- PDF/A output must not be labelled compliant without external standards validation.
- Visual signatures must not be presented as certificate-backed digital signatures.
