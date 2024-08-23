import { PageConfig } from './page-config.model';

export class TabConfig {
  page: PageConfig = new PageConfig();
  tabId: number = 0;
  active: boolean = false;
  skip: boolean = false;
  validTill?: Date;
  retryCount: number = 0;
  reloadTimer?: number | ReturnType<typeof setInterval>;

  constructor(init?: Partial<TabConfig>) {
    Object.assign(this, init);
  }
}
