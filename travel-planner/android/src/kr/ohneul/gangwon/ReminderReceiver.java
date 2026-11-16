package kr.ohneul.gangwon;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 여행 당일 출발 알림: 웹 화면이 넘긴 알림 목록([{at(ms), title, text}])을 휴대폰 알람으로 예약하고, 때가 되면 알림을 띄운다.
 * - 서버 없이 휴대폰 안에서만 동작한다 (정확한 알람 권한 없이 setAndAllowWhileIdle: 절전 중이면 몇 분 늦을 수 있음)
 * - 목록은 SharedPreferences에 두고, 휴대폰을 다시 켜거나 앱을 업데이트하면 다시 예약한다
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "reminders";
    static final String CHANNEL = "trip";
    static final int MAX = 60;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            schedule(ctx, ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("list", "[]"));
            return;
        }
        show(ctx, intent.getIntExtra("id", 1), intent.getStringExtra("title"), intent.getStringExtra("text"));
    }

    private static PendingIntent alarmIntent(Context ctx, int id, String title, String text) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction("kr.ohneul.gangwon.REMIND." + id);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("text", text);
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 예약한 알림을 모두 지운다 */
    static void cancelAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (int id = 1; id <= MAX; id++) am.cancel(alarmIntent(ctx, id, "", ""));
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("list", "[]").apply();
    }

    /** 앞으로의 알림만 예약하고 몇 개를 예약했는지 돌려준다 */
    static int schedule(Context ctx, String json) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (int id = 1; id <= MAX; id++) am.cancel(alarmIntent(ctx, id, "", ""));
        int n = 0;
        try {
            JSONArray arr = new JSONArray(json);
            long now = System.currentTimeMillis();
            for (int k = 0; k < arr.length() && n < MAX; k++) {
                JSONObject o = arr.getJSONObject(k);
                long at = o.getLong("at");
                if (at <= now) continue;
                n++;
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(ctx, n, o.optString("title"), o.optString("text")));
            }
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("list", json).apply();
        } catch (Exception e) {
            return -1;
        }
        return n;
    }

    static void show(Context ctx, int id, String title, String text) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "여행 출발 알림", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("여행 날 다음 장소로 출발할 시각을 알려 드려요");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(ctx.getApplicationInfo().icon)
                .setContentTitle(title == null ? "보폭" : title)
                .setContentText(text == null ? "" : text)
                .setStyle(new Notification.BigTextStyle().bigText(text == null ? "" : text))
                .setContentIntent(pi)
                .setAutoCancel(true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
        nm.notify(id, b.build());
    }
}
