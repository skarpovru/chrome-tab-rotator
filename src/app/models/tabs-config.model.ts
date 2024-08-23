import { RemoteSettings } from './remote-settings.model';
import { TabConfig } from './tab-config.model';

export class TabsConfig {
  tabs: TabConfig[] = [];
  remoteSettings?: RemoteSettings;

  constructor(init?: Partial<TabsConfig>) {
    Object.assign(this, init);
  }
}
