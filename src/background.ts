let pages: { url: string; delay: number; reloadInterval: number }[] = [];
const maxRetries = 1;
let tabIds: number[] = [];
let currentIndex = 0;
let reloadTimers: (number | ReturnType<typeof setInterval>)[] = [];
let retryCount = 0;
let rotationTimeout: ReturnType<typeof setTimeout>;
let isRotating = false;

function rotateTabs() {
  console.log('rotateTabs called, isRotating:', isRotating);
  if (!isRotating) {
    console.error('Rotation is not active.');
    return;
  }

  chrome.storage.local.get('pages', (result) => {
    pages = result['pages'] || [];

    if (tabIds.length === 0) {
      console.error('No tabs available for rotation.');
      isRotating = false;
      chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state
      return;
    }

    console.log('rotateTabs called', tabIds[currentIndex]);
    if (tabIds[currentIndex] !== undefined) {
      chrome.tabs.update(tabIds[currentIndex], { active: true });
      const currentDelay = pages[currentIndex].delay * 1000;
      currentIndex = (currentIndex + 1) % pages.length;
      console.info('rotationTimeout currentDelay:', currentDelay);
      rotationTimeout = setTimeout(rotateTabs, currentDelay);
    } else {
      console.error('Invalid tab ID:', tabIds[currentIndex]);
      currentIndex = (currentIndex + 1) % pages.length;
      rotateTabs();
    }
  });
}

function stopRotation() {
  console.log('stopRotation called');
  clearTimeout(rotationTimeout);
  isRotating = false;
  chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state
  reloadTimers.forEach((timer) => clearInterval(timer as number));
  reloadTimers = [];
  tabIds.forEach((tabId) => {
    if (tabId !== undefined) {
      chrome.tabs.remove(tabId);
    }
  });
  tabIds = [];
  currentIndex = 0;
  retryCount = 0;
}

function createTabs(callback: () => void) {
  let createdTabs = 0;
  pages.forEach((page, index) => {
    chrome.tabs.create({ url: page.url, active: index === 0 }, (tab) => {
      console.log('Tab created:', tab);
      tabIds[index] = tab.id!;
      createdTabs++;
      if (createdTabs === pages.length) {
        callback();
      }
    });
  });
}

function startReloadTimers() {
  pages.forEach((page, index) => {
    if (page.reloadInterval) {
      reloadTimers[index] = setInterval(() => {
        chrome.tabs.reload(tabIds[index]);
      }, page.reloadInterval * 1000);
    }
  });
}

function handleError(tabId: number, errorUrl: string) {
  console.info('handleError tabId, errorUrl', tabId, errorUrl);

  const pageIndex = tabIds.indexOf(tabId);
  if (
    pageIndex !== -1 &&
    pages[pageIndex] &&
    pages[pageIndex].url === errorUrl
  ) {
    if (retryCount < maxRetries) {
      retryCount++;
      chrome.tabs.update(tabId, { url: errorUrl });
    } else {
      retryCount = 0;
      clearInterval(reloadTimers[pageIndex] as number);
      reloadTimers.splice(pageIndex, 1);
      tabIds.splice(pageIndex, 1);
      pages.splice(pageIndex, 1);
      console.info('Tab removed from rotation due to repeated errors:', tabId);
      if (currentIndex >= tabIds.length) {
        currentIndex = 0;
      }
      chrome.tabs.remove(tabId);
    }
  } else {
    console.error('Invalid tabId or page not found for tabId:', tabId);
  }
}

if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
  chrome.webNavigation.onErrorOccurred.addListener((details) => {
    handleError(details.tabId, details.url);
  });
} else {
  console.error('webNavigation API is not available.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message, isRotating);
  if (message.action === 'rotateTabs') {
    if (!isRotating) {
      console.log('Starting rotation from message listener');
      isRotating = true;
      chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state
      if (tabIds.length === 0) {
        createTabs(() => {
          rotateTabs();
          startReloadTimers();
        });
      } else {
        rotateTabs();
        startReloadTimers();
      }
    }
  } else if (message.action === 'stopRotation') {
    stopRotation();
  } else if (message.action === 'getRotationState') {
    sendResponse({ isRotating });
  }
});

chrome.action.onClicked.addListener(() => {
  if (!isRotating) {
    console.log('Starting rotation from action button');
    isRotating = true;
    chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state
    if (tabIds.length === 0) {
      createTabs(() => {
        rotateTabs();
        startReloadTimers();
      });
    } else {
      rotateTabs();
      startReloadTimers();
    }
  }
});

if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('pages', (result) => {
    pages = result['pages'] || [];
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes['pages']) {
      pages = changes['pages'].newValue;
    }
  });
} else {
  console.error('Chrome Storage API is not available.');
}
