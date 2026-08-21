package com.bumpalert.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Bridges the JS SensorDetectionService to the native BumpDetectionService, which keeps
 * accelerometer + GPS sampling alive while the app is minimized. Android suspends WebView JS
 * in the background the same way a browser tab is throttled, so this can't live purely in TS.
 */
@CapacitorPlugin(
    name = "BackgroundBumpDetection",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
            alias = "location"
        ),
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class BackgroundBumpDetectionPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "onLocationPermissionResult");
            return;
        }
        requestBackgroundLocationIfNeeded(call);
    }

    @PermissionCallback
    private void onLocationPermissionResult(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission is required for background bump detection.");
            return;
        }
        requestBackgroundLocationIfNeeded(call);
    }

    /** Android 10+ requires background location to be requested in a separate step from foreground location. */
    private void requestBackgroundLocationIfNeeded(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("backgroundLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "onBackgroundLocationPermissionResult");
            return;
        }
        requestNotificationsIfNeeded(call);
    }

    @PermissionCallback
    private void onBackgroundLocationPermissionResult(PluginCall call) {
        // Background location may still end up denied (e.g. user picked "While using the app") -
        // the foreground service still runs, just without fresh GPS once the screen is off.
        requestNotificationsIfNeeded(call);
    }

    private void requestNotificationsIfNeeded(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "onNotificationsPermissionResult");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void onNotificationsPermissionResult(PluginCall call) {
        // The foreground service's ongoing notification is required by Android regardless of this outcome.
        startService(call);
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), BumpDetectionService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BumpDetectionService.class));
        call.resolve();
    }

    @PluginMethod
    public void drainReports(PluginCall call) {
        JSONArray stored = ReportStore.drain(getContext());
        JSArray reports = new JSArray();
        for (int i = 0; i < stored.length(); i++) {
            try {
                reports.put(stored.getJSONObject(i));
            } catch (JSONException e) {
                // Skip a malformed entry rather than dropping the whole drain.
            }
        }
        JSObject result = new JSObject();
        result.put("reports", reports);
        call.resolve(result);
    }
}
