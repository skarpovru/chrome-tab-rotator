import { PageConfig } from './page-config.model';

export class ConfigData {
  pages: PageConfig[] = [];

  constructor(init?: Partial<ConfigData>) {
    Object.assign(this, init);
  }
}
