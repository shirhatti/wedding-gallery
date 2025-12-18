# Claude Code Sandbox Environment Analysis

Analysis performed: December 18, 2025

## Executive Summary

This document analyzes the sandbox execution environment used by Claude Code (remote/cloud mode). The environment runs on **Google Cloud Platform (GCP)** using **gVisor** as the container runtime, providing strong isolation guarantees.

## Cloud Provider Identification

**Confidence Level: 99%+ - Google Cloud Platform**

Evidence:
- DMI sys_vendor: `Google Compute Engine`
- DMI product_name: `Google Compute Engine`
- Hostname: `runsc` (gVisor's runtime binary name)
- dmesg shows gVisor startup messages
- NO_PROXY includes `metadata.google.internal`, `*.googleapis.com`, `*.google.com`
- Environment variables reference GCP-style networking

## Hardware Specifications

### CPU
| Property | Value |
|----------|-------|
| Architecture | x86_64 |
| Vendor | GenuineIntel |
| CPU Family | 6 |
| Model | 106 (Ice Lake) |
| Model Name | Unknown (masked by hypervisor) |
| Base Frequency | 2600 MHz |
| vCPUs | 16 |
| Cores per Socket | 16 |
| Sockets | 1 |
| Threads per Core | 1 (no SMT exposed) |
| Cache Size | 8192 KB |
| Hypervisor | KVM |

**CPU Flags Analysis:**
- Full AVX-512 support (avx512f, avx512dq, avx512cd, avx512bw, avx512vl, avx512vbmi, avx512_vbmi2, avx512_vnni, avx512_bitalg, avx512_vpopcntdq)
- SHA-NI (hardware SHA acceleration)
- AES-NI (hardware AES acceleration)
- Modern features: FSRM, GFNI, VAES, VPCLMULQDQ

**GCP Instance Type Analysis:**
Based on Intel Ice Lake (model 106) with 16 vCPUs at 2.6 GHz, this is likely a **n2-standard-16** or similar N2 series instance.

### Memory
| Property | Value |
|----------|-------|
| Total RAM | 21 GB (22,020,096 KB) |
| Available | ~20 GB |
| Swap | None (0 KB) |
| Memory Cgroup Limit | Unlimited (9223372036854775807) |

### Storage
| Filesystem | Size | Used | Available | Mount Point |
|------------|------|------|-----------|-------------|
| Root (9p) | 30 GB | 4.8 MB | 30 GB | / |
| tmpfs (dev) | 252 GB | 0 | 252 GB | /dev |
| tmpfs (shm) | 252 GB | 0 | 252 GB | /dev/shm |
| tmpfs (cgroup) | 252 GB | 0 | 252 GB | /sys/fs/cgroup |

**Storage Type:** 9p filesystem (Plan 9 Filesystem Protocol) - used for host-to-guest file sharing in gVisor

**Storage Performance:**
| Test | Result |
|------|--------|
| Sequential Write (1M blocks, 256MB) | 351 MB/s |
| 4K Block Write (40MB total) | 205 MB/s |

## Virtualization & Isolation

### Container Runtime: gVisor (runsc)

gVisor provides an application kernel that intercepts system calls, providing:
- Strong isolation from the host kernel
- Reduced attack surface
- Sandboxed execution environment

**Evidence of gVisor:**
```
$ dmesg | head
[    0.000000] Starting gVisor...
[    0.253707] Gathering forks...
[    0.627526] Digging up root...
[    0.999249] Creating cloned children...
[    1.189430] Waiting for children...
[    1.399825] Rewriting operating system in Javascript...
[    1.528998] Committing treasure map to memory...
[    1.654218] Moving files to filing cabinet...
[    1.994125] Mounting deweydecimalfs...
[    2.475601] Creating process schedule...
[    2.625203] Creating bureaucratic processes...
[    2.968321] Ready!
```

(Note: The humorous startup messages are a gVisor signature)

### Kernel Version
- Reported: `Linux 4.4.0 #1 SMP Sun Jan 10 15:06:54 PST 2016`
- This is gVisor's emulated kernel version, not the actual host kernel

### Hypervisor Stack
1. **L1**: GCP Compute Engine (KVM-based)
2. **L2**: gVisor application kernel (runsc)

## Network Configuration

### Interfaces
| Interface | Purpose |
|-----------|---------|
| f2b571dcde-v | Primary container network |
| lo | Loopback (present but unused) |

### Network Isolation
- No direct internet access
- All traffic routed through authenticated proxy
- Proxy uses JWT tokens for authentication
- Egress controlled by Anthropic's egress control system

### DNS/Hosts Configuration
Hardcoded hosts entries for:
- `api.anthropic.com` (160.79.104.10)
- `statsig.anthropic.com` (34.36.57.103)
- `sentry.io` (35.186.247.156)
- `http-intake.logs.datadoghq.com` (3.233.158.41)

## Resource Limits

### CPU Cgroup
- Quota: -1 (unlimited)
- Period: 100000 microseconds
- Effectively: No CPU throttling

### Process Limits
| Resource | Limit |
|----------|-------|
| Open Files | 20,000 |
| Max User Processes | Unlimited |
| Stack Size | 8 MB |
| Core File Size | Unlimited |
| Virtual Memory | Unlimited |

## Installed Software

### Runtime Environments
| Runtime | Version |
|---------|---------|
| Python | 3.11.14 |
| Node.js | 22.21.1 (also 20.x, 21.x available) |
| Go | 1.24.7 |
| Ruby | 3.1.6, 3.2.6, 3.3.6 |
| Java | OpenJDK 21 |

### Build Tools
| Tool | Version |
|------|---------|
| Maven | 3.9.11 |
| Gradle | 8.14.3 |
| NVM | Available |
| Bun | Available |

## Environment Variables (Notable)

| Variable | Value |
|----------|-------|
| IS_SANDBOX | yes |
| CLAUDECODE | 1 |
| CLAUDE_CODE_REMOTE | true |
| CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE | cloud_default |
| CLAUDE_CODE_VERSION | 2.0.59 |
| MAX_THINKING_TOKENS | 31999 |

## Comparison with Previous Analysis (PR #23)

| Aspect | PR #23 (Devin) | This Analysis (Claude Code) |
|--------|----------------|------------------------------|
| Cloud Provider | AWS | GCP |
| Instance Type | m6a.2xlarge | N2-series (likely n2-standard-16) |
| CPU | AMD EPYC 7R13 (Zen 3) | Intel Ice Lake (model 106) |
| vCPUs | 8 | 16 |
| RAM | 32 GB | 21 GB |
| Container Runtime | Docker/KVM | gVisor (runsc) |
| Storage | EBS io2 | 9p filesystem |
| Sequential Write | 529 MB/s | 351 MB/s |
| Network | VPC-based | Proxied with JWT auth |

## Security Observations

1. **Strong Isolation**: gVisor provides kernel-level isolation without full VM overhead
2. **Network Control**: All egress traffic is proxied and authenticated
3. **No Docker**: Docker daemon is not available, preventing container-in-container attacks
4. **Limited /proc**: Many kernel interfaces are virtualized or restricted
5. **Read-only System Files**: Critical system paths are protected
6. **No Swap**: Memory limits are strictly enforced without swap evasion

## Conclusions

Claude Code's sandbox environment is optimized for:
1. **Security**: Strong isolation via gVisor, controlled egress, no Docker access
2. **Development Workloads**: Well-provisioned with 16 vCPUs, 21GB RAM
3. **Multi-language Support**: Python, Node.js, Go, Ruby, Java all available
4. **Reasonable I/O**: 351 MB/s sequential writes suitable for most dev tasks

The environment differs significantly from PR #23's AWS-based analysis, running on GCP with Intel CPUs and gVisor isolation instead of AWS with AMD CPUs and traditional container isolation.
