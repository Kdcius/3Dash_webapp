# HA-Native Sync & Multi-Zone Architecture

Resolves [Issue #8](https://github.com/Kdcius/3Dash_webapp/issues/8): sync the
config and 3D model across devices using only the user's Home Assistant —
no external backend, no cloud, no GitHub tokens.

## Storage design

| Data | Where | Transport | Why |
|---|---|---|---|
| Config JSON | HA frontend user-data store (`.storage/frontend.user_data_<user>`) | WebSocket `frontend/set_user_data` / `get_user_data`, key `3dash_config` | Works on **every** HA install type (OS, Supervised, Container, Core), authenticated, per-user, included in HA backups, uses the WS connection the app already holds — no CORS issues |
| 3D model (.glb) | `config/www/3dash/` on HA | HTTP GET `http(s)://<ha>:<port>/local/3dash/<name>.glb` | Served with the correct `model/gltf-binary` MIME and ETag support; cached in IndexedDB so startup is instant and works offline |

Conflict resolution is last-writer-wins on `AppConfig.updatedAt` (stamped on
every local mutation). On each successful HA connection the app reconciles:
newer local → push; newer remote → apply + reload.

### Why not the Media Source API?

Verified against HA source and a live instance (2026.x):

- `POST /api/media_source/local_source/upload` rejects any content type not
  starting with `image/`, `video/`, `audio/` (`local_source.py`,
  `async_upload_media`).
- Even with a spoofed multipart content type the upload succeeds, but the
  **serving** endpoint 404s for any file whose guessed MIME is outside
  image/video/audio (`local_source.py`, mime check before serve). GLB
  (`model/gltf-binary`) can therefore never be served back from `/media`.

### Live test results (HA container install, host network)

- `GET /local/3dash/config.json` → 200, `Content-Type: application/json`,
  `Cache-Control: public, max-age=2678400`, ETag present, no auth required.
- `GET /local/3dash/placeholder.glb` → 200, `Content-Type: model/gltf-binary`.
- `frontend/set_user_data` / `get_user_data` → round-trips a 50 KB payload
  without truncation; stored under the HA user tied to the token.
- No `Access-Control-Allow-Origin` header on `/local/` responses.

### Caveats

1. **Caching** — `/local/` is served with a 31-day max-age. The app bypasses
   this with `fetch(..., { cache: 'no-cache' })` + `If-None-Match`, so the
   model refreshes as soon as the file on HA changes.
2. **CORS** — when the webapp is served from a different origin than HA
   (e.g. the add-on on port 8099, or a dev server), model fetches from
   `/local/` need this in HA's `configuration.yaml`:

   ```yaml
   http:
     cors_allowed_origins:
       - http://homeassistant.local:8099   # wherever 3Dash is served from
   ```

   The config sync is unaffected (it rides the existing WebSocket).
3. **Writing the model to HA** — there is no HA-native API for writing
   arbitrary files to `config/www`. Users copy the file once via the Samba /
   SSH / File editor add-on (models change rarely; the config, which changes
   often, syncs automatically). The add-on could expose an upload endpoint in
   a future iteration.

## Using it

1. Settings → Connection → **Sync: Auto** — config now syncs via HA.
   *Push now / Pull now* trigger a manual sync.
2. (Optional) copy your model to `config/www/3dash/model.glb` on HA and set
   Settings → Connection → **Model Source: Home Assistant**. Devices fetch
   and cache it automatically.

## Zones / floors

`AppConfig.zones` defines floors or areas (Ground Floor, Garage, Garden…):

```jsonc
{
  "zones": [
    {
      "id": "ground",
      "name": "Ground Floor",
      "icon": "Home",                 // any lucide icon name
      "meshFilter": {                  // show only meshes whose name starts with…
        "mode": "include",            // or "exclude"
        "prefixes": ["GF_", "Stairs"]
      },
      "cameraPose": {                  // optional saved view
        "alpha": 4.71, "beta": 0.01, "radius": 14,
        "target": { "x": 0, "y": 0, "z": 0 }
      }
    }
  ],
  "activeZoneId": "ground"
}
```

Rendering strategy: **one model, per-zone visibility filters** on mesh-name
prefixes — switching is instant (no reload, no extra VRAM) and shadows stay
consistent. Zones are managed in Settings → Zones (name, icon, prefixes,
filter mode, camera view capture) and switched with the floating button on
the dashboard. The active zone persists in the config and therefore syncs
across devices. `ZoneConfig.modelKey` is reserved for a future
separate-model-per-zone mode.
