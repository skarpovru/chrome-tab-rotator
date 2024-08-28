export class PageConfig {
  /**
   * The link to the page to display.
   * Can be remote (starting with `https://`) or local (starting with `file://`).
   */
  url: string = '';

  /**
   * The time in seconds that the page is displayed.
   */
  delaySeconds: number = 20;

  /**
   * Page reload interval in seconds.
   * If set to 0, the page will not reload.
   */
  reloadIntervalSeconds: number = 0;

  constructor(init?: Partial<PageConfig>) {
    Object.assign(this, init);
  }
}
