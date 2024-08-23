import { PageConfig } from './page-config.model';

export class ConfigData {
  /**
   * Array of page configurations.
   */
  pages: PageConfig[] = [];

  constructor(init?: Partial<ConfigData>) {
    Object.assign(this, init);
  }
}
