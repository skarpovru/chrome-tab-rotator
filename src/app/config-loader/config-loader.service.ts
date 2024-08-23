import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import { ConfigData } from '../models';
import { ConfigValidatorService } from '../common/config-validator.service';

@Injectable({
  providedIn: 'root',
})
export class ConfigLoaderService {
  constructor(
    private http: HttpClient,
    private configValidator: ConfigValidatorService
  ) {}

  loadConfig(url: string): Observable<ConfigData> {
    return this.http.get<ConfigData>(url, { observe: 'response' }).pipe(
      map((response) => {
        try {
          const configData = response.body as ConfigData;
          this.configValidator.validateConfigData(configData);
          return configData;
        } catch (parseError) {
          throw new Error('Failed to parse configuration data. ' + parseError);
        }
      }),
      catchError((error) => {
        console.error('Failed to load configuration.', error);
        let errorMessage = 'Failed to load configuration.';
        if (error.status === 0) {
          errorMessage += ' Network error or CORS issue.';
        } else if (error.status === 404) {
          errorMessage += ' File not found.';
        } else if (error.status === 401 || error.status === 403) {
          errorMessage += ' Unauthorized.';
        } else if (error.message === 'Failed to parse configuration data.') {
          errorMessage += ' Invalid configuration data format.';
        } else {
          errorMessage += ` ${error.message}`;
        }
        console.error(errorMessage, error);

        return throwError(() => new Error(errorMessage));
      })
    );
  }
}
