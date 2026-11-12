package dev.ihatepdf.app;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(
    name = "DocumentScanner",
    requestCodes = { DocumentScannerPlugin.SCAN_REQUEST_CODE },
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class DocumentScannerPlugin extends Plugin {
    static final int SCAN_REQUEST_CODE = 7284;
    private String activeMode = "document";

    @PluginMethod
    public void scan(PluginCall call) {
        if (getSavedCall() != null) {
            call.reject("A document scan is already open.");
            return;
        }

        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }

        openScanner(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            openScanner(call);
        } else {
            call.reject("Camera permission is required to scan. Allow Camera in Android Settings, then try again.");
        }
    }

    private void openScanner(PluginCall call) {
        String requestedMode = call.getString("mode", "document");
        activeMode = requestedMode == null ? "document" : requestedMode.toLowerCase(Locale.US);
        int defaultLimit = activeMode.equals("id") ? 2 : 24;
        int pageLimit = Math.max(1, Math.min(50, call.getInt("pageLimit", defaultLimit)));
        int scannerMode = activeMode.equals("id")
            ? GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER
            : GmsDocumentScannerOptions.SCANNER_MODE_FULL;

        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(pageLimit)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(scannerMode)
            .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);

        saveCall(call);
        scanner.getStartScanIntent(getActivity())
            .addOnSuccessListener(intentSender -> {
                try {
                    getActivity().startIntentSenderForResult(intentSender, SCAN_REQUEST_CODE, null, 0, 0, 0);
                } catch (IntentSender.SendIntentException exception) {
                    rejectActiveCall("Could not open the Android document scanner.", exception);
                }
            })
            .addOnFailureListener(exception -> rejectActiveCall(
                "Android document scanner is unavailable. Confirm Google Play services is installed and up to date.",
                exception
            ));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != SCAN_REQUEST_CODE) return;
        PluginCall call = getSavedCall();
        if (call == null) return;

        if (resultCode != Activity.RESULT_OK || data == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            cancelled.put("pages", new JSArray());
            call.resolve(cancelled);
            clearActiveCall();
            return;
        }

        try {
            GmsDocumentScanningResult result = GmsDocumentScanningResult.fromActivityResultIntent(data);
            if (result == null || result.getPages() == null || result.getPages().isEmpty()) {
                throw new IOException("The scanner did not return any pages.");
            }

            List<GmsDocumentScanningResult.Page> scannedPages = result.getPages();
            File sessionDirectory = new File(
                getContext().getCacheDir(),
                "document-scans" + File.separator + UUID.randomUUID()
            );
            if (!sessionDirectory.mkdirs() && !sessionDirectory.isDirectory()) {
                throw new IOException("Could not prepare scan storage.");
            }

            JSArray pages = new JSArray();
            for (int index = 0; index < scannedPages.size(); index++) {
                String name = pageName(index, scannedPages.size());
                File destination = new File(sessionDirectory, name);
                copyUri(scannedPages.get(index).getImageUri(), destination);
                JSObject page = new JSObject();
                page.put("uri", Uri.fromFile(destination).toString());
                page.put("name", name);
                page.put("size", destination.length());
                pages.put(page);
            }

            JSObject payload = new JSObject();
            payload.put("cancelled", false);
            payload.put("mode", activeMode);
            payload.put("pages", pages);
            call.resolve(payload);
        } catch (Exception exception) {
            call.reject("Could not read the scanned pages.", exception);
        } finally {
            clearActiveCall();
        }
    }

    private String pageName(int index, int count) {
        if (activeMode.equals("id")) {
            if (index == 0) return "id-front.jpg";
            if (index == 1) return "id-back.jpg";
        }
        String prefix = activeMode.equals("pdf") ? "pdf-page" : "document-page";
        int digits = Math.max(2, String.valueOf(count).length());
        return String.format(Locale.US, "%s-%0" + digits + "d.jpg", prefix, index + 1);
    }

    private void copyUri(Uri source, File destination) throws IOException {
        try (
            InputStream input = getContext().getContentResolver().openInputStream(source);
            OutputStream output = new FileOutputStream(destination)
        ) {
            if (input == null) throw new IOException("The scanned page could not be opened.");
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        }
    }

    private void rejectActiveCall(String message, Exception exception) {
        PluginCall call = getSavedCall();
        if (call != null) call.reject(message, exception);
        clearActiveCall();
    }

    private void clearActiveCall() {
        savedLastCall = null;
    }
}
