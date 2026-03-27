# Project Refinements & Enhancements

This document outlines potential improvements for the TIGI HR Resume Auto-Filler extension to enhance reliability, UX, and professional appeal.

## 1. Accidental Closure Protection (High Priority)
**Problem:** Chrome extension popups close immediately when the user clicks anywhere outside the popup. If a resume is being processed, the user loses visibility and potentially the extracted data.

### Proposed Solutions:
- **State Persistence (Storage API):** Save the current processing state and any extracted JSON to `chrome.storage.local`. When the popup is re-opened, it can resume showing the "Success" or "Processing" state instead of resetting to "Ready".
- **Side Panel API:** Migrate the UI to use the Chrome Side Panel. This allows the tool to stay open on the right side of the screen while the user interacts with the TIGI HR portal.
- **On-Page Overlay:** Inject a small "Processing..." widget directly onto the TIGI HR page during extraction so the user sees progress even if the popup is closed.

---

## 2. UX Refinements
- **Advanced API Key Validation:** Add a "Test Connection" button or validate the key format before allowing the "Extract" button to be clicked.
- **File Validation:** Check file size (e.g., limit to 5MB) and verify the file content-type before sending to Gemini to save API quota.
- **Copy to Clipboard:** Add a small "Copy JSON" button after extraction so recruiters can manually save the data if needed.
- **Keyboard Shortcuts:** Add a shortcut (e.g., `Ctrl+Shift+E`) to trigger the extraction without opening the popup.

---

## 3. UI Enhancements (Visual Polish)
- **Real-time Progress Bar:** Instead of just text like "Reading file...", use a CSS-animated progress bar that reflects the stages (File Read -> AI Extraction -> Form Filling).
- **Lottie Animations:** Integrate subtle animations for "Success" (a checkmark) or "Error" (a subtle shake) to make the experience feel more premium.
- **Theme Toggle:** Allow users to switch between the "Glassmorphism Dark" and a "Clean Light" version.
- **Instructional Tooltips:** Add small `(?)` icons next to fields like "Relevant Experience Only" to explain exactly how the AI calculates it.

---

## 4. Technical Improvements
- **Error Retry Logic:** If the Gemini API returns a 503 (Service Unavailable) or rate limit error, implement a 3-try exponential backoff.
- **Detailed Form Feedback:** After filling the form, highlight the fields that were filled on the page (e.g., a temporary green glow) so the recruiter knows exactly what was changed.
- **Logging System:** Implement an internal log (viewable in a 'Debug' tab) to help troubleshoot extraction failures for specific CV layouts.
- **Select2 Robustness:** Improve the fallback logic for Select2 fields when a city or skill isn't found in the TIGI database (e.g., suggesting the closest match).

---

## 5. Security & Privacy
- **API Key Masking:** By default, show the API key as `••••••••` with a "show/hide" eye icon.
- **Local-Only Processing:** Explicitly document/confirm that CV data is only sent to Google Gemini and not stored on any other 3rd party servers.
