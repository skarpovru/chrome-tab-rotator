import {
  ConfigData,
  RemoteSettings,
  RotationState,
  StorageKeys,
  TabConfig,
  TabsConfig,
} from './app/models';
import { ConfigValidatorService } from './app/common/config-validator.service';
import { CustomHttpClient } from './app/common/custom-http-client.service';

export class RotationService {
  private rotationState = new RotationState();
  private maxRetries = 1;
  private defaultFailedPageReloadIntervalSeconds = 120;
  private currentIndex = 0;
  private rotationTimeout?: ReturnType<typeof setTimeout>;
  private tabsConfig?: TabsConfig;
  private configUpdateInterval?: ReturnType<typeof setInterval>;
  private currentConfig?: ConfigData; // Add this property to store the current running configuration

  constructor(
    private http: CustomHttpClient,
    private configValidator: ConfigValidatorService
  ) {
    chrome.storage.local.get(StorageKeys.RotationState, (result) => {
      const rotationState =
        (result?.[StorageKeys.RotationState] as RotationState) ||
        new RotationState();

      // Clean up tabs if they are still open
      if (rotationState.tabIds?.length > 0) {
        this.removeTabs(rotationState.tabIds);
      }

      // Continue rotation if it was active
      if (rotationState.isRotating) {
        this.initialize();
      }
    });
  }

  get isRotating() {
    return this.rotationState?.isRotating || false;
  }

  initialize() {
    if (this.configUpdateInterval) {
      clearInterval(this.configUpdateInterval);
    }

    if (this.isRotating) {
      this.stopRotation();
    }
    this.setRotationState(true);

    this.loadActualConfigurationFromLocalStorage(
      (loadedConfig, loadedRemoteSettings) => {
        const startRotation = (config: ConfigData) => {
          this.currentConfig = config; // Update the current running configuration
          this.createTabs(config, (createdTabsConfig) => {
            this.initializeRotationProcess(createdTabsConfig, config);
          });
        };

        if (
          !loadedRemoteSettings ||
          !loadedRemoteSettings?.configUrl ||
          !(loadedRemoteSettings?.configReloadIntervalMinutes > 0)
        ) {
          startRotation(loadedConfig);
          return;
        }

        const loadAndStartRotation = () => {
          this.loadRemoteConfig(
            loadedRemoteSettings?.configUrl || '',
            (remoteConfig) => {
              if (remoteConfig) {
                // Compare the current config with the loaded remote config
                if (
                  JSON.stringify(this.currentConfig) !==
                  JSON.stringify(remoteConfig)
                ) {
                  // Save the remote config to local storage
                  chrome.storage.local.set(
                    { [StorageKeys.RemoteConfig]: remoteConfig },
                    () => {
                      console.info('Remote config saved to local storage.');
                    }
                  );
                  // Clear the current rotation
                  if (this.isRotating) {
                    this.stopRotation();
                  }
                  // Start rotation updated with the remote config
                  startRotation(remoteConfig);
                }
              }
            }
          );
        };

        const reloadIntervalMs =
          loadedRemoteSettings.configReloadIntervalMinutes * 60 * 1000;

        loadAndStartRotation();
        this.configUpdateInterval = setInterval(
          loadAndStartRotation,
          reloadIntervalMs
        );
      }
    );
  }

  stopRotation() {
    console.log('stopRotation called');
    clearTimeout(this.rotationTimeout);
    this.tabsConfig?.tabs?.forEach((tabConfig) => {
      this.removeReloadTimer(tabConfig);
    });
    this.removeTabs(this.rotationState?.tabIds || []);
    this.setRotationState(false, []);
    this.currentIndex = 0;
  }

  tryRemoveTabFromRotation(tabId: number) {
    const tabConfig = this.tabsConfig?.tabs?.find((tab) => tab.tabId === tabId);
    if (tabConfig) {
      tabConfig.skip = true;
      this.removeReloadTimer(tabConfig);
      this.setRotationState(
        this.isRotating,
        this.rotationState.tabIds?.filter((id) => {
          return id !== tabId;
        })
      );
    }
  }

  onPageLoaded(tabId: number, url: string) {
    const tabConfig = this.tabsConfig?.tabs?.find((tab) => tab.tabId === tabId);
    if (tabConfig && tabConfig.page.url === url) {
      console.info('Page loaded in tabId', tabId);
      tabConfig.skip = false;
      this.removeReloadTimer(tabConfig);
      if (
        tabConfig.page.reloadIntervalSeconds &&
        tabConfig.page.reloadIntervalSeconds > 0
      ) {
        tabConfig.reloadTimer = setInterval(() => {
          chrome.tabs.reload(tabConfig.tabId);
        }, tabConfig.page.reloadIntervalSeconds * 1000);
      }
    }
  }

  onHandleError(tabId: number, errorUrl: string) {
    const tabConfig = this.tabsConfig?.tabs?.find((tab) => tab.tabId === tabId);
    if (tabConfig && tabConfig.page.url === errorUrl) {
      console.info('Page failed to load in tabId, errorUrl', tabId, errorUrl);

      if (tabConfig.retryCount < this.maxRetries) {
        tabConfig.retryCount++;
        chrome.tabs.update(tabId, { url: tabConfig.page.url });
      } else {
        tabConfig.skip = true;
        this.removeReloadTimer(tabConfig);

        const failedPageReloadIntervalSeconds =
          tabConfig.page.reloadIntervalSeconds > 0 &&
          this.defaultFailedPageReloadIntervalSeconds >
            tabConfig.page.reloadIntervalSeconds
            ? tabConfig.page.reloadIntervalSeconds
            : this.defaultFailedPageReloadIntervalSeconds;

        tabConfig.reloadTimer = setInterval(() => {
          chrome.tabs.reload(tabConfig.tabId);
        }, failedPageReloadIntervalSeconds * 1000);

        console.info(
          'Tab removed from rotation due to repeated errors:',
          tabId
        );
      }
    }
  }

  private setRotationState(rotating: boolean, tabIds?: number[]) {
    if (this.rotationState?.isRotating === rotating && !tabIds) {
      return;
    }
    if (!this.rotationState) {
      this.rotationState = new RotationState({ isRotating: rotating });
    } else {
      this.rotationState.isRotating = rotating;
    }

    if (tabIds) {
      this.rotationState.tabIds = tabIds;
    }
    chrome.storage.local.set(
      { [StorageKeys.RotationState]: this.rotationState },
      () => {
        chrome.runtime.sendMessage({
          action: 'rotationState',
          isRotating: rotating,
        });
      }
    );
  }

  private rotateTabs() {
    console.log('rotateTabs called, isRotating:', this.isRotating);
    if (!this.isRotating) {
      console.error('Rotation is not active.');
      return;
    }

    if (
      !this.tabsConfig ||
      !this.tabsConfig.tabs ||
      this.tabsConfig.tabs.length === 0
    ) {
      console.error('Configuration is not loaded properly.');
      this.stopRotation();
      return;
    }

    console.log('rotateTabs called', this.tabsConfig.tabs[this.currentIndex]);
    const currentTab = this.tabsConfig.tabs[this.currentIndex];
    if (currentTab !== undefined && !currentTab.skip) {
      chrome.tabs.update(currentTab.tabId, { active: true });
      const currentDelay = currentTab.page.delaySeconds * 1000;
      this.currentIndex = (this.currentIndex + 1) % this.tabsConfig.tabs.length;
      console.info('rotationTimeout currentDelay:', currentDelay);
      this.rotationTimeout = setTimeout(() => this.rotateTabs(), currentDelay);
    } else if (currentTab?.skip) {
      this.currentIndex = (this.currentIndex + 1) % this.tabsConfig.tabs.length;
      this.rotateTabs();
    } else {
      console.error('Invalid tab ID:', currentTab.tabId);
      this.currentIndex = (this.currentIndex + 1) % this.tabsConfig.tabs.length;
      this.rotateTabs();
    }
  }

  private loadActualConfigurationFromLocalStorage(
    callback: (
      loadedConfig: ConfigData,
      loadedRemoteSettings?: RemoteSettings
    ) => void
  ) {
    chrome.storage.local.get([StorageKeys.UseRemoteConfig], (result) => {
      const loadedUseRemoteConfig =
        result[StorageKeys.UseRemoteConfig] || false;
      if (loadedUseRemoteConfig) {
        chrome.storage.local.get(
          [StorageKeys.RemoteSettings, StorageKeys.RemoteConfig],
          (result) => {
            let loadedRemoteSettings =
              (result?.[StorageKeys.RemoteSettings] as RemoteSettings) ||
              new RemoteSettings();
            const loadedConfig = result?.[
              StorageKeys.RemoteConfig
            ] as ConfigData;
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

  private createTabs(
    configData: ConfigData,
    callback: (createdTabsConfig: TabsConfig) => void
  ) {
    const newTabsConfig = new TabsConfig();
    if (!configData?.pages || configData.pages.length === 0) {
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

  private removeTabs(tabIds: number[]) {
    tabIds.forEach((tabId) => {
      try {
        chrome.tabs.remove(tabId);
      } catch (error) {
        console.error('Error while removing tab:', error);
      }
    });
  }

  private removeReloadTimer(tabConfig: TabConfig) {
    tabConfig.retryCount = 0;
    if (tabConfig.reloadTimer) {
      clearInterval(tabConfig.reloadTimer as number);
      tabConfig.reloadTimer = undefined;
    }
  }

  private loadRemoteConfig(
    url: string,
    callback: (configData: ConfigData) => void
  ) {
    this.http.get<ConfigData>(url).then(
      (configData) => {
        try {
          this.configValidator.validateConfigData(configData);
          callback(configData);
        } catch (parseError) {
          console.error('Failed to parse configuration data.', parseError);
        }
      },
      (error) => {
        console.error('Failed to load configuration.', error);
      }
    );
  }

  private initializeRotationProcess(
    createdTabsConfig: TabsConfig,
    configData: ConfigData
  ) {
    this.setRotationState(
      true,
      createdTabsConfig.tabs.map((tab) => tab.tabId)
    );

    if (configData.isFullscreen) {
      chrome.windows.getCurrent({}, (window) => {
        chrome.windows.update(window.id!, { state: 'fullscreen' });
      });
    }

    this.tabsConfig = createdTabsConfig;
    this.rotateTabs();
  }
}
