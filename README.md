# Kragon Auto Sales LLC

Static GitHub Pages site for Kragon Auto Sales LLC in Jackson, Kentucky.

## Files

- `index.html` lists available vehicles from `data/inventory.json`.
- `vehicle.html` shows a detail page for each vehicle.
- `assets/cars/` contains the vehicle images used by the inventory.
- No backend, build step, or server process is required.

## GitHub Pages

The original site serves from the root of the default branch. The new inventory
workflow publishes the same static site through GitHub Actions; see setup below
before switching the Pages publishing source.

## Facebook inventory automation

The sync recognizes car posts labeled `Kragon Auto Sales` or `#KragonInventory`
from Michelle's authorized personal profile. It updates inventory and copies
photos into the repository. A `SOLD` edit hides a car; unavailable posts receive
a waiting period before removal. Failed Facebook requests preserve inventory.

**Setup and authorization:** [docs/facebook-setup.md](docs/facebook-setup.md).
Scheduled syncing is disabled until `FACEBOOK_SYNC_ENABLED=true` is configured.
Live Facebook access still needs to be verified with Michelle's authorized token.

Use Node 22+: `npm test` checks the sync, and `npm run build` creates the public
site in `dist/`. No package installation is needed.
