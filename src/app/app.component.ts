import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ConfigEditorComponent } from './config-editor/config-editor.component';
import { ConfigLoaderComponent } from './config-loader/config-loader.component';
import { ConfigData, RemoteSettings, StorageKeys } from './models';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ConfigEditorComponent, ConfigLoaderComponent],
})
export class AppComponent implements OnInit {
  isRotating = false;
  localConfig?: ConfigData;
  remoteSettings?: RemoteSettings;
  useRemoteConfig: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadStoredAppConfig();
    this.listenForRotationState();
    this.queryRotationState();
  }

  startRotation() {
    chrome.runtime.sendMessage({ action: 'rotateTabs' });
    this.isRotating = true;
  }

  stopRotation() {
    chrome.runtime.sendMessage({ action: 'stopRotation' });
    this.isRotating = false;
  }

  onChangeUseRemoteConfig(useRemoteConfig: boolean) {
    chrome.storage.local.set({
      [StorageKeys.UseRemoteConfig]: useRemoteConfig,
    });
    this.loadStoredConfigData(useRemoteConfig);
    this.useRemoteConfig = useRemoteConfig ?? false;
    this.cdr.detectChanges();
  }

  onExportLocalConfig() {
    if (this.localConfig) {
      const blob = new Blob([JSON.stringify(this.localConfig, null, 2)], {
        type: 'application/json',
      });
      saveAs(blob, 'tabs-rotator-config.json');
    }
  }

  onChangeLocalConfig(localConfig: ConfigData) {
    chrome.storage.local.set({ [StorageKeys.LocalConfig]: localConfig }, () => {
      //this.localConfig = localConfig;
      console.log('Local configuration saved', localConfig);
    });
  }

  onChangeRemoteSettings(remoteSettings: RemoteSettings) {
    chrome.storage.local.set(
      { [StorageKeys.RemoteSettings]: remoteSettings },
      () => {
        //this.remoteSettings = remoteSettings;
        console.log('Settings for loading remote configuration was saved');
      }
    );
  }

  onChangeRemoteConfig(remoteConfig: ConfigData) {
    chrome.storage.local.set(
      { [StorageKeys.RemoteConfig]: remoteConfig },
      () => {
        console.log('Remote configuration saved', remoteConfig);
      }
    );
  }

  private loadStoredConfigData(useRemoteConfig: boolean) {
    if (useRemoteConfig) {
      this.localConfig = undefined;
      this.loadStoredRemoteSettings();
    } else {
      this.remoteSettings = undefined;
      this.loadStoredLocalConfig();
    }
  }

  private loadStoredAppConfig() {
    chrome.storage.local.get([StorageKeys.UseRemoteConfig], (result) => {
      this.useRemoteConfig = result?.[StorageKeys.UseRemoteConfig] ?? false; // Default to false if not set
      this.loadStoredConfigData(this.useRemoteConfig);
      console.log('Use remote config flag loaded', this.useRemoteConfig);
      this.cdr.detectChanges();
    });
  }

  private loadStoredRemoteSettings() {
    chrome.storage.local.get([StorageKeys.RemoteSettings], (result) => {
      this.remoteSettings =
        (result?.[StorageKeys.RemoteSettings] as RemoteSettings) ||
        new RemoteSettings();
      console.log(
        'Settings for loading remote configuration loaded',
        this.remoteSettings
      );
      this.cdr.detectChanges();
    });
  }

  private loadStoredLocalConfig() {
    chrome.storage.local.get([StorageKeys.LocalConfig], (result) => {
      this.localConfig =
        (result?.[StorageKeys.LocalConfig] as ConfigData) || new ConfigData();
      console.log('Local configuration loaded', this.localConfig);
      this.cdr.detectChanges();
    });
  }

  private queryRotationState() {
    chrome.runtime.sendMessage({ action: 'getRotationState' }, (response) => {
      this.isRotating = response.isRotating;
      this.cdr.detectChanges();
    });
  }

  private listenForRotationState() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'rotationState') {
        this.isRotating = message.isRotating;
        this.cdr.detectChanges();
      }
      return true; // Indicate that we will send a response asynchronously
    });
  }
}
