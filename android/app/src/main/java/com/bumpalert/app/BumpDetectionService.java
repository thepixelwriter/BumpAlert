package com.bumpalert.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps sampling the accelerometer and GPS while the app is minimized (not killed). Android
 * suspends WebView JS execution in the background just like a browser tab, so this detection
 * logic runs natively here; results are drained by the JS layer once the app is foregrounded
 * again (see BackgroundBumpDetectionPlugin and SensorDetectionService.drainNativeBackgroundReports).
 */
public class BumpDetectionService extends Service implements SensorEventListener, LocationListener {

    static final String CHANNEL_ID = "bump_detection_channel";
    private static final int NOTIFICATION_ID = 4821;

    private static final double GRAVITY_G = 9.80665;
    private static final double MODERATE_G_THRESHOLD = 1.8;
    private static final double SEVERE_G_THRESHOLD = 2.2;
    private static final long DETECTION_COOLDOWN_MS = 2000;

    private SensorManager sensorManager;
    private LocationManager locationManager;
    private Location lastLocation;
    private long lastDetectionAt = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());
        startSensing();
        return START_STICKY;
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Bump detection",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps monitoring for road bumps while BumpAlert is minimized.");
            manager.createNotificationChannel(channel);
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BumpAlert is monitoring")
            .setContentText("Watching for bumps in the background.")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .build();
    }

    private void startSensing() {
        Sensor accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
        }

        boolean hasLocationPermission = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (hasLocationPermission) {
            lastLocation = getBestLastKnownLocation();
            requestLocationUpdatesSafely();
        }
    }

    private Location getBestLastKnownLocation() {
        Location best = null;
        for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
            try {
                Location candidate = locationManager.getLastKnownLocation(provider);
                if (candidate != null && (best == null || candidate.getTime() > best.getTime())) {
                    best = candidate;
                }
            } catch (SecurityException | IllegalArgumentException ignored) {
                // Provider unavailable or permission revoked mid-flight - keep whatever we already have.
            }
        }
        return best;
    }

    private void requestLocationUpdatesSafely() {
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 5, this, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000, 5, this, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) {
            // Permission was revoked between the check above and this call - detection continues without GPS.
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        sensorManager.unregisterListener(this);
        try {
            locationManager.removeUpdates(this);
        } catch (SecurityException ignored) {
            // Nothing to clean up if permission was already revoked.
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        lastLocation = location;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        double z = event.values[2];
        double gForce = Math.abs(Math.abs(z) - GRAVITY_G) / GRAVITY_G;

        long now = System.currentTimeMillis();
        if (now - lastDetectionAt < DETECTION_COOLDOWN_MS) {
            return;
        }

        String severity = null;
        if (gForce >= SEVERE_G_THRESHOLD) {
            severity = "severe";
        } else if (gForce >= MODERATE_G_THRESHOLD) {
            severity = "moderate";
        }
        if (severity == null || lastLocation == null) {
            return;
        }

        lastDetectionAt = now;
        recordReport(gForce, severity);
    }

    private void recordReport(double gForce, String severity) {
        long timestamp = System.currentTimeMillis();
        try {
            JSONObject report = new JSONObject();
            report.put("id", timestamp + "-" + Math.round(gForce * 1000));
            report.put("latitude", lastLocation.getLatitude());
            report.put("longitude", lastLocation.getLongitude());
            report.put("timestamp", timestamp);
            report.put("gForce", gForce);
            report.put("severity", severity);
            ReportStore.append(getApplicationContext(), report);
        } catch (JSONException e) {
            // Malformed report - skip rather than crash the background service.
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
