chrome.runtime.onInstalled.addListener(() => {
  chrome.webNavigation.onCompleted.addListener(
    () => {
      console.log('Check if action is enabled');
      chrome.tabs.query({ active: true, currentWindow: true }, ([{ id }]) => {
        if (id) {
          console.log('Disabling action for tab112', id);
          chrome.action.disable(id);
        }
      });
    },
    { url: [{ hostContains: 'google.com' }] }
  );
});
