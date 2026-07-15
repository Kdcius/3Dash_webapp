# 3Dash -- Documentation

## Getting started

Once the add-on is installed and running, open 3Dash in your browser at:

```
http://<your-ha-ip>:8099
```

Replace `<your-ha-ip>` with the IP address of your Home Assistant machine (e.g. `http://192.168.1.100:8099`).

The onboarding wizard will guide you through the initial setup:

1. Enter your Home Assistant URL and port (default: `8123`). A plain IP address (e.g. `192.168.1.100`) works when HA is served over HTTP. **If your Home Assistant uses SSL** (Let's Encrypt, Nabu Casa, reverse proxy), enter the full HTTPS URL instead (e.g. `https://your-domain.duckdns.org`) — an IP address will not work because the SSL certificate only matches the domain name.
2. Provide a **long-lived access token** (create one in your HA profile under **Security > Long-lived access tokens**).
3. Set your location (latitude/longitude) for accurate sun positioning.
4. Upload a `.glb` 3D model of your home.

The default port is `8099`. You can change it in **Settings > Add-ons > 3Dash > Configuration**.

## Configuration

All configuration happens in the browser -- no files to edit manually.

| What | Where |
|---|---|
| Home Assistant connection | Onboarding wizard or Settings |
| Location (for sun tracking) | Onboarding wizard or Settings |
| Theme, rendering, camera | Settings modal |
| Lights, displays, shadow walls, tubes | Config editor |

## SSL / HTTPS

The WebSocket protocol is chosen from the URL you enter: `https://...` connects with `wss://`, a bare IP or `http://...` connects with `ws://`. When the 3Dash page itself is served over HTTPS, `wss://` is always used (browsers block insecure WebSockets from HTTPS pages).

If your Home Assistant has SSL enabled (Let's Encrypt certificate in `configuration.yaml`, Nabu Casa, or a reverse proxy), port `8123` only accepts encrypted connections — a plain IP address will fail with "Connection failed". Enter the full `https://` URL matching your certificate's domain instead. If you use a self-signed certificate, your browser must trust it for the connection to work.

## Troubleshooting

**"Failed" / "Connection failed" when testing the HA connection:**

- If HA uses SSL, use `https://your-domain` as the URL, not the IP address (the certificate only matches the domain).
- If HA is plain HTTP, use its LAN IP (e.g. `192.168.1.100`) with port `8123` — not `localhost`, which points at the device running the browser.
- Verify the token by generating a fresh long-lived access token in **Profile > Security**.

## Backup and restore

You can export your full configuration (lights, displays, settings, and 3D model) as a ZIP file from the settings panel. Use this to back up your setup or transfer it to another instance.

## Support

For issues and feature requests, visit the [GitHub repository](https://github.com/kdcius/3Dash_webapp).
