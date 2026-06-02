# Sonar Light Proxy

A lightweight GitHub Actions composite action that starts a local HTTP reverse-proxy (pure Node.js, **zero extra dependencies**) and injects custom headers into every request forwarded to SonarQube or SonarCloud.

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
        uses: <your-github-username>/sonar-light-proxy@v1
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

      # 3. (Optional) Quality Gate check
      - name: SonarQube Quality Gate
        uses: SonarSource/sonarqube-quality-gate-action@v1
        env:
          SONAR_HOST_URL: ${{ steps.proxy.outputs.proxy-url }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

---

## Inputs

| Input            | Required | Default | Description |
|------------------|----------|---------|-------------|
| `sonar-host-url` | ✅ yes   | —       | Target SonarQube / SonarCloud base URL (e.g. `https://sonar.example.com`). |
| `headers`        | ❌ no    | `{}`    | JSON object of HTTP headers to inject into every upstream request. Example: `'{"X-Api-Key":"secret"}'`. |
| `proxy-port`     | ❌ no    | `9000`  | Local TCP port the proxy will listen on. Must be free on the runner. |

---

## Outputs

| Output      | Description |
|-------------|-------------|
| `proxy-url` | Local proxy URL (`http://127.0.0.1:<proxy-port>`). Use this as `SONAR_HOST_URL` in subsequent steps. |

---

## Environment variables set by the action

| Variable          | Description |
|-------------------|-------------|
| `SONAR_PROXY_PID` | PID of the background proxy process. You can use it to stop the proxy manually if needed: `kill $SONAR_PROXY_PID`. |

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
