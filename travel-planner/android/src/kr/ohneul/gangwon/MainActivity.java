package kr.ohneul.gangwon;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 오늘강원 안드로이드 앱: 앱 파일(public/)을 APK 안(assets/www)에 넣고 웹뷰로 연다.
 * - 앱 파일은 https://appassets.androidplatform.net/ 주소로 APK 안에서 바로 읽어 준다 (인터넷 없이도 열림)
 * - 지도 타일·사진·날씨·도로 경로는 인터넷으로 받는다
 * - 서버 API(api/...)는 없으므로 404 → 앱이 간단 모드로 대체한다 (가게 등록은 숨김)
 * - 앱 밖 주소(카카오맵·네이버 등)는 휴대폰 브라우저나 해당 앱으로 연다
 * - "캘린더 저장"은 파일 대신 휴대폰 캘린더에 일정을 바로 넣는다 (웹뷰는 파일 내려받기를 못 함)
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_LOCATION = 1;
    private static final int REQ_FILE = 2;
    private static final int REQ_CALENDAR = 3;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private String pendingEvents; // 캘린더 권한을 묻는 동안 기다리는 일정 (JSON)

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
        MIME.put("txt", "text/plain");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0b5e6b"));

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);

        // 서비스 워커는 쓰지 않는다 (앱 파일이 이미 휴대폰 안에 있음)
        if (Build.VERSION.SDK_INT >= 24) {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return HOST.equals(request.getUrl().getHost()) ? notFound() : null;
                }
            });
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) return null; // 인터넷 (사진·지도·날씨)
                return asset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false; // 앱 안의 페이지
                openOutside(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                geoOrigin = origin;
                geoCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // 웹 화면의 window.OhneulApp.addToCalendar(json) → 휴대폰 캘린더에 일정 넣기
        web.addJavascriptInterface(new CalendarBridge(), "OhneulApp");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.startsWith("/api/") || path.equals("/sw.js")) return notFound();
        String name = path.substring(1);
        if (name.contains("..")) return notFound();
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            AssetManager am = getAssets();
            InputStream in = am.open("www/" + name);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "https://" + HOST);
            headers.put("Cache-Control", "no-cache");
            String charset = mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript") ? "utf-8" : null;
            return new WebResourceResponse(mime, charset, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
    }

    private void openOutside(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {
            // 열 수 있는 앱이 없으면 무시
        }
    }

    /** 웹 화면이 부르는 캘린더 다리. 일정: [{title, location, description, start(ms), end(ms)}] */
    public class CalendarBridge {
        @JavascriptInterface
        public void addToCalendar(final String json) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingEvents = json;
                    if (checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED
                            && checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
                        insertPending();
                    } else {
                        requestPermissions(new String[]{Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR}, REQ_CALENDAR);
                    }
                }
            });
        }
    }

    private void insertPending() {
        final String json = pendingEvents;
        pendingEvents = null;
        if (json == null) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                calendarDone(insertEvents(json));
            }
        }).start();
    }

    /** 결과를 웹 화면에 알린다: "ok:넣은수:전체수", "nocal", "denied", "error" */
    private void calendarDone(final String result) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript("window.__calendarDone && window.__calendarDone(" + JSONObject.quote(result) + ")", null);
            }
        });
    }

    private String insertEvents(String json) {
        try {
            long cal = pickCalendar();
            if (cal < 0) return "nocal";
            JSONArray arr = new JSONArray(json);
            ContentResolver cr = getContentResolver();
            int added = 0;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject e = arr.getJSONObject(i);
                long start = e.getLong("start"), end = e.getLong("end");
                String title = e.getString("title");
                // 같은 캘린더에 같은 시각·같은 이름이 이미 있으면 다시 넣지 않는다 (두 번 눌러도 중복 없음)
                Cursor c = cr.query(CalendarContract.Events.CONTENT_URI, new String[]{CalendarContract.Events._ID},
                        CalendarContract.Events.CALENDAR_ID + "=? AND " + CalendarContract.Events.DTSTART + "=? AND "
                                + CalendarContract.Events.TITLE + "=? AND " + CalendarContract.Events.DELETED + "=0",
                        new String[]{String.valueOf(cal), String.valueOf(start), title}, null);
                boolean exists = c != null && c.moveToFirst();
                if (c != null) c.close();
                if (exists) continue;
                ContentValues v = new ContentValues();
                v.put(CalendarContract.Events.CALENDAR_ID, cal);
                v.put(CalendarContract.Events.TITLE, title);
                v.put(CalendarContract.Events.EVENT_LOCATION, e.optString("location"));
                v.put(CalendarContract.Events.DESCRIPTION, e.optString("description"));
                v.put(CalendarContract.Events.DTSTART, start);
                v.put(CalendarContract.Events.DTEND, end);
                v.put(CalendarContract.Events.EVENT_TIMEZONE, "Asia/Seoul");
                if (cr.insert(CalendarContract.Events.CONTENT_URI, v) != null) added++;
            }
            return "ok:" + added + ":" + arr.length();
        } catch (Exception ex) {
            return "error";
        }
    }

    /** 일정을 넣을 캘린더: 보이고 쓸 수 있는 것 중 기본(isPrimary) 캘린더를 먼저 */
    private long pickCalendar() {
        Cursor c = getContentResolver().query(CalendarContract.Calendars.CONTENT_URI,
                new String[]{CalendarContract.Calendars._ID},
                CalendarContract.Calendars.VISIBLE + "=1 AND " + CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + ">=" + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR,
                null, CalendarContract.Calendars.IS_PRIMARY + " DESC, " + CalendarContract.Calendars._ID + " ASC");
        if (c == null) return -1;
        try {
            return c.moveToFirst() ? c.getLong(0) : -1;
        } finally {
            c.close();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_CALENDAR) {
            boolean ok = results.length > 0;
            for (int r : results) ok &= r == PackageManager.PERMISSION_GRANTED;
            if (ok) insertPending();
            else { pendingEvents = null; calendarDone("denied"); }
            return;
        }
        if (requestCode == REQ_LOCATION && geoCallback != null) {
            boolean ok = false;
            for (int r : results) ok |= r == PackageManager.PERMISSION_GRANTED;
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
