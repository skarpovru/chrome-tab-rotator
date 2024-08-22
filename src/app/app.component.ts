import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ConfigEditorComponent } from './config-editor/config-editor.component';
import { ConfigData } from './models';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, ConfigEditorComponent],
})
export class AppComponent implements OnInit {
  configData: ConfigData = new ConfigData();
  isRotating = false;

  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.displayCurrentConfig();
    this.listenForRotationState();
    this.queryRotationState();
  }

  displayCurrentConfig() {
    chrome.storage.local.get('pages', (result) => {
      this.configData = new ConfigData({ pages: result['pages'] || []});
      console.log('Configuration loaded', this.configData);
      this.cdr.detectChanges();
    });
  }

  saveConfig(configData: ConfigData) {
    chrome.storage.local.set({ pages: configData.pages }, () => {
      console.log('Configuration saved', configData);
      this.displayCurrentConfig();
    });
  }

  startRotation() {
    chrome.runtime.sendMessage({ action: 'rotateTabs' });
    this.isRotating = true;
  }

  stopRotation() {
    chrome.runtime.sendMessage({ action: 'stopRotation' });
    this.isRotating = false;
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
    });
  }
}
