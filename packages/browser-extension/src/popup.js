async function init() {
  const config = await chrome.runtime.sendMessage({ type: "get_config" });

  document.getElementById("endpoint").value = config.endpoint || "http://localhost:8080";
  document.getElementById("apiKey").value = config.apiKey || "";
  document.getElementById("cluster").value = config.cluster || "mainnet-beta";
  document.getElementById("autoBlock").checked = config.autoBlock !== false;

  checkConnection(config.endpoint);
}

async function checkConnection(endpoint) {
  const statusEl = document.getElementById("status");
  const dotEl = document.getElementById("statusDot");
  const textEl = document.getElementById("statusText");

  try {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      statusEl.className = "status connected";
      dotEl.className = "dot green";
      textEl.textContent = "Connected to DeltaG";
    } else {
      throw new Error("Bad response");
    }
  } catch {
    statusEl.className = "status disconnected";
    dotEl.className = "dot red";
    textEl.textContent = "Cannot reach DeltaG API";
  }
}

document.getElementById("save").addEventListener("click", async () => {
  const config = {
    endpoint: document.getElementById("endpoint").value.replace(/\/$/, ""),
    apiKey: document.getElementById("apiKey").value,
    cluster: document.getElementById("cluster").value,
    autoBlock: document.getElementById("autoBlock").checked,
  };

  await chrome.runtime.sendMessage({ type: "set_config", config });
  checkConnection(config.endpoint);

  const btn = document.getElementById("save");
  btn.textContent = "Saved!";
  setTimeout(() => { btn.textContent = "Save Settings"; }, 1500);
});

init();
