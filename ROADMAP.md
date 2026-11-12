# Roadmap

The project is deliberately local-first. Work is prioritized when it improves PDF fidelity, privacy, accessibility, or device reliability without hiding a server upload behind a tool button.

## Near term

- Validate scanner capture, add-page editing, and biometric unlock on several physical Android devices.
- Add image-aware compression presets with visible quality and file-size tradeoffs.
- Add stronger end-to-end browser tests for protect, unlock, vault, and multi-file operations.
- Improve large-document memory limits and progress reporting.
- Add localization infrastructure and the first translated interface.

## Later

- Optional desktop companion for standards-compliant PDF/A conversion with Ghostscript and veraPDF validation.
- Certificate-backed digital signatures with a clearly separate trust model from visual signatures.
- More faithful office-document conversion through optional user-installed local tooling.
- Reproducible, signed Android release builds after the physical-device test matrix is complete.

## Non-goals

- Automatic cloud backup or background synchronization.
- Uploading original documents to a hosted conversion service.
- Claiming standards compliance or pixel-perfect office rendering without validation.
