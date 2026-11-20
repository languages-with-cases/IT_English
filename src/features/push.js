/** Web Push settings for installed iOS/desktop PWAs. */
var PUSH_VAPID_PUBLIC = "BBuh8Vsn4LdF6rOUSmWcCAyUOldNwDPOC9Dku5Fq2rJDmfnyCsGZueCqS0FjbM-64DljN_qtq27FJqgQQVgT_Mo";
var pushState = { enabled: false, time: "14:00", message: "" };
function pushSupported() {
  return !!(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
}
function pushDecodeKey(value) {
  var b = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(b, function (c) { return c.charCodeAt(0); });
}
function pushHTML() {
  if (!cloud.user) return '<div class="row"><div><b>Daily reminders</b><span>Sign in to configure push notifications.</span></div></div>';
  return '<div class="row"><div><b>Daily reminders</b><span>' +
    (pushSupported() ? "Install the app to your Home Screen on iPhone, then allow notifications." : "Push requires an installed app on iOS 16.4+ or a compatible browser.") +
    '</span></div></div><div class="row"><div><b>Reminder time</b><span>Uses your device time zone</span></div>' +
    '<input type="time" id="pushTime" value="' + pushState.time + '" onchange="pushSaveTime(this.value)" aria-label="Reminder time"></div>' +
    '<button class="accb" onclick="pushEnable()" ' + (!pushSupported() ? "disabled" : "") + '>' +
    (pushState.enabled ? "Update notification settings" : "Enable notifications") +
    '</button><button class="acclnk" onclick="pushDisable()">Turn off reminders</button>' +
    '<p role="status">' + esc(pushState.message) + '</p>';
}
async function pushSaveTime(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
  pushState.time = time;
  if (pushState.enabled) await pushEnable(true);
}
async function pushEnable(skipPermission) {
  if (!cloud.user || !cloud.ready || !pushSupported()) return;
  try {
    var permission = skipPermission ? Notification.permission : await Notification.requestPermission();
    if (permission !== "granted") throw Error("Notifications were not allowed.");
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushDecodeKey(PUSH_VAPID_PUBLIC) });
    var result = await cloud.db.from("push_subscriptions").upsert({
      user_id: cloud.user.id, endpoint: sub.endpoint, subscription: sub.toJSON(),
      reminder_time: pushState.time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enabled: true
    }, { onConflict: "endpoint" });
    if (result.error) throw result.error;
    pushState.enabled = true;
    pushState.message = "Reminder saved. Push delivery will start once server scheduling is configured.";
  } catch (e) { pushState.message = e.message || "Could not enable notifications."; }
  if (ui.view === "progress") render();
}
async function pushDisable() {
  if (!cloud.user || !cloud.db) return;
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (sub) {
      var result = await cloud.db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", cloud.user.id);
      if (result.error) throw result.error;
      await sub.unsubscribe();
    }
    pushState.enabled = false;
    pushState.message = "Reminders disabled on this device.";
  } catch (e) { pushState.message = e.message || "Could not disable reminders."; }
  if (ui.view === "progress") render();
}

async function pushLoadSettings() {
  if (!cloud.user || !cloud.db || !pushSupported()) return;
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    var result = await cloud.db.from("push_subscriptions").select("reminder_time,enabled").eq("user_id", cloud.user.id).eq("endpoint", sub.endpoint).maybeSingle();
    if (result.error || !result.data) return;
    pushState.enabled = !!result.data.enabled;
    pushState.time = result.data.reminder_time.slice(0, 5);
    if (ui.view === "progress") render();
  } catch (e) { /* Push is optional. */ }
}
