import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  OnInit,
  ChangeDetectorRef,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  FormControl,
  ReactiveFormsModule,
} from '@angular/forms';
import { ConfigData, PageConfig } from '../models';
import isEqual from 'lodash/isEqual';

@Component({
  selector: 'app-config-editor',
  standalone: true,
  templateUrl: './config-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ConfigEditorComponent implements OnInit {
  @Output() valueChanges = new EventEmitter<ConfigData>();

  initialConfigData?: ConfigData;
  latestConfigData?: ConfigData;
  configForm: FormGroup;
  pagesFormArray = new FormArray<FormGroup>([]);
  isFullscreenControl = new FormControl(false);

  formChanged = false;

  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {
    this.configForm = this.fb.group({
      isFullscreen: this.isFullscreenControl,
      pages: this.pagesFormArray,
    });
  }

  @Input() set value(configData: ConfigData) {
    this.initialConfigData = configData;
    this.latestConfigData = configData;
    this.loadConfigData(this.initialConfigData);
    this.cdr.detectChanges();
  }

  ngOnInit() {
    this.configForm.valueChanges.subscribe(() => {
      const formChanged = !isEqual(
        this.configForm.value,
        this.latestConfigData
      );
      const updateRequired = this.formChanged !== formChanged;
      this.formChanged = !isEqual(this.configForm.value, this.latestConfigData);

      if (updateRequired) {
        this.cdr.detectChanges();
      }
    });
  }

  loadConfigData(data?: ConfigData) {
    const pages = data?.pages || [];

    this.isFullscreenControl.setValue(data?.isFullscreen ?? false);
    this.pagesFormArray = new FormArray<FormGroup>([]);
    if (pages.length === 0) {
      // Start by default with one empty page
      this.addPage();
    } else {
      pages.forEach((page: PageConfig) => {
        this.addPage(page);
      });
    }

    // Update the configForm to include the new pagesFormArray
    this.configForm.setControl('pages', this.pagesFormArray);
  }

  addPage(page?: PageConfig) {
    const pageConfig = page ?? new PageConfig();
    const pageFormGroup = this.fb.group({
      delaySeconds: [
        pageConfig.delaySeconds,
        [Validators.required, Validators.min(3)],
      ],
      reloadIntervalSeconds: [
        pageConfig.reloadIntervalSeconds,
        [Validators.required, Validators.min(0)],
      ],
      url: [pageConfig.url, Validators.required],
    });

    this.pagesFormArray.push(pageFormGroup);
    this.cdr.detectChanges();
  }

  deletePage(index: number) {
    this.pagesFormArray.removeAt(index);
    this.cdr.detectChanges();
  }

  onSaveConfig(event: Event) {
    event.preventDefault();
    this.configForm.markAllAsTouched();
    if (this.configForm.invalid) {
      alert('Please fill in all fields.');
      return;
    }

    this.latestConfigData = this.configForm.value as ConfigData;
    this.valueChanges.emit(this.latestConfigData);
    this.formChanged = false;
  }

  getFormControl(page: FormGroup, controlName: string): FormControl {
    return page.get(controlName) as FormControl;
  }
}
