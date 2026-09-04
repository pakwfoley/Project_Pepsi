# Project Pepsi Marketplace Scanner

This is the read-only Facebook discovery adapter. It scans one open Marketplace search using the Facebook session already active in Chrome, deduplicates visible listing cards, and sends bounded candidate packages to the private Project Pepsi backend for analysis.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `scanner-extension` folder.
4. Open Facebook Marketplace and configure the search you want monitored.
5. Open the Project Pepsi extension and click **Start on this search**.

If the Marketplace tab was already open when the extension was installed, version 0.1.1 injects the scanner automatically. Reloading the Facebook tab once is still a safe first troubleshooting step.

Keep that Marketplace tab open. The extension scans it at the configured interval and gently advances through the results when auto-scroll is enabled.

## Location policy

- Home base is fixed to **Nevada City, California**.
- Maximum distance defaults to **100 miles**.
- **Local results only** is enabled by default.
- Listing locations are resolved offline against a bundled California place/ZIP index derived from GeoNames postal-code data.
- Listings with unknown locations are retained for review but are not eligible for alerts while local-only filtering is enabled.
- No listing location is sent to an external geocoding service.

## Authority boundary

- Reads only the already-rendered Marketplace search cards during automatic scans. It never opens candidate tabs in the background.
- Sends listing text, price, location, URL, and up to six bounded photo files to the private Project Pepsi backend. Photos preserve aspect ratio, use a maximum 2048 px long edge, and are encoded as WebP near 85–90 quality with stable capture metadata. Facebook cookies and credentials are never included.
- Stores observations and returned analysis in Chrome local storage; maximum 500 listings.
- Never sends messages, makes offers, clicks checkout, or accesses Facebook passwords/cookies.
- Uses conservative intervals of one minute or longer.
- Keeps identification, image review, risk assessment, and question generation on the server.

Location data © GeoNames and is licensed under CC BY 4.0: https://www.geonames.org/

Facebook can change its page structure or restrict automated behavior. Use a dedicated Marketplace search and stop the scanner if Facebook presents a challenge or unusual login prompt.
