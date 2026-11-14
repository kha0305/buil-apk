// Trợ giúp tĩnh cho nhắc hẹn native: đặt/hủy báo thức AlarmManager, kênh
// thông báo, quyền POST_NOTIFICATIONS. Rust gọi qua JNI (xem notify.rs).
// File này KHÔNG sửa tay trong gen/android: script
// scripts/patch-android-notification.py chép nó vào dự án Android sau
// `tauri android init`, đổi dòng package theo identifier trong tauri.conf.json.
package com.kha.ghichu

import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import java.io.File

object ReminderHelper {
    const val CHANNEL_ID = "nhac-hen"
    const val SOUND_RES = "chuong_vua_nhe"
    const val ACTION_FIRE = "com.kha.ghichu.ACTION_FIRE"
    const val ACTION_OPEN = "com.kha.ghichu.ACTION_OPEN"
    const val ACTION_SNOOZE = "com.kha.ghichu.ACTION_SNOOZE"
    const val ACTION_DONE = "com.kha.ghichu.ACTION_DONE"
    const val ACTION_DISMISSED = "com.kha.ghichu.ACTION_DISMISSED"
    const val EXTRA_NOTE_ID = "note_id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_COLLAPSED = "collapsed"
    const val EXTRA_EXPANDED = "expanded"
    const val PENDING_OPEN_FILE = "pending_open_note.txt"
    const val SNOOZE_MINUTES = 15L

    private const val TAG = "ReminderHelper"
    private const val REQUEST_NOTIFICATIONS = 1001
    private const val PREFS = "ghichu_reminder"
    private const val KEY_ASKED = "notification_permission_asked"
    private const val OPEN_BASE = 1_000_000
    private const val SNOOZE_BASE = 2_000_000
    private const val DONE_BASE = 3_000_000
    private const val DISMISS_BASE = 4_000_000

    // Mã requestCode riêng cho từng note và từng nút (PendingIntent so bằng
    // nhau cả khi extras khác, nên chỉ khác action là chưa đủ).
    fun alarmCode(noteId: Long) = noteId.toInt()
    fun openCode(noteId: Long) = noteId.toInt() + OPEN_BASE
    fun snoozeCode(noteId: Long) = noteId.toInt() + SNOOZE_BASE
    fun doneCode(noteId: Long) = noteId.toInt() + DONE_BASE
    fun dismissCode(noteId: Long) = noteId.toInt() + DISMISS_BASE

    @JvmStatic
    fun schedule(
        context: Context,
        noteId: Long,
        title: String,
        collapsed: String,
        expanded: String,
        atMillis: Long,
    ): Boolean {
        ensureChannel(context)
        requestPermissionIfNeeded(context)
        return try {
            val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pending = PendingIntent.getBroadcast(
                context,
                alarmCode(noteId),
                fireIntent(context, noteId, title, collapsed, expanded),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarm.canScheduleExactAlarms()) {
                // Không có quyền báo thức chính xác: báo thức thường vẫn kêu,
                // chỉ có thể trễ khi máy đang ngủ (Doze).
                alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
            } else {
                alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
            }
            true
        } catch (e: SecurityException) {
            Log.w(TAG, "khong dat duoc bao thuc chinh xac cho note $noteId", e)
            false
        }
    }

    @JvmStatic
    fun cancel(context: Context, noteId: Long) {
        try {
            val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pending = PendingIntent.getBroadcast(
                context,
                alarmCode(noteId),
                fireIntent(context, noteId, "", "", ""),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            if (pending != null) alarm.cancel(pending)
            notificationManager(context).cancel(noteId.toInt())
        } catch (e: Exception) {
            Log.w(TAG, "khong huy duoc nhac hen note $noteId", e)
        }
    }

    // Android 13+ mới cần quyền; máy cũ hơn luôn được coi là cho phép.
    @JvmStatic
    fun notificationsAllowed(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    // Chỉ hỏi một lần duy nhất (lần đặt nhắc hẹn đầu tiên). Đã từ chối rồi
    // thì không hỏi lại: báo thức vẫn đặt, chỉ là thông báo sẽ không hiện
    // và app vẫn nhắc trong app khi mở.
    private fun requestPermissionIfNeeded(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val activity = context as? Activity ?: return
        if (notificationsAllowed(context)) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_ASKED, false)) return
        prefs.edit().putBoolean(KEY_ASKED, true).apply()
        activity.requestPermissions(
            arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
            REQUEST_NOTIFICATIONS,
        )
    }

    // Kênh chỉ tạo một lần: tạo xong thì âm thanh theo kênh, đổi file âm
    // sau này không đổi được kênh cũ (phải gỡ app cài lại).
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = notificationManager(context)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build()
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Nhắc hẹn",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Nhắc hẹn ghi chú"
            setSound(soundUri(context), attrs)
        }
        manager.createNotificationChannel(channel)
    }

    fun soundUri(context: Context): Uri =
        Uri.parse("android.resource://${context.packageName}/raw/$SOUND_RES")

    fun notificationManager(context: Context): NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // Intent mở app (launcher): không hard-code tên MainActivity.
    fun launchIntent(context: Context, noteId: Long): Intent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return null
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP,
        )
        intent.putExtra(EXTRA_NOTE_ID, noteId)
        return intent
    }

    // Note chờ mở (file trong filesDir — cùng thư mục app_data_dir của Rust):
    // receiver ghi lúc chuông kêu, Rust đọc + xóa khi app mở lên.
    fun markPendingOpen(context: Context, noteId: Long) {
        try {
            File(context.filesDir, PENDING_OPEN_FILE).writeText(noteId.toString())
        } catch (e: Exception) {
            Log.w(TAG, "khong ghi duoc $PENDING_OPEN_FILE", e)
        }
    }

    fun clearPendingOpen(context: Context) {
        try {
            File(context.filesDir, PENDING_OPEN_FILE).delete()
        } catch (e: Exception) {
            Log.w(TAG, "khong xoa duoc $PENDING_OPEN_FILE", e)
        }
    }

    private fun fireIntent(
        context: Context,
        noteId: Long,
        title: String,
        collapsed: String,
        expanded: String,
    ): Intent =
        Intent(context, ReminderReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(EXTRA_NOTE_ID, noteId)
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_COLLAPSED, collapsed)
            putExtra(EXTRA_EXPANDED, expanded)
        }
}
