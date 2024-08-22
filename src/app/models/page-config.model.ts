export class PageConfig {
  url: string = '';
  delay: number = 20;
  reloadInterval: number = 0;

  constructor(init?: Partial<PageConfig>) {
    Object.assign(this, init);
  }
}
