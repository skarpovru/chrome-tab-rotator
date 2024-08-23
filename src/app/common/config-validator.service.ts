import { Injectable } from '@angular/core';
import { ConfigData } from '../models/config-data.model';
import { PageConfig } from '../models/page-config.model';

@Injectable({
  providedIn: 'root',
})
export class ConfigValidatorService {
  validateConfigData(configData: ConfigData): boolean {
    const errors: string[] = [];
    if (!configData?.pages) {
      errors.push('pages are undefined.');
    } else {
      for (let i = 0; i < configData.pages.length; i++) {
        const page = configData.pages[i];
        this.collectErrors(() => this.validatePageConfig(page, i), errors);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(' ')}`);
    }

    return true;
  }

  validatePageConfig(pageConfig: PageConfig, index: number): boolean {
    const errors: string[] = [];

    if (!pageConfig.url || pageConfig.url.trim().length === 0) {
      errors.push(`pages[${index}].url must be a non-empty string.`);
    }

    if (pageConfig.delay < 3) {
      errors.push(`pages[${index}].delay must be equal or greater than 3.`);
    }

    if (pageConfig.reloadInterval < 0) {
      errors.push(
        `pages[${index}].reloadInterval must be equal or greater than 0.`
      );
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(' ')}`);
    }

    return true;
  }

  private collectErrors(validationFn: () => boolean, errors: string[]): void {
    try {
      validationFn();
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      }
    }
  }
}
