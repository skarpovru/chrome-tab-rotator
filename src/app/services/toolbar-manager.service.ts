import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ToolbarManagerService {
  /**
   * Change the extension icon based on the rotation state
   */
  setToolbarIcon(isRotating: boolean) {
    const iconPath = isRotating
      ? 'assets/icons/change-exchange-red-icon'
      : 'assets/icons/change-exchange-icon';

    try {
      chrome.action.setIcon({
        path: {
          '16': iconPath + '16.png',
          '48': iconPath + '48.png',
          '128': iconPath + '128.png',
        },
      });
    } catch (error) {
      console.error('Failed to set toolbar icon:', error);
    }
  }
}
