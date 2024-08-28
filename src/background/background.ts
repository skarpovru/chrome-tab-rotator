import { RotationService } from './rotation.service';
import { CustomHttpClient } from './custom-http-client.service';
import { ConfigValidatorService, ToolbarManagerService } from '../app/services';

const http = new CustomHttpClient();
const configValidator = new ConfigValidatorService();
const toolbarManagerService = new ToolbarManagerService();
const rotationService = new RotationService(
  http,
  configValidator,
  toolbarManagerService
);

if (chrome.webNavigation && chrome.webNavigation.onErrorOccurred) {
  chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
    try {
      await rotationService.onHandleError(details.tabId, details.url);
    } catch (error) {
      console.error('Failed to handle page error:', error);
    }
  });
} else {
  console.error('webNavigation API is not available.');
}

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    try {
      await rotationService.onPageLoaded(details.tabId, details.url);
    } catch (error) {
      console.error('Failed to handle page load:', error);
    }
  });
} else {
  console.error('webNavigation API is not available.');
}

if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    try {
      await rotationService.tryRemoveTabFromRotationOnClose(tabId);
    } catch (error) {
      console.error('Failed to handle tab removal on close:', error);
    }
  });
} else {
  console.error('tabs API is not available.');
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.debug('Message received:', message, rotationService.isRotating);
  let responseSent = false;

  if (message.action === 'rotateTabs') {
    if (!rotationService.isRotating) {
      try {
        console.debug('Starting rotation...');
        await rotationService.initialize();
        sendResponse({ status: 'started' });
      } catch (error) {
        console.error('Failed to start rotation:', error);
        sendResponse({ status: 'error', message: error });
      }
    } else {
      sendResponse({ status: 'already rotating' });
    }
    responseSent = true;
  } else if (message.action === 'stopRotation') {
    try {
      await rotationService.stopRotation();
      sendResponse({ status: 'stopped' });
    } catch (error) {
      console.error('Failed to stop rotation:', error);
      sendResponse({ status: 'error', message: error });
    }
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
