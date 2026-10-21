# Property maps

Enter the property address and press **Find on map**. Search fills missing
city/state/postcode fields. Choose a matching address if several are returned,
then drag the pin to the exact spot. Clicking the map also sets the pin.
Coordinates stay internal; reopening a property keeps its saved pin.

The user requires **₹0 usage spend**. Maps use OpenStreetMap tiles and address
search uses the public Photon service, which permits reasonable project use
without keys or billing. No paid-provider fallback is configured. Google Maps
requires billing-enabled setup and is not used.

Search happens only on an explicit button press, never per keystroke. The browser
spaces requests by at least 1.1 seconds and reuses repeated results; the edge proxy
caches normalized results for seven days. Only the address is sent to Photon;
property names, owners, values and other investment information are not sent.
The existing dashboard authentication also protects the search endpoint.

Public search has no availability guarantee and coverage varies. Some land plots,
survey numbers or apartment units will need a nearby road/landmark, followed by
pin adjustment. Approximate results are labelled. Failed/no-match searches keep
the saved pin. Manual click/drag editing stays available during a search outage.

`PROPERTY_GEOCODER_URL` can point to another explicitly authorized HTTPS Photon
instance if the public service changes. It is not needed for normal use. It must
not point to a paid service without the user's separate authorization.

Checks: `npm run test:real-estate` covers property records, persistence and the
geocoder contract (valid points, coordinate ordering, caching, invalid queries,
no matches, outages, throttling and bounded responses). The local browser check
`scripts/dev/check-real-estate.mjs` uses the actual handler with a mocked external
provider and an in-memory property store. No test properties reach production.
Live checks use only public landmarks and do not save records.

References: [Photon API and fair use](https://photon.komoot.io/),
[Photon documentation](https://github.com/komoot/photon),
[OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).
