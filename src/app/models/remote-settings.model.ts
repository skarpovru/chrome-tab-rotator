export class RemoteSettings {
  /**
   * URL to fetch the configuration from.
   */
  configUrl: string = '';

  /**
   * Interval in minutes for reloading the configuration.
   * If set to 0, the configuration will not reload.
   */
  configReloadIntervalMinutes: number = 0;

  constructor(init?: Partial<RemoteSettings>) {
    Object.assign(this, init);
  }
}
