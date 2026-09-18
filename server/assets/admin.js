const $ = (selector) => document.querySelector(selector);
const preview = $("#screen-preview");

function refreshPreview() { preview.src = `/admin/screen?ts=${Date.now()}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function stateLabel(display) {
  if (display.mode === "secret_waiting") return "✉ 有一封秘密信件待打印";
  if (display.mode === "reminder") return `☼ ${escapeHtml(display.text.replace("\n", " "))}`;
  return "♡ 日常陪伴模式";
}

async function loadState() {
  const response = await fetch("/api/admin/state");
  const data = await response.json();
  $("#service-status").textContent = "服务正常 · 局域网";
  $("#display-state").innerHTML = `<strong>${stateLabel(data.display)}</strong><span>下次检查约 ${data.refreshSeconds} 秒</span>`;
  const reminder = data.reminder;
  const form = $("#reminder-form");
  form.enabled.checked = reminder.enabled;
  form.workEndTime.value = reminder.workEndTime;
  form.leadMinutes.value = reminder.leadMinutes;
  form.text.value = reminder.text;
  $("#messages").innerHTML = data.messages.map((message) => `
    <article class="message-row ${message.status === "waiting" ? "waiting" : "printed"}">
      <div class="message-copy"><strong>${escapeHtml(message.title)}</strong><span>${escapeHtml(message.text)}</span></div>
      <div class="message-meta"><span class="message-status">${message.status === "waiting" ? "待打印" : "已打印"}</span><button class="print" data-print="${message.id}">${message.status === "waiting" ? "模拟打印" : "再次打印"}</button></div>
    </article>`).join("");
  document.querySelectorAll("[data-print]").forEach((button) => button.addEventListener("click", async () => {
    const response = await fetch(`/api/admin/messages/${button.dataset.print}/print`, {method: "POST"});
    const result = await response.json();
    $("#print-result").textContent = response.ok ? `已模拟打印：${result.id}` : result.error;
    refreshPreview();
    loadState();
  }));
}

$("#message-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const response = await fetch("/api/inbox/messages", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(Object.fromEntries(form.entries()))});
  const result = await response.json();
  $("#form-result").textContent = response.ok ? "信件已送达，屏幕只显示信封。" : result.error;
  if (response.ok) { event.target.reset(); refreshPreview(); loadState(); }
});

$("#reminder-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = Object.fromEntries(form.entries());
  payload.enabled = form.get("enabled") === "on";
  payload.leadMinutes = Number(payload.leadMinutes);
  const response = await fetch("/api/admin/settings/reminder", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload)});
  const result = await response.json();
  $("#reminder-result").textContent = response.ok ? "提醒规则已保存。" : result.error;
  if (response.ok) { refreshPreview(); loadState(); }
});

$("#refresh-preview").addEventListener("click", refreshPreview);
$("#simulate-button").addEventListener("click", async () => {
  const response = await fetch("/api/admin/button", {method: "POST"});
  const result = await response.json();
  $("#print-result").textContent = response.ok ? `模拟按钮成功，已生成打印任务：${result.job.id}` : result.error;
  refreshPreview();
  loadState();
});

loadState();
