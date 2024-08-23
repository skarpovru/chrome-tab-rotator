import {
  ConfigData,
  RemoteSettings,
  StorageKeys,
  TabConfig,
  TabsConfig,
} from './app/models';

const maxRetries = 1;
const defaultFailedPageReloadIntervalSeconds = 120;
let currentIndex = 0;
let rotationTimeout: ReturnType<typeof setTimeout>;
let isRotating = false;
let tabsConfig: TabsConfig;
let configUpdateInterval: ReturnType<typeof setInterval>;

function setRotationState(rotating: boolean) {
  isRotating = rotating;
  chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state
}

function rotateTabs() {
  console.log('rotateTabs called, isRotating:', isRotating);
  if (
    !isRotating ||
    !tabsConfig ||
    !tabsConfig.tabs ||
    tabsConfig.tabs.length === 0
  ) {
    console.error('Rotation is not active.');
    return;
  }

  console.log('rotateTabs called', tabsConfig.tabs[currentIndex]);
  const currentTab = tabsConfig.tabs[currentIndex];
  if (currentTab !== undefined && !currentTab.skip) {
    chrome.tabs.update(currentTab.tabId, { active: true });
    const currentDelay = currentTab.page.delay * 1000;
    currentIndex = (currentIndex + 1) % tabsConfig.tabs.length;
    console.info('rotationTimeout currentDelay:', currentDelay);
    rotationTimeout = setTimeout(rotateTabs, currentDelay);
  } else if (currentTab?.skip) {
    // Skip the tab and move to the next one
    currentIndex = (currentIndex + 1) % tabsConfig.tabs.length;
    rotateTabs();
  } else {
    console.error('Invalid tab ID:', currentTab.tabId);
    currentIndex = (currentIndex + 1) % tabsConfig.tabs.length;
    rotateTabs();
  }
}

function loadActualConfigurationFromLocalStorage(
  callback: (
    loadedConfig: ConfigData,
    loadedRemoteSettings?: RemoteSettings
  ) => void
) {
  chrome.storage.local.get([StorageKeys.UseRemoteConfig], (result) => {
    const loadedUseRemoteConfig = result[StorageKeys.UseRemoteConfig] || false;
    if (loadedUseRemoteConfig) {
      chrome.storage.local.get(
        [StorageKeys.RemoteSettings, StorageKeys.RemoteConfig],
        (result) => {
          let loadedRemoteSettings =
            (result?.[StorageKeys.RemoteSettings] as RemoteSettings) ||
            new RemoteSettings();
          const loadedConfig = result?.[StorageKeys.RemoteConfig] as ConfigData;
          callback(loadedConfig, loadedRemoteSettings);
        }
      );
    } else {
      chrome.storage.local.get(StorageKeys.LocalConfig, (result) => {
        const loadedConfig = result?.[StorageKeys.LocalConfig] as ConfigData;
        callback(loadedConfig);
      });
    }
  });
}

function stopRotation() {
  console.log('stopRotation called');
  clearTimeout(rotationTimeout);
  setRotationState(false);
  // Clear all tabs and timers
  tabsConfig?.tabs?.forEach((tabConfig) => {
    if (tabConfig.reloadTimer) {
      clearInterval(tabConfig.reloadTimer as number);
      tabConfig.reloadTimer = undefined;
      tabConfig.retryCount = 0;
    }
    chrome.tabs.remove(tabConfig.tabId);
  });
  currentIndex = 0;
}

function createTabs(
  configData: ConfigData,
  callback: (createdTabsConfig: TabsConfig) => void
) {
  const newTabsConfig = new TabsConfig();
  if (!configData?.pages || configData.pages.length === 0) {
    // No pages available for rotation
    callback(newTabsConfig);
    return;
  }
  configData.pages.forEach((page, index) => {
    chrome.tabs.create({ url: page.url, active: index === 0 }, (tab) => {
      console.log('Tab created:', tab);
      const tabConfig = new TabConfig({
        page,
        tabId: tab.id!,
        active: index === 0,
      });
      newTabsConfig.tabs.push(tabConfig);
      if (newTabsConfig.tabs.length === configData.pages.length) {
        callback(newTabsConfig);
      }
    });
  });
}

function onHandleError(tabId: number, errorUrl: string) {
  console.info('Page failed to load in tabId, errorUrl', tabId, errorUrl);

  const tabConfig = tabsConfig?.tabs?.find((tab) => tab.tabId === tabId);
  if (tabConfig && tabConfig.page.url === errorUrl) {
    if (tabConfig.retryCount < maxRetries) {
      tabConfig.retryCount++;
      chrome.tabs.update(tabId, { url: tabConfig.page.url });
    } else {
      tabConfig.retryCount = 0;
      tabConfig.skip = true;
      removeReloadTimer(tabConfig);

      // Set a special reload interval for the failed page.
      // If regular reload interval is shorter than the failed page reload interval, then use it
      const failedPageReloadIntervalSeconds =
        tabConfig.page.reloadInterval > 0 &&
        defaultFailedPageReloadIntervalSeconds > tabConfig.page.reloadInterval
          ? tabConfig.page.reloadInterval
          : defaultFailedPageReloadIntervalSeconds;

      tabConfig.reloadTimer = setInterval(() => {
        chrome.tabs.reload(tabConfig.tabId);
      }, failedPageReloadIntervalSeconds * 1000);

      console.info('Tab removed from rotation due to repeated errors:', tabId);
    }
  } else {
    //console.error('Invalid tabId or page not found for tabId:', tabId);
  }
}

function removeReloadTimer(tabConfig: TabConfig) {
  if (tabConfig.reloadTimer) {
    clearInterval(tabConfig.reloadTimer as number);
    tabConfig.reloadTimer = undefined;
  }
}

function onPageLoaded(tabId: number, url: string) {
  console.info('Page loaded in tabId', tabId);

  const tabConfig = tabsConfig?.tabs?.find((tab) => tab.tabId === tabId);
  if (tabConfig && tabConfig.page.url === url) {
    tabConfig.retryCount = 0;
    tabConfig.skip = false;
    removeReloadTimer(tabConfig);
    // Set a reload interval for the page.
    if (tabConfig.page.reloadInterval && tabConfig.page.reloadInterval > 0) {
      tabConfig.reloadTimer = setInterval(() => {
        chrome.tabs.reload(tabConfig.tabId);
      }, tabConfig.page.reloadInterval * 1000);
    }

    console.info('Tab removed from rotation due to repeated errors:', tabId);
  } else {
    //console.error('Invalid tabId or page not found for tabId:', tabId);
  }
}

if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
  chrome.webNavigation.onErrorOccurred.addListener((details) => {
    onHandleError(details.tabId, details.url);
  });
} else {
  console.error('webNavigation API is not available.');
}

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
  chrome.webNavigation.onCompleted.addListener((details) => {
    onPageLoaded(details.tabId, details.url);
  });
} else {
  console.error('webNavigation API is not available.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message, isRotating);
  if (message.action === 'rotateTabs') {
    if (!isRotating) {
      initialize();
    }
  } else if (message.action === 'stopRotation') {
    stopRotation();
  } else if (message.action === 'getRotationState') {
    sendResponse({ isRotating });
  }
});

/*chrome.action.onClicked.addListener(() => {
  if (!isRotating) {
    console.log('Starting rotation from action button');
    isRotating = true;
    chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state
    if (tabIds.length === 0) {
      createTabs(() => {
        startRotation();
      });
    } else {
      startRotation();
    }
  }
});*/

function loadRemoteConfig(url: string, callback: () => void) {
  // Implement the logic to load remote config from the URL
  // Once loaded, call the callback function
  callback();
}

function initialize() {
  if (configUpdateInterval) {
    // Remove existing interval for remote config upload
    clearInterval(configUpdateInterval);
  }

  // Clear existing tabs and timers
  if (isRotating) {
    stopRotation();
  }

  isRotating = true;
  chrome.runtime.sendMessage({ action: 'rotationState', isRotating }); // Send rotation state

  loadActualConfigurationFromLocalStorage(
    (loadedConfig, loadedRemoteSettings) => {
      if (
        loadedRemoteSettings?.configReloadIntervalMinutes &&
        loadedRemoteSettings?.configReloadIntervalMinutes > 0
      ) {
        // Run the rotation process with the loaded configuration
        // and then set an interval to reload the configuration
        createTabs(loadedConfig, (createdTabsConfig) => {
          initializeRotationProcess(createdTabsConfig);
        });
        configUpdateInterval = setInterval(() => {
          loadActualConfigurationFromLocalStorage((reloadedConfig) => {
            // TODO: Check if the configuration has changed
            if (reloadedConfig) {
              stopRotation();
              createTabs(reloadedConfig, (createdTabsConfig) => {
                initializeRotationProcess(createdTabsConfig);
              });
            }
          });
        }, loadedRemoteSettings.configReloadIntervalMinutes * 60 * 1000);
      } else {
        createTabs(loadedConfig, (createdTabsConfig) => {
          initializeRotationProcess(createdTabsConfig);
        });
      }
    }
  );
}

function initializeRotationProcess(createdTabsConfig: TabsConfig) {
  tabsConfig = createdTabsConfig;
  rotateTabs();
}
