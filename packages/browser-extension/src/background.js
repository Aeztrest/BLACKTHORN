const DEFAULT_ENDPOINT = "http://localhost:8080";

async function getConfig() {
  const result = await chrome.storage.sync.get({
    endpoint: DEFAULT_ENDPOINT,
    apiKey: "",
    cluster: "mainnet-beta",
    autoBlock: true,
  });
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "analyze") {
    handleAnalyze(message.transactionBase64).then(sendResponse).catch((err) => {
      sendResponse({ safe: true, reasons: [`Analysis error: ${err.message}`] });
    });
    return true;
  }

  if (message.type === "get_config") {
    getConfig().then(sendResponse);
    return true;
  }

  if (message.type === "set_config") {
    chrome.storage.sync.set(message.config).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function handleAnalyze(transactionBase64) {
  const config = await getConfig();

  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${config.endpoint}/v1/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cluster: config.cluster,
        transactionBase64,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { safe: true, reasons: [`DeltaG API error: ${response.status}`] };
    }

    const result = await response.json();

    if (!result.safe && config.autoBlock) {
      showBlockNotification(result);
    }

    return result;
  } catch (error) {
    clearTimeout(timeout);
    return { safe: true, reasons: [`Analysis failed: ${error.message}`] };
  }
}

function showBlockNotification(result) {
  const reasons = result.reasons?.join(", ") || "Unknown risk detected";
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "DeltaG: Transaction Blocked",
    message: `Risky transaction detected: ${reasons}`,
    priority: 2,
  });
}
