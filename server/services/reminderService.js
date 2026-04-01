/**
 * reminderService.js
 * Smart Reminder System — email via Resend + anti-spam + scheduler-ready
 *
 * Exported functions:
 *
 *   — Queries —
 *   getPendingFocusToday(supabase, userId)      → [focus items]
 *   getUrgentAdminItems(supabase, userId)        → [admin items]
 *   shouldSendReminder(supabase, userId, type, channel, windowDays?)
 *                                               → boolean
 *
 *   — Email senders (per user) —
 *   sendDailyReminder(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail })
 *   sendAdminReminder(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail })
 *   sendWeeklyRecap(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail })
 *
 *   — Scheduler-ready (runs all active users) —
 *   runDailyReminder({ getAdminClient, sendEmail, emailTemplate, getUserEmail })
 *   runWeeklyRecap({ getAdminClient, sendEmail, emailTemplate, getUserEmail })
 */

const CLIENT_URL = () => process.env.CLIENT_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;

// ── A. Query helpers ─────────────────────────────────────────────────────────

/**
 * Semua fokus hari ini yang belum done.
 * @returns {Promise<Array>}
 */
export async function getPendingFocusToday(supabase, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("daily_focus_items")
    .select("id, title, status, priority")
    .eq("user_id", userId)
    .eq("focus_date", today)
    .neq("status", "done")
    .order("priority", { ascending: true });
  return data || [];
}

/**
 * Admin tracker items yang urgent atau due dalam 7 hari, belum completed.
 * @returns {Promise<Array>}
 */
export async function getUrgentAdminItems(supabase, userId) {
  const soonDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("admin_tracker_items")
    .select("id, title, category, due_date, is_urgent, status")
    .eq("user_id", userId)
    .neq("status", "completed")
    .or(`is_urgent.eq.true,due_date.lte.${soonDate}`)
    .order("due_date", { ascending: true })
    .limit(5);
  return data || [];
}

// ── B. Anti-spam check ───────────────────────────────────────────────────────

/**
 * Cek apakah reminder sudah pernah dikirim dalam window tertentu.
 *
 * @param {object}  supabase
 * @param {string}  userId
 * @param {string}  type     — "daily_focus" | "admin_tracker" | "weekly_recap"
 * @param {string}  channel  — "email"
 * @param {number}  [windowDays=1]  — berapa hari ke belakang yang dicek
 * @returns {Promise<boolean>}  true = BOLEH kirim, false = sudah pernah, skip
 */
export async function shouldSendReminder(supabase, userId, type, channel = "email", windowDays = 1) {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("reminder_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("target_type", type)
    .eq("channel", channel)
    .gte("sent_at", cutoff);
  return (count || 0) === 0;
}

async function logReminder(supabase, userId, type, channel, metadata = {}) {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("reminder_logs").insert({
    user_id:      userId,
    target_type:  type,
    channel,
    reminder_date: today,
    metadata,
  });
}

// ── C. Email senders (per user) ──────────────────────────────────────────────

/**
 * Kirim daily focus reminder ke satu user.
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, sent?: boolean }}
 */
export async function sendDailyReminder(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();

  const canSend = await shouldSendReminder(supabase, userId, "daily_focus", "email", 1);
  if (!canSend) return { ok: true, skipped: true, reason: "Sudah dikirim hari ini" };

  const pendingItems = await getPendingFocusToday(supabase, userId);
  if (!pendingItems.length) return { ok: true, skipped: true, reason: "Semua fokus sudah selesai" };

  const profile = await getUserEmail(userId);
  if (!profile?.email) return { ok: true, skipped: true, reason: "Email pengguna tidak ditemukan" };

  const focusList = pendingItems
    .map(f => `<li style="margin-bottom:6px">${f.title}</li>`)
    .join("");

  const emailSent = await sendEmail({
    to:      profile.email,
    name:    profile.full_name || "Kamu",
    subject: "AINA: Fokus harianmu hari ini belum selesai 👋",
    html:    emailTemplate({
      title:   "Jangan lupa fokusmu hari ini",
      body:    `<p>Bro, fokus harian kamu hari ini masih ada yang belum beres:</p>
<ul style="padding-left:20px;margin:12px 0">${focusList}</ul>
<p>Gak usah semuanya — lanjut satu langkah kecil dulu. Yang penting tetap gerak. 💪</p>`,
      ctaText: "Buka Ruang Produktif",
      ctaUrl:  CLIENT_URL() + "/dashboard",
    }),
  });

  if (!emailSent) return { ok: true, skipped: true, reason: "Email tidak dikonfigurasi di server ini" };
  await logReminder(supabase, userId, "daily_focus", "email", { focus_count: pendingItems.length });
  return { ok: true, sent: true };
}

/**
 * Kirim admin tracker reminder ke satu user.
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, sent?: boolean }}
 */
export async function sendAdminReminder(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();

  const canSend = await shouldSendReminder(supabase, userId, "admin_tracker", "email", 1);
  if (!canSend) return { ok: true, skipped: true, reason: "Sudah dikirim hari ini" };

  const urgentItems = await getUrgentAdminItems(supabase, userId);
  if (!urgentItems.length) return { ok: true, skipped: true, reason: "Tidak ada item urgent" };

  const profile = await getUserEmail(userId);
  if (!profile?.email) return { ok: true, skipped: true, reason: "Email pengguna tidak ditemukan" };

  const itemList = urgentItems.map(i => {
    const due    = i.due_date
      ? ` — tenggat ${new Date(i.due_date).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}`
      : "";
    const urgent = i.is_urgent ? " ⚠️" : "";
    return `<li style="margin-bottom:6px">${i.title}${due}${urgent}</li>`;
  }).join("");

  const emailSent = await sendEmail({
    to:      profile.email,
    name:    profile.full_name || "Kamu",
    subject: "AINA: Urusan pentingmu masih pending 📋",
    html:    emailTemplate({
      title:   "Urusan penting butuh perhatianmu",
      body:    `<p>Urusan penting kamu masih pending dan waktunya makin dekat:</p>
<ul style="padding-left:20px;margin:12px 0">${itemList}</ul>
<p>Cek lagi biar gak keteteran. Satu langkah kecil sekarang bisa mencegah masalah besar nanti. 🗂️</p>`,
      ctaText: "Buka Dokumen & Admin",
      ctaUrl:  CLIENT_URL() + "/dashboard",
    }),
  });

  if (!emailSent) return { ok: true, skipped: true, reason: "Email tidak dikonfigurasi di server ini" };
  await logReminder(supabase, userId, "admin_tracker", "email", { item_count: urgentItems.length });
  return { ok: true, sent: true };
}

/**
 * Kirim weekly recap ke satu user.
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, sent?: boolean }}
 */
export async function sendWeeklyRecap(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();

  // Window 7 hari — tidak kirim jika sudah ada dalam 7 hari terakhir
  const canSend = await shouldSendReminder(supabase, userId, "weekly_recap", "email", 7);
  if (!canSend) return { ok: true, skipped: true, reason: "Recap sudah dikirim minggu ini" };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: weekFocus }, { data: pendingAdmin }] = await Promise.all([
    supabase
      .from("daily_focus_items")
      .select("title, status, focus_date")
      .eq("user_id", userId)
      .gte("focus_date", weekAgo)
      .order("focus_date", { ascending: false }),
    supabase
      .from("admin_tracker_items")
      .select("title, category, status, due_date")
      .eq("user_id", userId)
      .neq("status", "completed")
      .order("is_urgent", { ascending: false })
      .limit(5),
  ]);

  const doneFocus   = (weekFocus || []).filter(f => f.status === "done");
  const undoneFocus = (weekFocus || []).filter(f => f.status !== "done");
  const totalFocus  = (weekFocus || []).length;

  const profile = await getUserEmail(userId);
  if (!profile?.email) return { ok: true, skipped: true, reason: "Email pengguna tidak ditemukan" };

  const doneList = doneFocus.length
    ? doneFocus.map(f => `<li style="margin-bottom:4px">✅ ${f.title}</li>`).join("")
    : "<li style='color:#888'>Belum ada fokus yang selesai minggu ini</li>";

  const undoneList = undoneFocus.length
    ? undoneFocus.map(f => `<li style="margin-bottom:4px">⏳ ${f.title}</li>`).join("")
    : "<li style='color:#888'>Semua fokus sudah selesai — keren!</li>";

  const adminList = (pendingAdmin || []).length
    ? pendingAdmin.map(a => `<li style="margin-bottom:4px">📋 ${a.title} (${a.category})</li>`).join("")
    : "<li style='color:#888'>Tidak ada urusan yang pending</li>";

  const motivasi = doneFocus.length >= totalFocus && totalFocus > 0
    ? "Luar biasa minggu ini! Kamu menyelesaikan semua fokus yang sudah kamu set. 🎉"
    : doneFocus.length > 0
    ? `Minggu ini kamu menyelesaikan ${doneFocus.length} dari ${totalFocus} fokus. Progress tetap progress — terus gerak minggu depan! 💪`
    : "Minggu ini belum sempat banyak yang selesai. Tidak apa-apa, mulai lagi dari yang kecil minggu depan.";

  const emailSent = await sendEmail({
    to:      profile.email,
    name:    profile.full_name || "Kamu",
    subject: "AINA: Recap Mingguanmu 📊",
    html:    emailTemplate({
      title:   "Rekap Minggu Ini dari AINA",
      body:    `
<p>${motivasi}</p>
<h3 style="font-size:15px;margin:20px 0 8px;color:#e0e0f0">✅ Fokus yang selesai:</h3>
<ul style="padding-left:20px;margin:0 0 12px">${doneList}</ul>
<h3 style="font-size:15px;margin:20px 0 8px;color:#e0e0f0">⏳ Fokus yang belum selesai:</h3>
<ul style="padding-left:20px;margin:0 0 12px">${undoneList}</ul>
<h3 style="font-size:15px;margin:20px 0 8px;color:#e0e0f0">📋 Urusan admin yang masih pending:</h3>
<ul style="padding-left:20px;margin:0 0 12px">${adminList}</ul>`,
      ctaText: "Mulai Minggu Depan",
      ctaUrl:  CLIENT_URL() + "/dashboard",
    }),
  });

  if (!emailSent) return { ok: true, skipped: true, reason: "Email tidak dikonfigurasi di server ini" };
  await logReminder(supabase, userId, "weekly_recap", "email", { done: doneFocus.length, total: totalFocus });
  return { ok: true, sent: true };
}

/**
 * Kirim smart expiry alert ke satu user.
 * Alert dikirim untuk item yang due dalam 30/7/1 hari ke depan,
 * dengan anti-spam per window yang sesuai.
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, sent?: boolean }}
 */
export async function sendExpiryAlert(userId, { getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();
  const today = new Date();

  // Definisi window alert: [days_ahead, reminder_type, window_days, label]
  const WINDOWS = [
    { days: 1,  type: "expiry_h1",  windowDays: 1,  label: "besok",           emoji: "🔴" },
    { days: 7,  type: "expiry_h7",  windowDays: 1,  label: "dalam 7 hari",    emoji: "🟠" },
    { days: 30, type: "expiry_h30", windowDays: 7,  label: "dalam 30 hari",   emoji: "🟡" },
  ];

  // Kumpulkan items per window
  const alertGroups = [];
  for (const win of WINDOWS) {
    const canSend = await shouldSendReminder(supabase, userId, win.type, "email", win.windowDays);
    if (!canSend) continue;

    const targetDate = new Date(today.getTime() + win.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const minDate   = new Date(today.getTime() + (win.days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: items } = await supabase
      .from("admin_tracker_items")
      .select("id, title, category, due_date")
      .eq("user_id", userId)
      .neq("status", "completed")
      .gte("due_date", minDate)
      .lte("due_date", targetDate)
      .order("due_date", { ascending: true });

    if (items && items.length > 0) {
      alertGroups.push({ ...win, items });
    }
  }

  if (!alertGroups.length) return { ok: true, skipped: true, reason: "Tidak ada item yang akan jatuh tempo" };

  const profile = await getUserEmail(userId);
  if (!profile?.email) return { ok: true, skipped: true, reason: "Email pengguna tidak ditemukan" };

  // Kirim email untuk setiap window yang eligible
  let sent = false;
  for (const group of alertGroups) {
    const itemList = group.items.map(i => {
      const dueStr = new Date(i.due_date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
      return `<li style="margin-bottom:6px">${group.emoji} <b>${i.title}</b> — tenggat ${dueStr} (${i.category})</li>`;
    }).join("");

    const emailSent = await sendEmail({
      to:      profile.email,
      name:    profile.full_name || "Kamu",
      subject: `AINA: Urusan kamu jatuh tempo ${group.label}! ${group.emoji}`,
      html:    emailTemplate({
        title:   `Tenggat ${group.label} mendekat`,
        body:    `<p>Jangan sampai terlewat — urusan penting kamu jatuh tempo <strong>${group.label}</strong>:</p>
<ul style="padding-left:20px;margin:12px 0">${itemList}</ul>
<p>Segera tindak lanjuti supaya tidak ada yang keteteran. ✅</p>`,
        ctaText: "Buka Dokumen & Admin",
        ctaUrl:  CLIENT_URL() + "/dashboard?tab=productivity",
      }),
    });

    if (emailSent) {
      await logReminder(supabase, userId, group.type, "email", { item_count: group.items.length, days: group.days });
      sent = true;
    }
  }

  return sent
    ? { ok: true, sent: true }
    : { ok: true, skipped: true, reason: "Email tidak dikonfigurasi di server ini" };
}

/**
 * Jalankan expiry alert untuk SEMUA user yang punya item due soon.
 */
export async function runExpiryAlerts({ getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();
  const limit30  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today    = new Date().toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("admin_tracker_items")
    .select("user_id")
    .neq("status", "completed")
    .gte("due_date", today)
    .lte("due_date", limit30);

  const userIds = [...new Set((rows || []).map(r => r.user_id))];
  const deps    = { getAdminClient, sendEmail, emailTemplate, getUserEmail };

  let sent = 0, skipped = 0, errors = 0;
  for (const userId of userIds) {
    try {
      const result = await sendExpiryAlert(userId, deps);
      if (result.sent)    sent++;
      if (result.skipped) skipped++;
    } catch (e) {
      errors++;
      console.error(`[Scheduler] Expiry alert error for ${userId}:`, e.message);
    }
  }

  console.log(`[Scheduler] ExpiryAlerts done — processed:${userIds.length} sent:${sent} skipped:${skipped} errors:${errors}`);
  return { processed: userIds.length, sent, skipped, errors };
}

// ── D. Scheduler-ready runners ───────────────────────────────────────────────

/**
 * Jalankan daily reminder untuk SEMUA user aktif.
 * Cocok dipanggil dari cron job / scheduler (mis. setInterval, pg_cron, Vercel cron).
 *
 * Flow:
 *  1. Ambil semua user_id yang punya fokus hari ini belum done
 *  2. Untuk setiap user: cek anti-spam → kirim jika boleh
 *
 * @returns {{ processed: number, sent: number, skipped: number, errors: number }}
 */
export async function runDailyReminder({ getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();
  const today    = new Date().toISOString().slice(0, 10);

  console.log(`[Scheduler] runDailyReminder — ${today}`);

  // Ambil distinct user_id yang punya pending focus hari ini
  const { data: rows } = await supabase
    .from("daily_focus_items")
    .select("user_id")
    .eq("focus_date", today)
    .neq("status", "done");

  const userIds = [...new Set((rows || []).map(r => r.user_id))];
  const deps    = { getAdminClient, sendEmail, emailTemplate, getUserEmail };

  let sent = 0, skipped = 0, errors = 0;

  for (const userId of userIds) {
    try {
      const result = await sendDailyReminder(userId, deps);
      if (result.sent)    sent++;
      if (result.skipped) skipped++;
    } catch (e) {
      errors++;
      console.error(`[Scheduler] Daily reminder error for ${userId}:`, e.message);
    }
  }

  console.log(`[Scheduler] Daily done — processed:${userIds.length} sent:${sent} skipped:${skipped} errors:${errors}`);
  return { processed: userIds.length, sent, skipped, errors };
}

/**
 * Jalankan weekly recap untuk SEMUA user yang punya aktivitas 7 hari terakhir.
 * Cocok dipanggil setiap Minggu malam atau Senin pagi.
 *
 * @returns {{ processed: number, sent: number, skipped: number, errors: number }}
 */
export async function runWeeklyRecap({ getAdminClient, sendEmail, emailTemplate, getUserEmail }) {
  const supabase = getAdminClient();
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log(`[Scheduler] runWeeklyRecap`);

  // Ambil distinct user_id yang punya aktivitas minggu ini
  const { data: rows } = await supabase
    .from("daily_focus_items")
    .select("user_id")
    .gte("focus_date", weekAgo);

  const userIds = [...new Set((rows || []).map(r => r.user_id))];
  const deps    = { getAdminClient, sendEmail, emailTemplate, getUserEmail };

  let sent = 0, skipped = 0, errors = 0;

  for (const userId of userIds) {
    try {
      const result = await sendWeeklyRecap(userId, deps);
      if (result.sent)    sent++;
      if (result.skipped) skipped++;
    } catch (e) {
      errors++;
      console.error(`[Scheduler] Weekly recap error for ${userId}:`, e.message);
    }
  }

  console.log(`[Scheduler] Weekly done — processed:${userIds.length} sent:${sent} skipped:${skipped} errors:${errors}`);
  return { processed: userIds.length, sent, skipped, errors };
}
