chrome.commands.onCommand.addListener((command) => {
    if (command === "trigger-extraction") {
        console.log("Shortcut Ctrl+Shift+E triggered");
        // We notify the popup if it's open.
        // If we wanted to run it in background, we'd need the file data stored in storage.
        chrome.runtime.sendMessage({ action: "trigger_extraction" });
    }
});
