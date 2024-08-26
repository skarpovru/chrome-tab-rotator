import { RotationService } from './rotation.service';
import { ConfigValidatorService } from './app/common/config-validator.service';
import { CustomHttpClient } from './app/common/custom-http-client.service';

const http = new CustomHttpClient();
const configValidator = new ConfigValidatorService();
const rotationService = new RotationService(http, configValidator);

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
  let responseSent = false;

  if (message.action === 'rotateTabs') {
    if (!rotationService.isRotating) {
      rotationService.initialize();
    }
    sendResponse({ status: 'started' });
    responseSent = true;
  } else if (message.action === 'stopRotation') {
    rotationService.stopRotation();
    sendResponse({ status: 'stopped' });
    responseSent = true;
  } else if (message.action === 'getRotationState') {
    sendResponse({ isRotating: rotationService.isRotating });
    responseSent = true;
  } else {
    sendResponse({ status: 'unknown action' });
    responseSent = true;
  }

  if (!responseSent) {
    sendResponse({ status: 'no response' });
  }

  return true; // Indicate that we will send a response asynchronously
});
