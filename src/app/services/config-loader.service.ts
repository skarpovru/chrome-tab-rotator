import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, throwError } from 'rxjs';
import { ConfigData } from '../models';
import { ConfigValidatorService } from './config-validator.service';
import saveAs from 'file-saver';

@Injectable({
  providedIn: 'root',
})
export class ConfigLoaderService {
  constructor(
    private http: HttpClient,
    private configValidator: ConfigValidatorService
  ) {}

  loadFromUrl(url: string, withValidation = true): Observable<ConfigData> {
    return this.http.get<ConfigData>(url, { observe: 'response' }).pipe(
      map((response) => {
        try {
          const configData = response.body as ConfigData;
          if (withValidation) {
            this.configValidator.validateConfigData(configData);
          }
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

  loadFromFile(file: File, withValidation = true): Observable<ConfigData> {
    return new Observable<ConfigData>((observer) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const configData = JSON.parse(e.target.result) as ConfigData;
          if (withValidation) {
            this.configValidator.validateConfigData(configData);
          }
          observer.next(configData);
          observer.complete();
        } catch (error) {
          observer.error('Error parsing the configuration file: ' + error);
        }
      };
      reader.onerror = (error) => {
        observer.error('Error reading the file: ' + error);
      };
      reader.readAsText(file);
    });
  }

  saveToFile(configData: ConfigData, fileName: string) {
    const blob = new Blob([JSON.stringify(configData, null, 2)], {
      type: 'application/json',
    });
    saveAs(blob, fileName);
  }
}
