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
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Base64;
import java.io.OutputStream;
import android.provider.CalendarContract;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.Locale;
import java.util.ArrayList;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
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
 * 보폭 안드로이드 앱: 앱 파일(public/)을 APK 안(assets/www)에 넣고 웹뷰로 연다.
 * - 앱 파일은 https://appassets.androidplatform.net/ 주소로 APK 안에서 바로 읽어 준다 (인터넷 없이도 열림)
 * - 지도 타일·사진·날씨·도로 경로는 인터넷으로 받는다
 * - 서버 API(api/...)는 없으므로 404 → 앱이 간단 모드로 대체한다 (가게 등록은 숨김)
 * - 앱 밖 주소(카카오맵·네이버 등)는 휴대폰 브라우저나 해당 앱으로 연다
 * - "캘린더 저장"은 파일 대신 휴대폰 캘린더에 일정을 바로 넣는다 (웹뷰는 파일 내려받기를 못 함)
 * - 정산 서류: 파일 저장은 "저장할 곳 고르기"(ACTION_CREATE_DOCUMENT), 인쇄·PDF는 PrintManager로
 * - "말하기"는 웹뷰에 음성 인식이 없어서 휴대폰 기본 음성 인식(RecognizerIntent)을 열고 결과를 window.__voiceResult로 넘긴다
 *   (음성 인식 앱이 마이크를 다루므로 이 앱은 마이크 권한이 필요 없다)
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int REQ_LOCATION = 1;
    private static final int REQ_FILE = 2;
    private static final int REQ_CALENDAR = 3;
    private static final int REQ_VOICE = 4;
    private static final int REQ_NOTIFY = 5;
    private static final int REQ_SAVE = 6;
    private static final int REQ_TREE = 7;
    private String pendingMany; // 폴더를 고르는 동안 기다리는 여러 파일 (안드로이드 9 이하)
    private boolean pendingShare;
    private byte[] pendingFile; // "저장할 곳"을 고르는 동안 기다리는 파일
    private TextToSpeech tts;   // 일정 읽어 주기 (휴대폰 음성 엔진)
    private boolean ttsReady;
    private String pendingSpeech, pendingLang;
    private String pendingReminders; // 알림 권한을 묻는 동안 기다리는 알림 목록 (JSON)

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
        web = new WebView(this);
        // 화면 가장자리까지 그리기(안드로이드 15부터 기본, 16(targetSdk 36)부터는 끌 수 없음):
        // 웹 화면을 상태바·내비게이션바·카메라 구멍만큼 안쪽으로 들이고, 그 띠는 앱 색으로 칠한다
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#34479a"));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    android.graphics.Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    v.setPadding(b.left, b.top, b.right, b.bottom);
                    return WindowInsets.CONSUMED;
                }
            });
            WindowInsetsController c = w.getInsetsController();
            if (c != null) c.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS); // 진한 띠 위 흰 아이콘
        } else {
            w.setStatusBarColor(Color.parseColor("#34479a"));
        }
        // 뒤로 가기 (안드로이드 13부터 OnBackInvokedCallback, 16(targetSdk 36)부터는 onBackPressed가 불리지 않는다)
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, new OnBackInvokedCallback() {
                @Override
                public void onBackInvoked() { handleBack(); }
            });
        }

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

    /** 웹 화면이 부르는 다리: 캘린더 넣기, 음성 인식. 일정: [{title, location, description, start(ms), end(ms)}] */
    public class CalendarBridge {
        @JavascriptInterface
        public boolean hasLocation() {
            // 3D 화면: 위치를 이미 허용했으면 열 때 묻지 않고 바로 내 위치를 확인한다 (웹뷰는 허용 여부를 웹에 알려 주지 않는다)
            return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public boolean hasVoice() {
            return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).resolveActivity(getPackageManager()) != null;
        }

        @JavascriptInterface
        public void startVoice(final String lang) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.isEmpty() ? "ko-KR" : lang);
                    i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                    i.putExtra(RecognizerIntent.EXTRA_PROMPT, "ko-KR".equals(lang) || lang == null ? "여행을 말해 주세요" : "");
                    try {
                        startActivityForResult(i, REQ_VOICE);
                    } catch (Exception e) {
                        voiceDone("");
                    }
                }
            });
        }

        /** 여행 당일 출발 알림 예약: [{at(ms), title, text}] → window.__remindDone("ok:예약수" | "denied" | "error") */
        @JavascriptInterface
        public void scheduleReminders(final String json) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                        pendingReminders = json;
                        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFY);
                        return;
                    }
                    int n = ReminderReceiver.schedule(MainActivity.this, json);
                    remindDone(n < 0 ? "error" : "ok:" + n);
                }
            });
        }

        /** 파일 저장 (웹뷰는 내려받기를 못 하므로): 저장할 곳을 고르게 한 뒤 쓴다 → window.__saveDone("ok" | "cancel" | "error") */
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String base64) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        pendingFile = Base64.decode(base64, Base64.DEFAULT);
                        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                        i.putExtra(Intent.EXTRA_TITLE, name);
                        startActivityForResult(i, REQ_SAVE);
                    } catch (Exception e) {
                        pendingFile = null;
                        saveDone("error");
                    }
                }
            });
        }

        /** 여러 파일 한 번에 저장: [{name, mime, data(base64)}] → 다운로드/보폭 정산 폴더 (안드로이드 10+), 9 이하는 폴더를 골라서
         *  끝나면 window.__saveDone("saved:개수" | "cancel" | "error") */
        @JavascriptInterface
        public void saveFiles(final String json) { saveMany(json, false); }

        /** 여러 파일을 저장한 뒤 휴대폰 공유 창으로 (카카오톡·메일·드라이브에 바로 첨부) */
        @JavascriptInterface
        public void shareFiles(final String json) { saveMany(json, true); }

        /** 지금 화면 인쇄 (PDF로 저장 포함) */
        @JavascriptInterface
        public void printPage(final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                    if (pm == null || web == null) return;
                    String t = title == null || title.isEmpty() ? "보폭" : title;
                    pm.print(t, web.createPrintDocumentAdapter(t), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                }
            });
        }

        /** 일정 읽어 주기: 휴대폰 음성 엔진으로 읽고, 다 읽으면 window.__speakDone() */
        @JavascriptInterface
        public void speak(final String text, final String lang) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingSpeech = text;
                    pendingLang = lang;
                    if (tts == null) {
                        tts = new TextToSpeech(MainActivity.this, new TextToSpeech.OnInitListener() {
                            @Override
                            public void onInit(int status) {
                                ttsReady = status == TextToSpeech.SUCCESS;
                                if (!ttsReady) { speakDone(); return; }
                                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                                    @Override public void onStart(String id) { }
                                    @Override public void onDone(String id) { if ("last".equals(id)) speakDone(); }
                                    @Override public void onError(String id) { speakDone(); }
                                });
                                speakPending();
                            }
                        });
                    } else if (ttsReady) {
                        speakPending();
                    }
                }
            });
        }

        @JavascriptInterface
        public void stopSpeak() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (tts != null) tts.stop();
                }
            });
        }

        @JavascriptInterface
        public void cancelReminders() {
            ReminderReceiver.cancelAll(MainActivity.this);
        }

        @JavascriptInterface
        public boolean hasReminders() {
            return true;
        }

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

    /** 기다리던 글을 읽는다. 엔진 한도(보통 4000자)를 넘지 않게 문장 단위로 나눠 차례로 넣는다 */
    private void speakPending() {
        String text = pendingSpeech;
        pendingSpeech = null;
        if (tts == null || text == null) return;
        tts.setLanguage(Locale.forLanguageTag(pendingLang == null || pendingLang.isEmpty() ? "ko-KR" : pendingLang));
        tts.setSpeechRate(0.9f);
        int max = Math.max(200, TextToSpeech.getMaxSpeechInputLength() - 10);
        java.util.List<String> parts = new java.util.ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String sentence : text.split("(?<=[.!?。])\\s+")) {
            if (cur.length() + sentence.length() + 1 > max && cur.length() > 0) { parts.add(cur.toString()); cur.setLength(0); }
            cur.append(sentence).append(' ');
        }
        if (cur.length() > 0) parts.add(cur.toString());
        for (int i = 0; i < parts.size(); i++) {
            tts.speak(parts.get(i), i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, i == parts.size() - 1 ? "last" : "part" + i);
        }
    }

    private void speakDone() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript("window.__speakDone && window.__speakDone()", null);
            }
        });
    }

    private void saveMany(final String json, final boolean share) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT >= 29) { writeToDownloads(json, share); return; }
                // 안드로이드 9 이하: 저장할 폴더를 한 번 고르게 한다 (권한 없이)
                pendingMany = json; pendingShare = share;
                try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_TREE); }
                catch (Exception e) { pendingMany = null; saveDone("error"); }
            }
        });
    }

    /** 안드로이드 10+: MediaStore 다운로드/보폭 정산 폴더에 쓰고, 공유면 그 파일들로 공유 창을 연다 */
    private void writeToDownloads(final String json, final boolean share) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONArray arr = new JSONArray(json);
                    final ArrayList<Uri> uris = new ArrayList<>();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject f = arr.getJSONObject(i);
                        ContentValues v = new ContentValues();
                        v.put(MediaStore.MediaColumns.DISPLAY_NAME, f.getString("name"));
                        v.put(MediaStore.MediaColumns.MIME_TYPE, f.optString("mime", "application/octet-stream"));
                        v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/보폭 정산");
                        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                        if (u == null) continue;
                        try (OutputStream out = getContentResolver().openOutputStream(u)) { out.write(Base64.decode(f.getString("data"), Base64.DEFAULT)); }
                        uris.add(u);
                    }
                    runOnUiThread(new Runnable() { @Override public void run() { afterMany(uris, share); } });
                } catch (Exception e) {
                    runOnUiThread(new Runnable() { @Override public void run() { saveDone("error"); } });
                }
            }
        }).start();
    }

    /** 안드로이드 9 이하: 고른 폴더(tree)에 파일을 만든다 */
    private void writeToTree(final Uri tree, final String json, final boolean share) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Uri dir = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                    JSONArray arr = new JSONArray(json);
                    final ArrayList<Uri> uris = new ArrayList<>();
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject f = arr.getJSONObject(i);
                        Uri u = DocumentsContract.createDocument(getContentResolver(), dir, f.optString("mime", "application/octet-stream"), f.getString("name"));
                        if (u == null) continue;
                        try (OutputStream out = getContentResolver().openOutputStream(u)) { out.write(Base64.decode(f.getString("data"), Base64.DEFAULT)); }
                        uris.add(u);
                    }
                    runOnUiThread(new Runnable() { @Override public void run() { afterMany(uris, share); } });
                } catch (Exception e) {
                    runOnUiThread(new Runnable() { @Override public void run() { saveDone("error"); } });
                }
            }
        }).start();
    }

    private void afterMany(ArrayList<Uri> uris, boolean share) {
        if (uris.isEmpty()) { saveDone("error"); return; }
        if (share) {
            try {
                Intent i = new Intent(Intent.ACTION_SEND_MULTIPLE);
                i.setType("*/*");
                i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(i, "반값여행 정산 서류 보내기"));
            } catch (Exception ignored) { /* 공유할 앱이 없으면 저장만 */ }
        }
        saveDone("saved:" + uris.size());
    }

    private void saveDone(final String result) {
        if (web != null) web.evaluateJavascript("window.__saveDone && window.__saveDone(" + JSONObject.quote(result) + ")", null);
    }

    private void remindDone(final String result) {
        if (web != null) web.evaluateJavascript("window.__remindDone && window.__remindDone(" + JSONObject.quote(result) + ")", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_NOTIFY) {
            String json = pendingReminders;
            pendingReminders = null;
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (!ok || json == null) { remindDone("denied"); return; }
            int n = ReminderReceiver.schedule(this, json);
            remindDone(n < 0 ? "error" : "ok:" + n);
            return;
        }
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

    /** 인식한 글을 웹 화면에 넘긴다 (취소·실패면 빈 글) */
    private void voiceDone(final String text) {
        if (web != null) web.evaluateJavascript("window.__voiceResult && window.__voiceResult(" + JSONObject.quote(text == null ? "" : text) + ")", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_VOICE) {
            String text = "";
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> list = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (list != null && !list.isEmpty()) text = list.get(0);
            }
            voiceDone(text);
            return;
        }
        if (requestCode == REQ_TREE) {
            String json = pendingMany;
            pendingMany = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || json == null) { saveDone("cancel"); return; }
            writeToTree(data.getData(), json, pendingShare);
            return;
        }
        if (requestCode == REQ_SAVE) {
            final byte[] bytes = pendingFile;
            pendingFile = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) { saveDone("cancel"); return; }
            final Uri uri = data.getData();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                        out.write(bytes);
                        runOnUiThread(new Runnable() { @Override public void run() { saveDone("ok"); } });
                    } catch (Exception e) {
                        runOnUiThread(new Runnable() { @Override public void run() { saveDone("error"); } });
                    }
                }
            }).start();
            return;
        }
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // 뒤로 가기: 먼저 웹 화면에 물어본다(3D 화면·크게 본 지도·설정 창이 열려 있으면 그것을 닫음 → window.__appBack()이 true).
    // 닫을 것이 없으면 이전 페이지, 그것도 없으면 앱을 뒤로 보낸다(홈 화면으로, 앱 상태는 그대로)
    private void handleBack() {
        if (web == null) { moveTaskToBack(true); return; }
        web.evaluateJavascript("(function(){try{return !!(window.__appBack&&window.__appBack());}catch(e){return false;}})()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if ("true".equals(handled)) return;
                if (web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { handleBack(); } // 안드로이드 12 이하

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
