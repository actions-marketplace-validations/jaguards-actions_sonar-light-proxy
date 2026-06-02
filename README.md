<h1 align="center">
  <a href="https://github.com/jaguards-actions/sonar-light-proxy">Sonar Light Proxy</a>
  <br>
</h1>
<h4 align="center">A lightweight GitHub Actions composite action that starts a local HTTP reverse-proxy and injects custom headers into every request forwarded to SonarQube.</h4>

<p align="center">
  <a href="https://github.com/jaguards-actions/sonar-light-proxy/blob/main/LICENSE"><img alt="GitHub License" src="https://img.shields.io/github/license/jaguards-actions/sonar-light-proxy"></a>
  <img alt="GitHub Release" src="https://img.shields.io/github/v/release/jaguards-actions/sonar-light-proxy">
</p>

<p align="center">
  <a href="#how-it-works">How it works</a> •
  <a href="#usage">Usage</a> •
  <a href="#requirements">Requirements</a> •
  <a href="#security-considerations">Security considerations</a> •
  <a href="#license">License</a>
</p>

This is useful when your SonarQube instance sits behind an API gateway or a load-balancer that requires specific headers (API keys, custom tokens, routing hints, etc.) that the standard Sonar scanner does not support natively.

---

## How it works

```
GitHub Actions runner
  │
  ├─ sonar-scanner ──► http://127.0.0.1:<proxy-port>  (proxy-url output)
  │                            │
  │                      proxy.js (Node.js)
  │                      injects custom headers
  │                            │
  └─────────────────────────── ► https://sonar.example.com  (sonar-host-url input)
```

1. The action spawns `proxy.js` as a background Node.js process.
2. The proxy listens on `127.0.0.1:<proxy-port>` (default `9000`).
3. Every incoming request is forwarded to `sonar-host-url` with the extra headers merged in.
4. The `proxy-url` output (`http://127.0.0.1:<proxy-port>` ) is used as `SONAR_HOST_URL` in subsequent steps.
5. The proxy process is automatically cleaned up when the runner job ends.

---

## Usage

```yaml
jobs:
  sonar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # 1. Start the proxy
      - name: Start Sonar proxy
        id: proxy
        uses: jaguards-actions/sonar-light-proxy
        with:
          sonar-host-url: 'https://sonar.example.com'
          headers: '{"X-Api-Key": "${{ secrets.SONAR_API_KEY }}", "X-Custom-Header": "value"}'
          proxy-port: '9000'   # optional, default is 9000

      # 2. Run the Sonar scanner pointing at the proxy
      - name: SonarQube Scan
        uses: SonarSource/sonarqube-scan-action@v5
        env:
          SONAR_HOST_URL: ${{ steps.proxy.outputs.proxy-url }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

      # 3. (Optional) Patch report-task.txt so the quality-gate action also goes through the proxy
      #    (the scanner writes the upstream serverUrl into report-task.txt; this step
      #    rewrites it to the proxy URL so the quality-gate action uses the proxy too)
      - name: Patch report-task.txt
        uses: jaguards-actions/sonar-light-proxy/patch-report-task
        with:
          proxy-url: ${{ steps.proxy.outputs.proxy-url }}
          # report-task-path: .scannerwork/report-task.txt  # default

      # 4. (Optional) Quality Gate check – now routes through the proxy thanks to step 3
      - name: SonarQube Quality Gate
        uses: SonarSource/sonarqube-quality-gate-action@v1
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### Why the patch step is needed for the Quality Gate check

The SonarQube scanner writes a `report-task.txt` file (default location:
`.scannerwork/report-task.txt`) that contains:

```
serverUrl=https://sonar.example.com
ceTaskUrl=https://sonar.example.com/api/ce/task?id=…
dashboardUrl=https://sonar.example.com/dashboard?…
```

These URLs come from the **upstream server's own configuration**, not from
`SONAR_HOST_URL`.  When the `sonarqube-quality-gate-action` reads that file it
will call the upstream server directly, bypassing the proxy and missing the
required headers.

The `patch-report-task` sub-action replaces every occurrence of the upstream
URL with the proxy URL so that the quality-gate action goes through the proxy
as well.

---

## `jaguards-actions/sonar-light-proxy`

### Inputs

| Input            | Required | Default | Description |
|------------------|----------|---------|-------------|
| `sonar-host-url` | ✅ yes   | —       | Target SonarQube / SonarCloud base URL (e.g. `https://sonar.example.com`). |
| `headers`        | ❌ no    | `{}`    | JSON object of HTTP headers to inject into every upstream request. Example: `'{"X-Api-Key":"secret"}'`. |
| `proxy-port`     | ❌ no    | `9000`  | Local TCP port the proxy will listen on. Must be free on the runner. |

### Outputs

| Output      | Description |
|-------------|-------------|
| `proxy-url` | Local proxy URL (`http://127.0.0.1:<proxy-port>`). Use this as `SONAR_HOST_URL` in subsequent steps. |

### Environment variables set by the action

| Variable          | Description |
|-------------------|-------------|
| `SONAR_PROXY_PID` | PID of the background proxy process. You can use it to stop the proxy manually if needed: `kill $SONAR_PROXY_PID`. |

---

## `jaguards-actions/sonar-light-proxy/patch-report-task`

### Inputs

| Input               | Required | Default                            | Description |
|---------------------|----------|------------------------------------|-------------|
| `proxy-url`         | ✅ yes   | —                                  | Local proxy URL produced by `sonar-light-proxy` (e.g. `http://127.0.0.1:9000`). Every occurrence of the upstream `serverUrl` in `report-task.txt` will be replaced with this value. |
| `report-task-path`  | ❌ no    | `.scannerwork/report-task.txt`     | Path to the `report-task.txt` file generated by the SonarQube scanner. |

### Outputs

This action produces no outputs. It patches `report-task.txt` in place.

---

## Requirements

- A runner with **Node.js** available (all standard GitHub-hosted runners include Node.js).
- `nc` (netcat) must be available on the runner for the readiness check (available on all standard Linux/macOS runners).
- The chosen `proxy-port` must be free on the runner.

---

## Security considerations

- Headers are passed via an environment variable and never printed in full in the logs.
- The proxy binds only to `127.0.0.1` (loopback), so it is not reachable from outside the runner.
- TLS certificate validation is disabled (`rejectUnauthorized: false`) to accommodate self-signed certificates commonly used in private SonarQube instances. Do not expose the proxy port externally.

---

## License

[Apache 2.0](LICENSE)
