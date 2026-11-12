# Architecture

I Hate PDF is one React and TypeScript codebase delivered in two shells.

```text
React UI and tool registry
        |
        +-- browser workers and local libraries
        |     pdf-lib | PDF.js | QPDF WASM | Tesseract.js
        |
        +-- IndexedDB encrypted vault
        |     PBKDF2-SHA-256 -> AES-GCM-256 envelope
        |
        +-- explicit GitHub Contents API sync
        |     encrypted .ihpdf objects only
        |
        +-- Capacitor Android shell
              secure storage | biometric prompt | file share
              native Google ML Kit document scanner
```

## Processing boundary

The app has no conversion backend. Browser and WebView memory hold active documents. An original document leaves the device only if a user deliberately moves it through some external browser or operating-system action; the built-in cloud path accepts encrypted vault envelopes, not plaintext originals.

## Vault format

Each item receives a new random 16-byte salt and 12-byte IV. PBKDF2-SHA-256 derives a 256-bit AES key from the vault password with 310,000 iterations. AES-GCM authenticates both ciphertext and identity metadata, including the format version, item ID, filename, and MIME type.

## Android bridge

Capacitor supplies application lifecycle, filesystem, sharing, secure storage, and biometric APIs. A small native plugin starts Google Play services' document-scanner activity, returns scanned page images, and lets the TypeScript layer arrange, name, and export the final PDF.

## Cloud model

Cloud storage is opt-in and manual. The user supplies coordinates for a private repository and a fine-grained token restricted to Contents read/write. Web tokens live in `sessionStorage`; Android tokens use secure storage. The app never schedules background synchronization.
