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

@Component({
  selector: 'app-config-editor',
  standalone: true,
  templateUrl: './config-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ConfigEditorComponent implements OnInit {
  @Output() valueChanges = new EventEmitter<ConfigData>();

  configData?: ConfigData;
  configForm: FormGroup;
  dataSource: FormGroup[] = [];

  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {
    this.configForm = this.fb.group({
      pages: this.fb.array([]),
    });

    this.dataSource = (this.configForm.get('pages') as FormArray)
      .controls as FormGroup[];
  }

  @Input() set value(configData: ConfigData) {
    this.configData = configData;
    this.loadConfigData(this.configData);
    this.updateDataSource();
    this.cdr.detectChanges();
  }

  get pages(): FormArray {
    return this.configForm.get('pages') as FormArray;
  }

  ngOnInit() {
  }

  loadConfigData(data?: ConfigData) {
    const pages = data?.pages || [];
    if (pages.length === 0) {
      // Start by default with one empty page
      this.addPage();
    } else {
      this.pages.clear();
      pages.forEach((page: PageConfig) => {
        this.addPage(page);
      });
    }
  }

  addPage(page?: PageConfig) {
    const pageConfig = page ?? new PageConfig();
    this.pages.push(
      this.fb.group({
        url: [pageConfig.url, Validators.required],
        delay: [pageConfig.delay, [Validators.required, Validators.min(3)]],
        reloadInterval: [
          pageConfig.reloadInterval,
          [Validators.required, Validators.min(0)],
        ],
      })
    );
    this.updateDataSource();
  }

  deletePage(index: number) {
    this.pages.removeAt(index);
    this.updateDataSource();
  }

  onSaveConfig(event: Event) {
    event.preventDefault();
    this.configForm.markAllAsTouched();
    if (this.configForm.invalid) {
      alert('Please fill in all fields.');
      return;
    }
    this.valueChanges.emit(this.configForm.value as ConfigData);
  }

  private updateDataSource() {
    this.dataSource = this.pages.controls as FormGroup[];
    this.cdr.detectChanges();
  }

  getFormControl(page: FormGroup, controlName: string): FormControl {
    return page.get(controlName) as FormControl;
  }
}
