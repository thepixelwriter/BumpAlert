package com.bumpalert.app;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONException;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Persists bump reports captured by the background service until the JS layer drains them. */
final class ReportStore {

    private static final String FILE_NAME = "bump_background_reports.json";

    private ReportStore() {}

    static synchronized void append(Context context, org.json.JSONObject report) {
        JSONArray reports = readAll(context);
        reports.put(report);
        writeAll(context, reports);
    }

    /** Returns everything captured so far and clears the store. */
    static synchronized JSONArray drain(Context context) {
        JSONArray reports = readAll(context);
        writeAll(context, new JSONArray());
        return reports;
    }

    private static JSONArray readAll(Context context) {
        File file = new File(context.getFilesDir(), FILE_NAME);
        if (!file.exists()) {
            return new JSONArray();
        }
        try (FileInputStream inputStream = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int read = inputStream.read(bytes);
            if (read <= 0) {
                return new JSONArray();
            }
            return new JSONArray(new String(bytes, StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            return new JSONArray();
        }
    }

    private static void writeAll(Context context, JSONArray reports) {
        File file = new File(context.getFilesDir(), FILE_NAME);
        try (FileOutputStream outputStream = new FileOutputStream(file, false)) {
            outputStream.write(reports.toString().getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            // Best-effort persistence - a failed write here just means this one batch is lost.
        }
    }
}
