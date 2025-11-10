# OpenTelemetry Tracing Configuration

This project uses Cloudflare Workers' native OpenTelemetry tracing, which automatically instruments all I/O operations including:
- HTTP requests
- R2 bucket operations
- D1 database queries
- KV namespace operations
- Service bindings

## What's Configured

All workers now have observability enabled in their `wrangler.toml` files:

```toml
[observability]
enabled = true
head_sampling_rate = 1  # 100% sampling
```

### Workers with Tracing Enabled

1. **viewer** (`workers/viewer`) - Main media viewer worker
2. **video-streaming** (`workers/video-streaming`) - HLS video streaming
3. **album** (`workers/album`) - Photo upload worker
4. **wedding-gallery-pages** (`pages/gallery`) - Pages Functions

## Configuring OTLP Export

Traces are collected automatically, but you need to configure where they're exported. Cloudflare supports exporting to any OTLP-compatible backend.

### Option 1: Self-Hosted OpenTelemetry Collector / Jaeger

#### Using Cloudflare Dashboard

1. Go to your Cloudflare dashboard
2. Navigate to **Workers & Pages** → **Observability** → **Destinations**
3. Click **Add Destination** → **Generic OTLP**
4. Configure:
   - **Name**: `self-hosted-otel` (or any name)
   - **Endpoint**: Your collector URL (e.g., `https://otel-collector.yourdomain.com/v1/traces`)
   - **Authentication**: Add headers if needed (e.g., `Authorization: Bearer <token>`)
5. Save the destination
6. Enable export for each worker:
   - Go to each worker → **Settings** → **Observability**
   - Select your destination
   - Enable **Traces**

#### Using Wrangler CLI

```bash
# Create a destination (requires wrangler 3.78.6+)
wrangler observability destination create generic-otlp \
  --name "self-hosted-otel" \
  --endpoint "https://otel-collector.yourdomain.com/v1/traces" \
  --header "Authorization: Bearer YOUR_TOKEN"

# Enable export for a worker
wrangler observability export viewer \
  --destination "self-hosted-otel" \
  --enabled
```

### Option 2: Azure Application Insights

Azure App Insights supports OTLP ingestion. Configure the destination with:

- **Endpoint**: `https://<region>.in.applicationinsights.azure.com/v1/traces`
- **Headers**:
  - `x-api-key`: Your Application Insights Instrumentation Key
  - Or use Azure AD authentication

Example:

```bash
wrangler observability destination create generic-otlp \
  --name "azure-app-insights" \
  --endpoint "https://westus2.in.applicationinsights.azure.com/v1/traces" \
  --header "x-api-key: YOUR_INSTRUMENTATION_KEY"
```

## Adjusting Sampling Rates

The current configuration uses 100% sampling (`head_sampling_rate = 1`), which captures all traces. For high-traffic production deployments, you may want to reduce this:

```toml
[observability]
enabled = true
head_sampling_rate = 0.1  # 10% sampling
```

Valid range: `0.0` (no sampling) to `1.0` (100% sampling)

### Recommended Sampling Rates

- **Development**: `1.0` (100%) - capture everything for debugging
- **Low traffic (<1000 req/day)**: `1.0` (100%) - negligible cost
- **Medium traffic (1K-100K req/day)**: `0.1` (10%) - balanced visibility
- **High traffic (>100K req/day)**: `0.01` (1%) - cost-effective

## What Gets Traced

With observability enabled, you'll automatically see:

### Request Spans
- HTTP method, path, status code
- Request duration
- User agent, IP address (if enabled)

### R2 Operations
- `get()`, `put()`, `head()`, `list()` operations
- Object keys accessed
- Operation duration

### D1 Database Queries
- SQL queries executed
- Query duration
- Number of rows returned

### KV Namespace Operations
- `get()`, `put()`, `delete()` operations
- Keys accessed
- Operation duration

### Service Bindings
- Calls to other workers (e.g., Pages → viewer, Pages → video-streaming)
- Cross-worker request propagation

## Distributed Tracing

Traces automatically propagate across service bindings. When the Pages Function calls the viewer worker, you'll see the full trace across both workers with proper parent-child span relationships.

## Pricing

- **Beta period (now - Jan 15, 2026)**: Free
- **After Jan 15, 2026**: Billed per trace exported
- Sampling helps control costs while maintaining visibility

## Viewing Traces

Once configured, traces will be exported to your chosen backend:

- **Jaeger**: View at `http://your-jaeger-ui:16686`
- **Azure App Insights**: View in Azure Portal → Application Insights → Transaction search
- **Generic OTLP**: Depends on your backend (Grafana Tempo, Honeycomb, etc.)

## Troubleshooting

### No traces appearing?

1. Verify observability is enabled in `wrangler.toml`
2. Check that a destination is configured and enabled for each worker
3. Verify your OTLP endpoint is accessible from Cloudflare's network
4. Check authentication headers are correct
5. Ensure sampling rate is > 0

### Traces incomplete?

- Check sampling rate - you may be only capturing a percentage
- Verify all workers have observability enabled
- Ensure service bindings are configured correctly

## References

- [Cloudflare Workers Observability Docs](https://developers.cloudflare.com/workers/observability/)
- [Exporting OpenTelemetry Data](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
- [Workers Tracing Announcement](https://blog.cloudflare.com/workers-tracing-now-in-open-beta/)
