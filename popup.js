const status = document.getElementById("status");
const buttons = document.querySelectorAll("button");

for (const btn of buttons) {
  btn.addEventListener("click", async () => {
    buttons.forEach((b) => (b.disabled = true));
    status.className = "";
    status.textContent = btn.dataset.mode === "category" ? "Asking Jev…" : "Working…";
    const { id: windowId } = await chrome.windows.getCurrent();
    const res = await chrome.runtime.sendMessage({ mode: btn.dataset.mode, windowId });
    status.className = res.error ? "error" : "";
    status.textContent = res.error || res.summary;
    buttons.forEach((b) => (b.disabled = false));
  });
}
