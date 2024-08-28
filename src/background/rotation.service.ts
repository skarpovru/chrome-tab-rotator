import {
  ConfigData,
  RemoteSettings,
  RotationState,
  StorageKeys,
  TabConfig,
  TabsConfig,
} from '../app/models';
import { ConfigValidatorService, ToolbarManagerService } from '../app/services';
import { CustomHttpClient } from './custom-http-client.service';
import isEqual from 'lodash/isEqual';

export class RotationService {
  private rotationState = new RotationState();
  private maxRetries = 1;
  private defaultFailedPageReloadIntervalSeconds = 120;
  private defaultAllPagesFailedWaitIntervalSeconds = 120;
  private currentIndex = 0;
  private rotationTimeout?: ReturnType<typeof setTimeout>;
  private tabsConfig?: TabsConfig;
  private configUpdateInterval?: ReturnType<typeof setInterval>;
  private currentConfig?: ConfigData; // Add this property to store the current running configuration

  get isRotating(): boolean {
    return this.rotationState?.isRotating || false;
  }

  get isAnyTabReady(): boolean {
    return (
      this.tabsConfig?.tabs?.some(
        (tab) => tab.tabIdReady || tab.nextTabIdReady
      ) || false
    );
  }

  constructor(
    private http: CustomHttpClient,
    private configValidator: ConfigValidatorService,
    private toolbarManagerService: ToolbarManagerService
  ) {
    this.restorePreviousRotationState();
  }

  private async restorePreviousRotationState(): Promise<void> {
    try {
      console.debug('Restore previous rotation state.');
      const result = await chrome.storage.local.get(StorageKeys.RotationState);
      const rotationState =
        (result?.[StorageKeys.RotationState] as RotationState) ||
        new RotationState();

      // Clean up tabs if they are still open
      if (rotationState.tabIds?.length > 0) {
        await this.removeTabs(rotationState.tabIds);
      }

      // Continue rotation if it was active
      if (rotationState.isRotating) {
        await this.initialize();
      }
    } catch (error) {
      console.error('Failed to initialize rotation state:', error);
    }
  }

  async initialize(): Promise<void> {
    try {
      console.debug('Starting initialization of rotation service.');
      if (this.configUpdateInterval) {
        clearInterval(this.configUpdateInterval);
      }

      if (this.isRotating) {
        await this.stopRotation();
      }

      await this.setRotationState(true);
      const { loadedConfig, loadedRemoteSettings } =
        await this.loadActualConfigurationFromLocalStorage();

      const startRotation = async (config: ConfigData) => {
        await this.createTabs(config);
        await this.startRotationProcess(config);
      };

      if (
        !loadedRemoteSettings ||
        !loadedRemoteSettings.configUrl ||
        !(loadedRemoteSettings.configReloadIntervalMinutes > 0)
      ) {
        await startRotation(loadedConfig);
      } else {
        const loadAndStartRotation = async () => {
          try {
            const remoteConfig = await this.loadRemoteConfig(
              loadedRemoteSettings.configUrl
            );

            // Compare the current config with the loaded remote config
            if (remoteConfig && !isEqual(this.currentConfig, remoteConfig)) {
              // Save the remote config to local storage
              await chrome.storage.local.set({
                [StorageKeys.RemoteConfig]: remoteConfig,
              });
              console.info('Remote config saved to local storage.');

              // Clear the current rotation
              if (this.isRotating) {
                await this.stopRotation();
              }

              // Start rotation updated with the remote config
              await startRotation(remoteConfig);
            }
          } catch (error) {
            console.error('Failed to load remote configuration:', error);
          }
        };

        const reloadIntervalMs =
          loadedRemoteSettings.configReloadIntervalMinutes * 60 * 1000;
        await loadAndStartRotation();
        this.configUpdateInterval = setInterval(
          loadAndStartRotation,
          reloadIntervalMs
        );
      }
    } catch (error) {
      console.error('Failed to initialize rotation:', error);
      throw error;
    }
  }

  private waitForTabToLoad(tabConfig: TabConfig): Promise<void> {
    return new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (
          tabConfig &&
          (updatedTabId === tabConfig.tabId ||
            updatedTabId === tabConfig.nextTabId) &&
          changeInfo.status === 'complete'
        ) {
          if (tabConfig.nextTabId === updatedTabId) {
            tabConfig.nextTabIdReady = true;
          } else {
            tabConfig.tabIdReady = true;
          }
          console.debug('Initial loading of tab complete.', tabConfig);

          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private async startRotationProcess(configData: ConfigData): Promise<void> {
    console.debug('Start rotation process');
    try {
      await this.setRotationState(
        true,
        this.tabsConfig?.tabs.map((tab) => tab.tabId)
      );

      if (configData.isFullscreen) {
        chrome.windows.getCurrent({}, (window) => {
          // Switch to fullscreen mode in background, don not wait for the result
          chrome.windows.update(window.id!, { state: 'fullscreen' });
        });
      }

      await this.rotateTabs();
    } catch (error) {
      console.error('Failed to start rotation process:', error);
      throw error;
    }
  }

  async stopRotation(): Promise<void> {
    console.debug('Stop rotation process');
    clearTimeout(this.rotationTimeout);
    this.tabsConfig?.tabs?.forEach((tabConfig) => {
      this.removeReloadTimer(tabConfig);
    });

    try {
      await this.removeTabs(this.rotationState?.tabIds || []);
      await this.setRotationState(false, []);
      this.currentIndex = 0;
    } catch (error) {
      console.error('Failed to stop rotation:', error);
      throw error;
    }
  }

  /**
   * Removes the tab from the rotation if tab was closed by the user
   */
  async tryRemoveTabFromRotationOnClose(tabId: number): Promise<void> {
    const tabConfig = this.tabsConfig?.tabs?.find(
      (tab) => tab.tabId === tabId || tab.nextTabId === tabId
    );
    if (!tabConfig) {
      // Tab is not in the rotation
      return;
    }
    console.debug(`Removing closed tab ${tabId} from configuration`, tabConfig);
    if (tabConfig.nextTabId === tabId) {
      tabConfig.nextTabIdReady = false;
      tabConfig.nextTabId = 0;
    } else {
      tabConfig.tabIdReady = false;
      tabConfig.tabId = 0;
    }

    if (!(tabConfig.tabId > 0 || tabConfig.nextTabId > 0)) {
      // Remove updated tab from the rotation state if it was the last open tab
      this.removeReloadTimer(tabConfig);
    }
    await this.setRotationState(
      this.isRotating,
      this.rotationState.tabIds?.filter((id) => id !== tabId)
    );
  }

  async onPageLoaded(tabId: number, url: string): Promise<void> {
    const tabConfig = this.tabsConfig?.tabs?.find(
      (tab) => tab.tabId === tabId || tab.nextTabId === tabId
    );

    if (!tabConfig || tabConfig.page.url !== url) {
      return;
    }

    console.debug(`Page loaded in tab ${tabId}`);

    if (tabConfig.nextTabId === tabId) {
      tabConfig.nextTabIdReady = true;
    } else {
      tabConfig.tabIdReady = true;
    }

    this.removeReloadTimer(tabConfig);

    if (tabConfig.page.reloadIntervalSeconds > 0) {
      console.debug('Setting reload timer for tab:', tabConfig);
      tabConfig.reloadTimer = setTimeout(async () => {
        try {
          if (tabConfig.nextTabId > 0) {
            console.debug('Reload the page next tab', tabConfig);
            await chrome.tabs.reload(tabConfig.nextTabId);
          } else {
            console.debug(
              'Creating a new tab for loading fresh version of the page',
              tabConfig.tabId
            );
            await this.createTab(tabConfig);
            // Add the tab to the rotation state if it was not added before
            await this.setRotationState(this.rotationState.isRotating, [
              ...this.rotationState.tabIds,
              tabConfig.nextTabId > 0 ? tabConfig.nextTabId : tabConfig.tabId,
            ]);
          }
        } catch (error) {
          console.error('Error updating tab:', error);
        }
      }, tabConfig.page.reloadIntervalSeconds * 1000);
    }
  }

  async onHandleError(tabId: number, errorUrl: string): Promise<void> {
    const tabConfig = this.tabsConfig?.tabs?.find(
      (tab) => tab.tabId === tabId || tab.nextTabId === tabId
    );
    if (!tabConfig || tabConfig.page.url !== errorUrl) {
      return;
    }
    console.info('Page failed to load in tabId, errorUrl', tabId, errorUrl);

    if (tabConfig.retryCount < this.maxRetries) {
      tabConfig.retryCount++;
      try {
        await chrome.tabs.update(tabId, { url: tabConfig.page.url });
      } catch (error) {
        console.error('Error updating tab:', error);
      }
    } else {
      if (tabConfig.nextTabId === tabId) {
        tabConfig.nextTabIdReady = false;
      } else {
        tabConfig.tabIdReady = false;
      }
      this.removeReloadTimer(tabConfig);

      const failedPageReloadIntervalSeconds =
        tabConfig.page.reloadIntervalSeconds > 0 &&
        this.defaultFailedPageReloadIntervalSeconds >
          tabConfig.page.reloadIntervalSeconds
          ? tabConfig.page.reloadIntervalSeconds
          : this.defaultFailedPageReloadIntervalSeconds;

      tabConfig.reloadTimer = setTimeout(async () => {
        try {
          await chrome.tabs.reload(tabConfig.tabId);
        } catch (error) {
          console.error('Error reloading tab:', error);
        }
      }, failedPageReloadIntervalSeconds * 1000);

      console.info('Tab removed from rotation due to repeated errors:', tabId);
    }
  }

  private async setRotationState(
    rotating: boolean,
    tabIds?: number[]
  ): Promise<void> {
    console.debug('Set rotation state.', rotating, tabIds);
    if (this.rotationState?.isRotating === rotating && !tabIds) {
      console.debug(
        'No need to set rotation, current state is the same and tabIds are not provided,'
      );
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

    try {
      await chrome.storage.local.set({
        [StorageKeys.RotationState]: this.rotationState,
      });

      await this.toolbarManagerService.trySetToolbarIcon(rotating);
    } catch (error) {
      console.error('Failed to set rotation state:', error);
    }
  }

  private async rotateTabs(): Promise<void> {
    console.debug('Rotate tabs called, isRotating:', this.isRotating);
    if (!this.isRotating) {
      console.error('Rotation is not active.');
      return;
    }

    if (!this.tabsConfig || !(this.tabsConfig.tabs?.length > 0)) {
      console.error('Configuration is not loaded properly.');
      await this.stopRotation();
      return;
    }

    const currentTab = this.tabsConfig.tabs[this.currentIndex];
    console.debug('Rotate current tab', currentTab);
    if (currentTab && (currentTab.tabIdReady || currentTab.nextTabIdReady)) {
      if (currentTab.nextTabId > 0 && currentTab.nextTabIdReady) {
        await this.openNextPageTab(currentTab);
        await this.scheduleNextRotation(currentTab.page.delaySeconds);
      } else {
        try {
          await chrome.tabs.update(currentTab.tabId, { active: true });
        } catch (error) {
          console.error('Error updating tab:', error);
        } finally {
          await this.scheduleNextRotation(currentTab.page.delaySeconds);
        }
      }
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.tabsConfig.tabs.length;
      if (
        this.currentIndex + 1 === this.tabsConfig.tabs.length &&
        !this.isAnyTabReady
      ) {
        console.error(
          'All pages not ready for displaying. Waiting till the next check...',
          this.defaultAllPagesFailedWaitIntervalSeconds
        );
        await new Promise<void>((resolve) => {
          setTimeout(
            resolve,
            this.defaultAllPagesFailedWaitIntervalSeconds * 1000
          );
        });
        await this.rotateTabs();
      } else {
        await this.rotateTabs();
      }
    }
  }

  private async scheduleNextRotation(delaySeconds: number): Promise<void> {
    console.debug('Schedule next rotation in seconds:', delaySeconds);
    const currentDelay = delaySeconds * 1000;
    this.currentIndex = (this.currentIndex + 1) % this.tabsConfig!.tabs.length;

    await new Promise<void>((resolve) => {
      this.rotationTimeout = setTimeout(async () => {
        await this.rotateTabs();
        resolve();
      }, currentDelay);
    });
  }

  /**
   * Switch to the next tab and remove the current tab from the rotation
   */
  private async openNextPageTab(tabConfig: TabConfig): Promise<void> {
    if (!(tabConfig.nextTabId > 0)) {
      console.error('Next page tab ID is not defined.', tabConfig);
    }

    try {
      console.debug(
        `Switching to the tab ${tabConfig.nextTabId} with freshly loaded page.`,
        tabConfig
      );
      await chrome.tabs.update(tabConfig.nextTabId, { active: true });

      const tabIdToRemove = tabConfig.tabId;
      await this.removeTabs([tabIdToRemove]);
      await this.setRotationState(
        this.isRotating,
        this.rotationState.tabIds?.filter((id) => id !== tabIdToRemove)
      );

      tabConfig.tabId = tabConfig.nextTabId;
      tabConfig.nextTabId = 0;
      tabConfig.tabIdReady = true;
      tabConfig.nextTabIdReady = false;
      console.debug(
        `Switched to the next page tab ${tabConfig.tabId}`,
        tabConfig
      );
    } catch (error) {
      console.error('Error in open next page tab:', error);
    }
  }

  private async loadActualConfigurationFromLocalStorage(): Promise<{
    loadedConfig: ConfigData;
    loadedRemoteSettings?: RemoteSettings;
  }> {
    try {
      console.debug('Loading configuration from local storage.');
      const useRemoteConfigResult = await chrome.storage.local.get(
        StorageKeys.UseRemoteConfig
      );
      const useRemoteConfig =
        useRemoteConfigResult[StorageKeys.UseRemoteConfig] || false;

      if (useRemoteConfig) {
        const remoteSettingsResult = await chrome.storage.local.get(
          StorageKeys.RemoteSettings
        );
        const remoteConfigResult = await chrome.storage.local.get(
          StorageKeys.RemoteConfig
        );
        const loadedRemoteSettings =
          remoteSettingsResult[StorageKeys.RemoteSettings];
        const loadedConfig = remoteConfigResult[StorageKeys.RemoteConfig];

        if (!loadedConfig) {
          throw new Error('Remote configuration is not available.');
        }

        return { loadedConfig, loadedRemoteSettings };
      } else {
        const localConfigResult = await chrome.storage.local.get(
          StorageKeys.LocalConfig
        );
        const loadedConfig = localConfigResult[StorageKeys.LocalConfig];

        if (!loadedConfig) {
          throw new Error('Local configuration is not available.');
        }

        return { loadedConfig };
      }
    } catch (error) {
      console.error('Failed to load configuration from local storage:', error);
      throw error;
    }
  }

  private async createTab(tabConfig: TabConfig): Promise<TabConfig> {
    if (!tabConfig?.page?.url) {
      console.error('Error creating tab, url not defined.');
      return tabConfig;
    }

    if (tabConfig.nextTabId > 0) {
      console.error('Next tab already set, not creating a new tab:', tabConfig);
      return tabConfig;
    }

    try {
      console.debug('Creating tab:', tabConfig);
      const tab = await chrome.tabs.create({
        url: tabConfig.page.url,
        active: tabConfig.active,
      });

      if (tabConfig.tabId > 0) {
        tabConfig.nextTabId = tab.id!;
      } else {
        tabConfig.tabId = tab.id!;
      }
      console.debug('Tab created ' + tab.id!, tab);
    } catch (error) {
      console.error('Error creating tab ' + tabConfig.page.url, error);
    } finally {
      return tabConfig;
    }
  }

  private async createTabs(configData: ConfigData): Promise<void> {
    console.debug('Creating tabs:', configData);
    if (!configData?.pages || configData.pages.length === 0) {
      return;
    }
    this.tabsConfig = new TabsConfig();
    const tabPromises = configData.pages.map(async (page, index) => {
      const tab = new TabConfig({
        page,
        active: index === 0,
      });
      const createdTab = await this.createTab(tab);
      if (createdTab) {
        this.tabsConfig?.tabs.push(createdTab);
        await this.waitForTabToLoad(createdTab);
      }

      return createdTab;
    });

    await Promise.all(tabPromises);
  }

  private async removeTabs(tabIds: number[]): Promise<void> {
    console.debug('Removing tabs:', tabIds);
    try {
      await Promise.all(tabIds.map((tabId) => chrome.tabs.remove(tabId)));
    } catch (error) {
      console.error('Failed to remove tabs:', error);
    }
  }

  private removeReloadTimer(tabConfig: TabConfig) {
    tabConfig.retryCount = 0;
    if (tabConfig.reloadTimer) {
      console.debug('Removing reload timer for tab:', tabConfig);
      clearInterval(tabConfig.reloadTimer as number);
      tabConfig.reloadTimer = undefined;
    }
  }

  private async loadRemoteConfig(url: string): Promise<ConfigData | undefined> {
    console.debug('Loading remote configuration:', url);
    try {
      const configData = await this.http.get<ConfigData>(url);
      this.configValidator.validateConfigData(configData);
      return configData;
    } catch (error) {
      console.error('Failed to load or validate configuration.', error);
      return undefined;
    }
  }
}
