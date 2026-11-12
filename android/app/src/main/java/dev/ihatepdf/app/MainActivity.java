package dev.ihatepdf.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsetsController;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    @SuppressWarnings("deprecation")
    public void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        registerPlugin(DocumentScannerPlugin.class);
        super.onCreate(savedInstanceState);

        applySystemBarStyle();
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarStyle() {
        int systemBarColor = Color.rgb(17, 18, 18);
        getWindow().getDecorView().setBackgroundColor(systemBarColor);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
        } else {
            getWindow().setStatusBarColor(systemBarColor);
            getWindow().setNavigationBarColor(systemBarColor);
        }
        getWindow().setNavigationBarDividerColor(systemBarColor);

        WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) {
            controller.setSystemBarsAppearance(
                0,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applySystemBarStyle();
        }
    }
}
