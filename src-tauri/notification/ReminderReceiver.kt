// Receiver nhận báo thức và nút bấm trên thông báo nhắc hẹn.
// Chạy cả khi app đã đóng: tự dựng thông báo, tự nhắc lại, tự gỡ nhắc —
// không cần WebView/JS đang chạy. Xem docs/notification-app-integration.md.
package com.kha.ghichu

import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.util.Log
import java.io.File

class ReminderReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "ReminderReceiver"
        private const val MAX_DB_RETRIES = 3
        private const val DB_RETRY_MS = 100L
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val noteId = intent?.getLongExtra(ReminderHelper.EXTRA_NOTE_ID, -1L) ?: -1L
        if (noteId <= 0) return
        when (intent?.action) {
            ReminderHelper.ACTION_FIRE -> showReminder(context, intent, noteId)
            ReminderHelper.ACTION_OPEN -> openNote(context, noteId)
            ReminderHelper.ACTION_SNOOZE -> snooze(context, intent, noteId)
            ReminderHelper.ACTION_DONE -> markDone(context, noteId)
            ReminderHelper.ACTION_DISMISSED -> ReminderHelper.clearPendingOpen(context)
        }
    }

    private fun showReminder(context: Context, intent: Intent, noteId: Long) {
        ReminderHelper.ensureChannel(context)
        ReminderHelper.markPendingOpen(context, noteId)
        val title = intent.getStringExtra(ReminderHelper.EXTRA_TITLE).orEmpty()
        val collapsed = intent.getStringExtra(ReminderHelper.EXTRA_COLLAPSED).orEmpty()
        val expanded = intent.getStringExtra(ReminderHelper.EXTRA_EXPANDED).orEmpty()
        val launch = ReminderHelper.launchIntent(context, noteId) ?: return
        val open = PendingIntent.getActivity(
            context,
            ReminderHelper.openCode(noteId),
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = notificationBuilder(context)
            .setSmallIcon(R.drawable.ic_notepad)
            .setContentTitle(title.ifBlank { "Ghi chú mới" })
            .setContentText(collapsed)
            .setStyle(Notification.BigTextStyle().bigText(expanded.ifBlank { collapsed }))
            .setContentIntent(open)
            .setDeleteIntent(dismissIntent(context, noteId))
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setPriority(Notification.PRIORITY_HIGH)
            .addAction(action(context, ReminderHelper.ACTION_OPEN, "Mở ghi chú", noteId, intent))
            .addAction(action(context, ReminderHelper.ACTION_SNOOZE, "Nhắc lại 15 phút", noteId, intent))
            .addAction(action(context, ReminderHelper.ACTION_DONE, "Đã xong", noteId, intent))
        // Cố ý: KHÔNG setLargeIcon (kha chốt chỉ 1 icon), KHÔNG custom view
        // nên không có đường kẻ phân cách trên dãy nút bấm.
        ReminderHelper.notificationManager(context).notify(noteId.toInt(), builder.build())
    }

    private fun notificationBuilder(context: Context): Notification.Builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, ReminderHelper.CHANNEL_ID)
        } else {
            // Máy cũ chưa có channel: gắn âm chuông thẳng vào builder.
            @Suppress("DEPRECATION")
            Notification.Builder(context)
                .setSound(ReminderHelper.soundUri(context))
                .setDefaults(Notification.DEFAULT_VIBRATE)
        }

    // Một nút bấm: intent riêng tới receiver, mang đủ tiêu đề/nội dung để
    // nhắc lại mà không cần mở app hay đọc DB. Cả 3 nút đều qua receiver:
    // "Mở ghi chú" cần receiver gỡ thông báo + ghi note chờ mở rồi mới mở app.
    private fun action(
        context: Context,
        action: String,
        label: String,
        noteId: Long,
        src: Intent,
    ): Notification.Action {
        val code = when (action) {
            ReminderHelper.ACTION_OPEN -> ReminderHelper.openCode(noteId)
            ReminderHelper.ACTION_SNOOZE -> ReminderHelper.snoozeCode(noteId)
            else -> ReminderHelper.doneCode(noteId)
        }
        val target = PendingIntent.getBroadcast(
            context,
            code,
            Intent(context, ReminderReceiver::class.java).apply {
                this.action = action
                putExtra(ReminderHelper.EXTRA_NOTE_ID, noteId)
                putExtra(ReminderHelper.EXTRA_TITLE, src.getStringExtra(ReminderHelper.EXTRA_TITLE))
                putExtra(ReminderHelper.EXTRA_COLLAPSED, src.getStringExtra(ReminderHelper.EXTRA_COLLAPSED))
                putExtra(ReminderHelper.EXTRA_EXPANDED, src.getStringExtra(ReminderHelper.EXTRA_EXPANDED))
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Action.Builder(0, label, target).build()
    }

    private fun dismissIntent(context: Context, noteId: Long): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            ReminderHelper.dismissCode(noteId),
            Intent(context, ReminderReceiver::class.java).apply {
                action = ReminderHelper.ACTION_DISMISSED
                putExtra(ReminderHelper.EXTRA_NOTE_ID, noteId)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    // "Mở ghi chú": mở app tới note đó, gỡ thông báo khỏi thanh trạng thái.
    private fun openNote(context: Context, noteId: Long) {
        ReminderHelper.markPendingOpen(context, noteId)
        ReminderHelper.notificationManager(context).cancel(noteId.toInt())
        val launch = ReminderHelper.launchIntent(context, noteId) ?: return
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
    }

    // "Nhắc lại 15 phút": dời remind_at trong DB rồi đặt lại báo thức.
    private fun snooze(context: Context, intent: Intent, noteId: Long) {
        val next = System.currentTimeMillis() + ReminderHelper.SNOOZE_MINUTES * 60_000L
        if (!updateRemindAt(context, noteId, next)) {
            Log.w(TAG, "nhac lai that bai: khong doi duoc remind_at note $noteId")
            return
        }
        ReminderHelper.notificationManager(context).cancel(noteId.toInt())
        ReminderHelper.schedule(
            context,
            noteId,
            intent.getStringExtra(ReminderHelper.EXTRA_TITLE).orEmpty(),
            intent.getStringExtra(ReminderHelper.EXTRA_COLLAPSED).orEmpty(),
            intent.getStringExtra(ReminderHelper.EXTRA_EXPANDED).orEmpty(),
            next,
        )
    }

    // "Đã xong": hủy báo thức + thông báo, gỡ remind_at để không nhắc lại.
    private fun markDone(context: Context, noteId: Long) {
        ReminderHelper.cancel(context, noteId)
        updateRemindAt(context, noteId, null)
        ReminderHelper.clearPendingOpen(context)
    }

    // Ghi thẳng vào notes.db (filesDir/notes.db — cùng file Rust mở, chế độ
    // WAL nên 2 tiến trình đọc/ghi được; thử lại 3 lần nếu DB đang khóa).
    private fun updateRemindAt(context: Context, noteId: Long, remindAt: Long?): Boolean {
        val dbFile = findDbFile(context) ?: run {
            Log.w(TAG, "khong thay notes.db de doi remind_at note $noteId")
            return false
        }
        repeat(MAX_DB_RETRIES) { attempt ->
            var db: SQLiteDatabase? = null
            try {
                db = SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READWRITE)
                val values = ContentValues().apply {
                    if (remindAt == null) putNull("remind_at") else put("remind_at", remindAt)
                }
                db.update("notes", values, "id = ?", arrayOf(noteId.toString()))
                return true
            } catch (e: Exception) {
                Log.w(TAG, "doi remind_at note $noteId lan ${attempt + 1} loi", e)
                if (attempt + 1 < MAX_DB_RETRIES) Thread.sleep(DB_RETRY_MS)
            } finally {
                try {
                    db?.close()
                } catch (_: Exception) {
                }
            }
        }
        return false
    }

    private fun findDbFile(context: Context): File? {
        val inFiles = File(context.filesDir, "notes.db")
        if (inFiles.isFile) return inFiles
        val inDatabases = context.getDatabasePath("notes.db")
        if (inDatabases.isFile) return inDatabases
        return null
    }
}
