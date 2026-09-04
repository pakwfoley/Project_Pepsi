# Project Pepsi Marketplace Scanner

This is the first read-only Facebook discovery adapter. It scans one open Marketplace search using the Facebook session already active in Chrome, deduplicates visible listing cards, scores them locally, and shows desktop notifications for candidates.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `scanner-extension` folder.
4. Open Facebook Marketplace and configure the search you want monitored.
5. Open the Project Pepsi extension and click **Start on this search**.

Keep that Marketplace tab open. The extension scans it at the configured interval and gently advances through the results when auto-scroll is enabled.

## Authority boundary

- Reads only visible Marketplace result cards.
- Stores observations in Chrome local storage; maximum 500 listings.
- Never sends messages, makes offers, clicks checkout, or accesses Facebook passwords/cookies.
- Uses conservative intervals of one minute or longer.
- Does not yet synchronize candidates to the hosted Project Pepsi valuation database.

Facebook can change its page structure or restrict automated behavior. Use a dedicated Marketplace search and stop the scanner if Facebook presents a challenge or unusual login prompt.
