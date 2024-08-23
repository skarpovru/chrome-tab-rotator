import { RemoteSettings } from './remote-settings.model';
import { TabConfig } from './tab-config.model';

export class TabsConfig {
  /**
   * Array of tab configurations.
   */
  tabs: TabConfig[] = [];

  /**
   * Configuration of the remote settings.
   * If not set, it means the local configuration is used.
   */
  remoteSettings?: RemoteSettings;

  constructor(init?: Partial<TabsConfig>) {
    Object.assign(this, init);
  }
}
