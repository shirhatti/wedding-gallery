# OpenTelemetry Tracing Configuration

This project uses Cloudflare Workers' native OpenTelemetry tracing, which automatically instruments all I/O operations including:
- HTTP requests
- R2 bucket operations
- D1 database queries
- KV namespace operations
- Service bindings

## What's Configured

All workers have tracing enabled in their `wrangler.toml` files:

```toml
[observability.traces]
enabled = true
head_sampling_rate = 1  # 100% sampling
```

### Workers with Tracing Enabled

1. **viewer** (`workers/viewer`) - Main media viewer worker
2. **video-streaming** (`workers/video-streaming`) - HLS video streaming
3. **album** (`workers/album`) - Photo upload worker
4. **wedding-gallery-pages** (`pages/gallery`) - Pages Functions

## Configuring OTLP Export

Traces are collected automatically, but you need to configure a destination for export. This is done via the Cloudflare dashboard (not wrangler.toml).

### Setting Up a Destination

1. Go to your Cloudflare dashboard
2. Navigate to **Workers & Pages** > **Observability** > **Destinations**
3. Click **Add Destination** > **Generic OTLP**
4. Configure:
   - **Name**: A descriptive name for this destination
   - **Endpoint**: Your OTLP endpoint URL
   - **Authentication**: Add headers if needed
5. Save the destination
6. Enable export for each worker:
   - Go to each worker > **Settings** > **Observability**
   - Select your destination
   - Enable **Traces**

### Self-Hosted OpenTelemetry Collector / Jaeger

Configure the destination with:
- **Endpoint**: `https://your-collector:4318/v1/traces` (OTLP/HTTP)
- **Headers**: Add authentication headers if your collector requires them

A typical self-hosted setup would be:
1. Run an [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) with an OTLP receiver
2. Configure the collector to export to Jaeger, Grafana Tempo, or another backend
3. Point the Cloudflare destination at the collector's public endpoint

### Azure Application Insights

Azure Monitor supports OTLP ingestion (currently in limited public preview). Two approaches:

**Option A: Via an OpenTelemetry Collector (Recommended)**
1. Deploy an OTel Collector (e.g., on Azure Container Apps or a VM)
2. Configure the collector with the [Azure Monitor exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/azuremonitorexporter)
3. Point the Cloudflare destination at the collector's OTLP endpoint

**Option B: Direct OTLP ingestion (Preview)**
If you have access to Azure Monitor's native OTLP ingestion preview, configure the destination endpoint and authentication per the [Azure Monitor OTLP documentation](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-configuration).

## Adjusting Sampling Rates

The current configuration uses 100% sampling (`head_sampling_rate = 1`), which captures all traces. For higher-traffic production deployments, reduce this:

```toml
[observability.traces]
enabled = true
head_sampling_rate = 0.1  # 10% sampling
```

Valid range: `0` (no sampling) to `1` (100% sampling). Default is `1` if unspecified.

### Recommended Sampling Rates

- **Development**: `1` (100%) - capture everything for debugging
- **Low traffic (<1000 req/day)**: `1` (100%) - negligible cost
- **Medium traffic (1K-100K req/day)**: `0.1` (10%) - balanced visibility
- **High traffic (>100K req/day)**: `0.01` (1%) - cost-effective

## What Gets Traced

With tracing enabled, Cloudflare automatically instruments every I/O operation:

### Request Spans
- HTTP method, path, status code
- Request duration

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
- Calls to other workers (e.g., Pages > viewer, Pages > video-streaming)
- Cross-worker trace propagation

## Distributed Tracing

Traces automatically propagate across service bindings. When the Pages Function routes a request to the viewer or video-streaming worker, you'll see the full trace across both workers with proper parent-child span relationships.

## Pricing

- **Beta period (through March 1, 2026)**: Free
- **After March 1, 2026**: Billed per traced invocation as part of Workers usage
- Reducing `head_sampling_rate` helps control costs

See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) for current rates.

## References

- [Cloudflare Workers Traces](https://developers.cloudflare.com/workers/observability/traces/)
- [Exporting OpenTelemetry Data](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/)
- [Workers Tracing Announcement](https://blog.cloudflare.com/workers-tracing-now-in-open-beta/)
