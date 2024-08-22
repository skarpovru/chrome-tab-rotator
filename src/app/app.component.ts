import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  FormControl,
} from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent implements OnInit {
  configForm: FormGroup;
  dataSource: FormGroup[] = [];
  isRotating = false; // Add this variable

  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {
    this.configForm = this.fb.group({
      pages: this.fb.array([]),
    });

    this.dataSource = (this.configForm.get('pages') as FormArray)
      .controls as FormGroup[];
  }

  ngOnInit() {
    this.displayCurrentConfig();
    this.listenForRotationState();
    this.queryRotationState();
  }

  get pages(): FormArray {
    return this.configForm.get('pages') as FormArray;
  }

  displayCurrentConfig() {
    chrome.storage.local.get('pages', (result) => {
      const pages = result['pages'] || [];

      if (pages.length === 0) {
        // Start by default with one empty page
        this.addNewPage();
      } else {
        this.pages.clear();
        pages.forEach((page: any) => {
          this.pages.push(
            this.fb.group({
              url: [page.url, Validators.required],
              delay: [page.delay, Validators.required],
              reloadInterval: [page.reloadInterval, Validators.required],
            })
          );
        });
      }

      this.updateDataSource();
    });
  }

  addPage() {
    this.addNewPage();
    this.updateDataSource();
    console.log('Added page', this.pages.controls);
  }

  deletePage(index: number) {
    this.pages.removeAt(index);
    this.updateDataSource();
  }

  saveConfig(event: Event) {
    event.preventDefault();
    if (this.configForm.invalid) {
      alert('Please fill in all fields.');
      return;
    }

    const pages = this.configForm.value.pages;
    chrome.storage.local.set({ pages }, () => {
      console.log('Configuration saved');
      this.displayCurrentConfig();
    });
  }

  startRotation() {
    chrome.runtime.sendMessage({ action: 'rotateTabs' });
    this.isRotating = true; // Set to true when rotation starts
  }

  stopRotation() {
    chrome.runtime.sendMessage({ action: 'stopRotation' });
    this.isRotating = false; // Set to false when rotation stops
  }

  private addNewPage() {
    this.pages.push(
      this.fb.group({
        url: ['', Validators.required],
        delay: ['', Validators.required],
        reloadInterval: ['', Validators.required],
      })
    );
  }

  private updateDataSource() {
    this.dataSource = this.pages.controls as FormGroup[];
    this.cdr.detectChanges();
  }

  private queryRotationState() {
    chrome.runtime.sendMessage({ action: 'getRotationState' }, (response) => {
      this.isRotating = response.isRotating;
      this.cdr.detectChanges();
    });
  }

  getFormControl(page: FormGroup, controlName: string): FormControl {
    return page.get(controlName) as FormControl;
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
