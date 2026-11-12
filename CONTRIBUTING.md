# Contributing

Thanks for improving I Hate PDF. Focused bug fixes, tests, accessibility work, translations, and honest local-first PDF features are welcome.

## Before opening a change

1. Search existing issues and discussions.
2. Open an issue for a large behavior or architecture change before investing in implementation.
3. Never share a real private document, password, GitHub token, encrypted vault export, signing key, keystore, or personal data. Build a synthetic fixture instead.

## Local checks

Use Node.js 22 or newer.

```bash
npm ci
npm test
npm run build
```

For Android changes:

```bash
npm run android:sync
cd android
./gradlew assembleDebug
```

## Design constraints

- Preserve the Nothing-inspired dark grid and dense desktop workbench.
- Every tool must have a visible name and concise explanation.
- Original files stay local unless the user initiates an encrypted upload.
- Cloud actions are manual; never add auto-save or background sync.
- Do not imply that a structural browser conversion reproduces proprietary office rendering.
- Keep keyboard navigation, reduced-motion preferences, touch targets, safe areas, and Android Back behavior working.

## Pull requests

Keep each pull request focused. Explain the result, list exact verification, and include before/after screenshots for visible UI changes. A passing build is not evidence for an Android interaction, scanner flow, or visual result; test those separately when your change touches them.
