# Connect Michelle's Facebook inventory

The code is ready for an authorization trial; it has not yet been tested against
Michelle's real Facebook account. Her consent is necessary, and Meta must also
make `user_posts` available to the app. A public profile URL does not grant API
access. Do not enable the schedule until the preview shows her actual car posts
and their photos are accessible.

## 1. Authorize a Meta app

1. Create an app in [Meta for Developers](https://developers.facebook.com/apps/)
   that supports Facebook Login and access to user posts. Meta's available app
   use cases can vary; verify that this app can request `user_posts`.
2. For a development trial, give Michelle an app role such as tester and have her
   accept it. She must sign in as herself when granting access. Production access
   may require App Review or other Meta requirements; a successful development
   trial does not establish production approval.
3. In [Graph API Explorer](https://developers.facebook.com/tools/explorer/), select
   **your app**, get a **User access token**, request `user_posts`, and have Michelle
   complete Facebook's authorization prompts. Never use her Facebook password in
   the sync code, and never put the access token in chat or a repository file.
4. Run `GET /me?fields=id` in Explorer. Save the returned app-scoped ID for the
   GitHub variable `FACEBOOK_USER_ID`. This is not necessarily her public profile ID.
5. Verify `GET /me/permissions` reports `user_posts` as `granted`, then run:

   ```text
   GET /me/posts?fields=id,message,full_picture,attachments{type,media,subattachments{type,media}}&limit=100
   ```

   Confirm a real car post and its photos are present. If permission is unavailable
   or photos/posts are missing, resolve that with Meta before enabling automation.
   If personal-profile access is unavailable, use an authorized business Page or
   a separate inventory entry workflow instead.
6. Check expiry in [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/).
   Use Meta's supported token extension process when available. User tokens expire
   or can be revoked; this setup is not a permanent, unattended Facebook login.
   When access expires, replace the GitHub secret. Failed syncs preserve inventory.

References: [Explorer and app roles](https://developers.facebook.com/docs/graph-api/guides/explorer/),
[post permission](https://developers.facebook.com/docs/graph-api/reference/v2.9/post),
[access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/).

## 2. Configure GitHub and preview

In [repository Actions settings](https://github.com/EasternKentuckyDigital/kragonautosales/settings/secrets/actions):

| Kind | Name | Value |
| --- | --- | --- |
| Repository secret | `FACEBOOK_ACCESS_TOKEN` | Michelle's authorized User access token |
| Repository variable | `FACEBOOK_USER_ID` | The ID returned by `/me` |
| Repository variable | `FACEBOOK_SYNC_ENABLED` | Leave unset until the first import is verified |

Once the workflow is on `main`, open **Actions → Inventory and GitHub Pages → Run
workflow** and leave **Apply** unchecked. The log lists recognized car post IDs
and titles, plus a change summary. A preview changes no inventory files and does
not download photos. An apply run validates and downloads photos before saving.

## 3. Link the cars already on the website

Existing inventory remains manual until linked to its exact Facebook post. To
update it automatically, add mappings in `config/facebook.json`, using IDs from
the preview:

```json
"bindings": {
  "ACTUAL_FACEBOOK_POST_ID": "2013-chevrolet-equinox"
}
```

Use real IDs, not this placeholder. Link each car to one post only. The sync stops
when it finds an apparent duplicate of an unlinked available car, and identifies
the mapping needed. Existing vehicle IDs and detail links are preserved.

Only linked/imported cars participate in automatic removals. Manually entered
cars that were never linked must still be marked sold manually. The automation
does not guess which existing car matches a post or which two reposts represent
the same vehicle; edit the original post rather than reposting the same car.

## 4. Enable publishing and the schedule

1. Merge the reviewed code. In **Settings → Pages → Build and deployment**, select
   **GitHub Actions** as Source. Keep `kragonauto.com` configured as the custom domain.
2. Run the workflow with **Apply** checked. Confirm the inventory and photos on
   the website. Check the Actions run for errors if publication fails.
3. Set repository variable `FACEBOOK_SYNC_ENABLED` to the exact value `true`.
   GitHub will attempt a sync at minute 17 and 47 of each hour. Scheduled runs may
   be delayed, and GitHub may disable schedules in inactive public repositories.
4. Enable GitHub Actions failure notifications so an expired token is noticed.
   To pause syncing, remove `FACEBOOK_SYNC_ENABLED` or set it to `false`.

The workflow commits inventory, downloaded photos, and tracking state together,
then deploys a public-content-only Pages artifact. It deploys explicitly because
commits made with `GITHUB_TOKEN` do not trigger another Pages build. No separate
hosting subscription or always-running backend is needed. Branch protection may
require a repository-specific adjustment for the bot's inventory commits. A push
conflict fails the run rather than overwriting someone else's edits; rerun it.

Reference: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Mom's posting routine

Use one vehicle per post, with its year/make/model on a separate line and exactly
one dollar amount. Attach the car photos directly to the post. Include either
`Kragon Auto Sales` at the start of a line or `#KragonInventory` anywhere in the text.
The supplied Hyundai example already works:

```text
Kragon Auto Sales - 🚗
2018 Hyundai Santa Fe Sport
2.4 L engine
Front wheel drive
79,509 miles
4 new tires
New oil change
Heated seats, backup camera and remote start
New rear brakes and rotors
Super clean inside and out
$11,000
Call Ronnie 606- 568- 5622
#KragonInventory
```

- Edit that same post to change price or details.
- Add `SOLD` on its own line at the top to hide the car on the next successful sync.
  This is the most dependable way to remove it promptly.
- Deleting a post starts a waiting period only when Facebook reports it unavailable
  on a direct lookup. After at least three successful checks spanning 24 hours,
  the car is marked sold and hidden. Visibility changes can also produce this
  response: the API cannot prove deletion. Other API errors preserve the site.
- An entirely empty feed with active tracked cars stops the sync for review.
  If deleting the last post leaves no other accessible posts, mark that car sold
  in `data/inventory.json` manually, or use `SOLD` before deleting the post.
- Personal posts without the label are ignored. Labeled post text and photos
  become public website content, so keep unrelated personal details out of them.
- Unrecognized brands, missing prices/photos, or multiple dollar amounts are
  skipped. Existing cars with malformed edited text remain unchanged and appear
  in the skipped count. New details are never invented.
- Photos are copied into the repository so expiring Facebook image URLs are not
  used on the website. Sold photos are retained for now; the repository will grow
  over time and may eventually need an archive cleanup.

## Local commands

Use Node 22 or newer. There are no dependencies to install.

```sh
npm test
npm run build
```

For a local sync, supply `FACEBOOK_ACCESS_TOKEN` and `FACEBOOK_USER_ID` through
your shell's secure environment or secret manager, then run `npm run sync:preview`.
Run `npm run sync:apply` only after reviewing the preview and bindings. Preview
does not save missing-post counters. Token, permission, network, pagination, or
photo-download errors abort before inventory/state files are changed.
