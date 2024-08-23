import { RotationService } from './rotation.service';

const rotationService = new RotationService();

if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
  chrome.webNavigation.onErrorOccurred.addListener((details) => {
    rotationService.onHandleError(details.tabId, details.url);
  });
} else {
  console.error('webNavigation API is not available.');
}

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
  chrome.webNavigation.onCompleted.addListener((details) => {
    rotationService.onPageLoaded(details.tabId, details.url);
  });
} else {
  console.error('webNavigation API is not available.');
}

if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    rotationService.tryRemoveTabFromRotation(tabId);
  });
} else {
  console.error('tabs API is not available.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message, rotationService.isRotating);
  if (message.action === 'rotateTabs') {
    if (!rotationService.isRotating) {
      rotationService.initialize();
    }
    sendResponse({ status: 'started' });
  } else if (message.action === 'stopRotation') {
    rotationService.stopRotation();
    sendResponse({ status: 'stopped' });
  } else if (message.action === 'getRotationState') {
    sendResponse({ isRotating: rotationService.isRotating });
  }
  return true; // Indicate that we will send a response asynchronously
});
