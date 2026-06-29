(function () {
  "use strict";

  const BUTTON_ID = "my-extension-connect-all-btn";
  const STATS_ID = "my-extension-stats";
  const HEADING_CLASS = "wABVuRYChPnxETqtxOjZNnPsdLHQovkevMdxNA";
  const HEADING_TEXT = "People you may know";
  const CARD_SELECTOR =
    "div.artdeco-card.org-people-profile-card__card-spacing.org-people__card-margin-bottom";
  const PROFILE_CARD_SELECTOR = ".org-people-profile-card__profile-card-spacing";
  const CONNECT_SELECTOR = "footer button.artdeco-button";
  const TARGET_URL_PATTERN =
    /^https:\/\/www\.linkedin\.com\/company\/[^/?#]+\/people/i;
  const STORAGE_KEY = "connectFlowDaily";
  const DAILY_LIMIT = 10;
  const CLICK_DELAY_MS = 1200;
  const URL_CHECK_INTERVAL_MS = 400;
  const MODAL_WAIT_MS = 5000;
  const MODAL_POLL_MS = 200;

  let lastUrl = location.href;
  let cardObserver = null;
  let pageObserver = null;
  let observedCard = null;
  let started = false;
  let isConnecting = false;
  let injectDebounceTimer = null;

  // Fast + persistent: reads from memory, writes to memory + disk
  let memoryStore = null;
  let memoryLoadPromise = null;
  let persistTimer = null;

  function freshRecord() {
    return { date: getTodayDate(), counts: {} };
  }

  function normalizeRecord(record) {
    if (!record || record.date !== getTodayDate()) {
      return freshRecord();
    }
    if (!record.counts) {
      record.counts = {};
    }
    return record;
  }

  function loadMemoryStore() {
    if (memoryStore) {
      return Promise.resolve(memoryStore);
    }
    if (!memoryLoadPromise) {
      memoryLoadPromise = getStorageData().then((stored) => {
        memoryStore = normalizeRecord(stored);
        return memoryStore;
      });
    }
    return memoryLoadPromise;
  }

  function getCountSync(company) {
    if (!company || !memoryStore) {
      return 0;
    }
    return memoryStore.counts[company] || 0;
  }

  async function getCount(company) {
    if (!company) {
      return 0;
    }
    await loadMemoryStore();
    return getCountSync(company);
  }

  function incrementCount(company) {
    if (!memoryStore) {
      memoryStore = freshRecord();
    }
    memoryStore.counts[company] = (memoryStore.counts[company] || 0) + 1;
    schedulePersist();
    return memoryStore.counts[company];
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 300);
  }

  function persistNow() {
    clearTimeout(persistTimer);
    if (memoryStore) {
      saveStorageData(memoryStore);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function getCompanyFromUrl(url = location.href) {
    const match = url.match(/linkedin\.com\/company\/([^/?#]+)\/people/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  }

  function getStorageData() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
          if (chrome.runtime.lastError) {
            resolve({ date: getTodayDate(), counts: {} });
            return;
          }
          resolve(result[STORAGE_KEY] || { date: getTodayDate(), counts: {} });
        });
      } catch {
        resolve({ date: getTodayDate(), counts: {} });
      }
    });
  }

  function saveStorageData(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function isLinkedInPage() {
    return location.hostname === "www.linkedin.com";
  }

  function isTargetPage() {
    return TARGET_URL_PATTERN.test(location.href);
  }

  function findHeadingInCard(card) {
    const byClass = card.querySelector(`h2.${HEADING_CLASS}`);
    if (byClass) {
      return byClass;
    }

    return [...card.querySelectorAll("h2")].find(
      (el) => el.textContent.trim() === HEADING_TEXT
    );
  }

  function getTargetCard() {
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];

    const withHeading = cards.find((card) => findHeadingInCard(card));
    if (withHeading) {
      return withHeading;
    }

    const withProfiles = cards.filter((card) =>
      card.querySelector(PROFILE_CARD_SELECTOR)
    );
    if (withProfiles.length) {
      return withProfiles[withProfiles.length - 1];
    }

    return cards[cards.length - 1] || null;
  }

  function isConnectButton(btn) {
    const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
    const text = (btn.querySelector(".artdeco-button__text")?.textContent || "")
      .trim()
      .toLowerCase();

    return (
      (ariaLabel.includes("invite") && ariaLabel.includes("connect")) ||
      text === "connect"
    );
  }

  function getConnectButtons(card) {
    return [...card.querySelectorAll(CONNECT_SELECTOR)].filter(isConnectButton);
  }

  function findSendButton() {
    return [...document.querySelectorAll("button.artdeco-button")].find((btn) => {
      const text = (btn.querySelector(".artdeco-button__text")?.textContent || "")
        .trim()
        .toLowerCase();
      const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();

      return (
        text === "send without a note" ||
        text === "send" ||
        ariaLabel === "send without a note" ||
        ariaLabel.includes("send invitation")
      );
    });
  }

  async function clickSendOnModal() {
    const deadline = Date.now() + MODAL_WAIT_MS;

    while (Date.now() < deadline) {
      const sendButton = findSendButton();
      if (sendButton) {
        sendButton.click();
        await sleep(300);
        return true;
      }
      await sleep(MODAL_POLL_MS);
    }

    return false;
  }

  function renderStats(sentToday, card) {
    const statsEl = document.getElementById(STATS_ID);
    const button = document.getElementById(BUTTON_ID);
    const company = getCompanyFromUrl();

    if (!statsEl || !company) {
      return;
    }

    const onPage = card ? getConnectButtons(card).length : 0;
    const remaining = Math.max(0, DAILY_LIMIT - sentToday);

    statsEl.textContent = `${sentToday}/${DAILY_LIMIT} sent today · ${onPage} on page`;
    statsEl.classList.toggle("my-extension-stats--limit", sentToday >= DAILY_LIMIT);

    if (button && !isConnecting) {
      button.disabled = sentToday >= DAILY_LIMIT;
      button.title =
        sentToday >= DAILY_LIMIT
          ? `Daily limit reached for ${company} (${DAILY_LIMIT}/day)`
          : `${remaining} connect(s) left today for ${company}`;
    }
  }

  async function updateStatsDisplay() {
    const company = getCompanyFromUrl();
    const card = getTargetCard();

    if (!company || !document.getElementById(STATS_ID)) {
      return;
    }

    let sentToday = getCountSync(company);
    if (!memoryStore) {
      sentToday = await getCount(company);
    }

    renderStats(sentToday, card);
  }

  async function onButtonClick(event) {
    const button = event.currentTarget;
    const company = getCompanyFromUrl();

    if (isConnecting || !company) {
      return;
    }

    const card = getTargetCard();
    if (!card) {
      return;
    }

    // Instant feedback — don't wait for storage first
    isConnecting = true;
    button.disabled = true;
    button.textContent = "Starting...";

    let sentToday;
    try {
      await loadMemoryStore();
      sentToday = getCountSync(company);
      if (sentToday >= DAILY_LIMIT) {
        button.textContent = "Daily limit reached";
        await updateStatsDisplay();
        await sleep(1500);
        return;
      }

      const initialCount = getConnectButtons(card).length;
      if (!initialCount) {
        button.textContent = "No Connect buttons";
        await sleep(1500);
        await updateStatsDisplay();
        return;
      }

      let clicked = 0;

      while (clicked < initialCount) {
        if (sentToday >= DAILY_LIMIT) {
          break;
        }

        const currentCard = getTargetCard();
        if (!currentCard) {
          break;
        }

        const connectButtons = getConnectButtons(currentCard);
        if (!connectButtons.length) {
          break;
        }

        const connectBtn = connectButtons[0];
        if (!connectBtn.isConnected || connectBtn.disabled) {
          break;
        }

        clicked += 1;
        button.textContent = `Connecting ${clicked}...`;
        connectBtn.click();
        await sleep(600);

        const sent = await clickSendOnModal();
        if (sent) {
          sentToday = incrementCount(company);
          statsElUpdate(sentToday, currentCard);
        }

        await sleep(CLICK_DELAY_MS);
      }
    } finally {
      isConnecting = false;
      button.disabled = false;
      button.textContent = "Connect All";
      persistNow();
      await updateStatsDisplay();
    }
  }

  function statsElUpdate(sentToday, card) {
    renderStats(sentToday, card);
  }

  function createActionsBlock() {
    const actions = document.createElement("div");
    actions.className = "my-extension-actions";

    const stats = document.createElement("span");
    stats.id = STATS_ID;
    stats.className = "my-extension-stats";
    stats.textContent = `0/${DAILY_LIMIT} sent today`;

    const button = createButton();
    actions.appendChild(stats);
    actions.appendChild(button);

    return actions;
  }

  function createButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Connect All";
    button.className = "my-extension-btn";
    button.addEventListener("click", onButtonClick);
    return button;
  }

  function removeInjectedButton() {
    if (isConnecting) {
      return;
    }

    const button = document.getElementById(BUTTON_ID);
    if (!button) {
      return;
    }

    const wrapper = button.closest(".my-extension-header");
    if (wrapper) {
      const heading = wrapper.querySelector("h2");
      if (heading && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(heading, wrapper);
      }
      wrapper.remove();
      return;
    }

    button.remove();
  }

  function isButtonInCard(card) {
    const button = document.getElementById(BUTTON_ID);
    return Boolean(button && card.contains(button));
  }

  function injectButton() {
    if (isConnecting) {
      return true;
    }

    const card = getTargetCard();
    if (!card) {
      return false;
    }

    if (isButtonInCard(card)) {
      return true;
    }

    removeInjectedButton();

    const wrapper = document.createElement("div");
    wrapper.className = "my-extension-header";
    const actions = createActionsBlock();

    const heading = findHeadingInCard(card) || card.querySelector("h2");

    if (heading && heading.parentNode && !heading.closest(".my-extension-header")) {
      heading.parentNode.insertBefore(wrapper, heading);
      wrapper.appendChild(heading);
      wrapper.appendChild(actions);
    } else {
      wrapper.classList.add("my-extension-header--standalone");
      card.insertBefore(wrapper, card.firstChild);
      wrapper.appendChild(actions);
    }

    updateStatsDisplay();
    return true;
  }

  function scheduleInject() {
    clearTimeout(injectDebounceTimer);
    injectDebounceTimer = setTimeout(() => {
      if (!isConnecting && isTargetPage()) {
        watchTargetCard();
      }
    }, 300);
  }

  function resetCardObserver() {
    if (cardObserver) {
      cardObserver.disconnect();
      cardObserver = null;
    }
    observedCard = null;
  }

  function resetPageObserver() {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
  }

  function watchTargetCard() {
    if (isConnecting) {
      return true;
    }

    if (observedCard && !observedCard.isConnected) {
      resetCardObserver();
    }

    const card = getTargetCard();
    if (!card) {
      return false;
    }

    if (card !== observedCard) {
      resetCardObserver();
      observedCard = card;

      cardObserver = new MutationObserver(() => {
        if (isConnecting) {
          return;
        }
        if (isTargetPage() && !isButtonInCard(card)) {
          scheduleInject();
        }
      });

      cardObserver.observe(card, {
        childList: true,
        subtree: true,
      });
    }

    return injectButton();
  }

  function ensurePageObserver() {
    if (!isTargetPage()) {
      resetPageObserver();
      return;
    }

    if (pageObserver) {
      return;
    }

    pageObserver = new MutationObserver(() => {
      if (isConnecting) {
        return;
      }
      if (isTargetPage()) {
        scheduleInject();
      }
    });

    pageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function cleanup() {
    if (isConnecting) {
      return;
    }
    removeInjectedButton();
    resetCardObserver();
    resetPageObserver();
  }

  function runWhenOnTargetPage() {
    if (!isLinkedInPage() || !isTargetPage()) {
      cleanup();
      return;
    }

    ensurePageObserver();
    watchTargetCard();
  }

  function checkUrlAndRun() {
    if (isConnecting) {
      return;
    }

    const currentUrl = location.href;
    const wasTarget = TARGET_URL_PATTERN.test(lastUrl);
    const onTarget = isTargetPage();

    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;

      if (wasTarget && onTarget) {
        resetCardObserver();
      } else if (!onTarget) {
        cleanup();
        return;
      }
    }

    runWhenOnTargetPage();
  }

  function hookSpaNavigation() {
    const { pushState, replaceState } = history;

    history.pushState = function (...args) {
      const result = pushState.apply(this, args);
      queueCheck();
      return result;
    };

    history.replaceState = function (...args) {
      const result = replaceState.apply(this, args);
      queueCheck();
      return result;
    };

    window.addEventListener("popstate", queueCheck);
  }

  function queueCheck() {
    if (isConnecting) {
      return;
    }
    checkUrlAndRun();
    setTimeout(checkUrlAndRun, 300);
    setTimeout(checkUrlAndRun, 800);
    setTimeout(checkUrlAndRun, 1500);
  }

  function hookClicks() {
    document.addEventListener(
      "click",
      (event) => {
        if (isConnecting) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const link = target.closest("a[href*='/people']");
        if (link) {
          queueCheck();
        }
      },
      true
    );
  }

  function start() {
    if (started) {
      return;
    }
    started = true;

    loadMemoryStore();

    hookSpaNavigation();
    hookClicks();
    checkUrlAndRun();
    setInterval(checkUrlAndRun, URL_CHECK_INTERVAL_MS);

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "RUN_INJECT" && !isConnecting) {
        queueCheck();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
