(function () {
  "use strict";

  const BUTTON_ID = "my-extension-connect-all-btn";
  const HEADING_CLASS = "wABVuRYChPnxETqtxOjZNnPsdLHQovkevMdxNA";
  const HEADING_TEXT = "People you may know";
  const CARD_SELECTOR =
    "div.artdeco-card.org-people-profile-card__card-spacing.org-people__card-margin-bottom";
  const PROFILE_CARD_SELECTOR = ".org-people-profile-card__profile-card-spacing";
  const CONNECT_SELECTOR = "footer button.artdeco-button";
  const TARGET_URL_PATTERN =
    /^https:\/\/www\.linkedin\.com\/company\/[^/?#]+\/people/i;
  const CLICK_DELAY_MS = 1200;
  const URL_CHECK_INTERVAL_MS = 400;

  let lastUrl = location.href;
  let cardObserver = null;
  let pageObserver = null;
  let observedCard = null;
  let started = false;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function clickSendOnModal() {
    const sendButton = [...document.querySelectorAll("button.artdeco-button")].find(
      (btn) => {
        const text = (
          btn.querySelector(".artdeco-button__text")?.textContent || ""
        )
          .trim()
          .toLowerCase();
        const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();

        return (
          text === "send without a note" ||
          text === "send" ||
          ariaLabel.includes("send invitation")
        );
      }
    );

    if (sendButton) {
      sendButton.click();
      return true;
    }

    return false;
  }

  async function onButtonClick(event) {
    const button = event.currentTarget;
    const card = getTargetCard();

    if (!card) {
      return;
    }

    const connectButtons = getConnectButtons(card);

    if (!connectButtons.length) {
      button.textContent = "No Connect buttons";
      await sleep(1500);
      button.textContent = "Connect All";
      return;
    }

    button.disabled = true;

    for (let i = 0; i < connectButtons.length; i++) {
      const connectBtn = connectButtons[i];

      if (!connectBtn.isConnected || connectBtn.disabled) {
        continue;
      }

      button.textContent = `Connecting ${i + 1}/${connectButtons.length}...`;
      connectBtn.click();
      await sleep(600);
      clickSendOnModal();
      await sleep(CLICK_DELAY_MS);
    }

    button.disabled = false;
    button.textContent = "Connect All";
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
    const card = getTargetCard();
    if (!card) {
      return false;
    }

    if (isButtonInCard(card)) {
      return true;
    }

    removeInjectedButton();

    const button = createButton();
    const wrapper = document.createElement("div");
    wrapper.className = "my-extension-header";

    const heading = findHeadingInCard(card) || card.querySelector("h2");

    if (heading && heading.parentNode && !heading.closest(".my-extension-header")) {
      heading.parentNode.insertBefore(wrapper, heading);
      wrapper.appendChild(heading);
      wrapper.appendChild(button);
    } else {
      wrapper.classList.add("my-extension-header--standalone");
      card.insertBefore(wrapper, card.firstChild);
      wrapper.appendChild(button);
    }

    return true;
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
        if (isTargetPage() && !isButtonInCard(card)) {
          injectButton();
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
      if (isTargetPage()) {
        watchTargetCard();
      }
    });

    pageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function cleanup() {
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
    checkUrlAndRun();
    setTimeout(checkUrlAndRun, 300);
    setTimeout(checkUrlAndRun, 800);
    setTimeout(checkUrlAndRun, 1500);
  }

  function hookClicks() {
    document.addEventListener(
      "click",
      (event) => {
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

    hookSpaNavigation();
    hookClicks();
    checkUrlAndRun();
    setInterval(checkUrlAndRun, URL_CHECK_INTERVAL_MS);

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "RUN_INJECT") {
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
