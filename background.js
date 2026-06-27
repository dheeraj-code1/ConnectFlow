const PEOPLE_URL = /linkedin\.com\/company\/[^/?#]+\/people/i;

function pingContentScript(tabId) {
  if (tabId < 0) {
    return;
  }

  chrome.tabs.sendMessage(tabId, { type: "RUN_INJECT" }).catch(() => {});
}

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0 && PEOPLE_URL.test(details.url)) {
    pingContentScript(details.tabId);
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0 && PEOPLE_URL.test(details.url)) {
    pingContentScript(details.tabId);
  }
});
