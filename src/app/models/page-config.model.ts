export class PageConfig {
  /**
   * URL of the page to be shown in the tab.
   */
  url: string = '';

  /**
   * Delay in seconds while the page is shown.
   */
  delaySeconds: number = 20;

  /**
   * Interval in seconds to reload the page.
   * When set to 0, the page will not be reloaded.
   */
  reloadIntervalSeconds: number = 0;

  constructor(init?: Partial<PageConfig>) {
    Object.assign(this, init);
  }
}
