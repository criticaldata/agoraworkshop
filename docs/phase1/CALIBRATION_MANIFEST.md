# Phase 1A Calibration Manifest

The machine-generated manifest is `phase1a-calibration-manifest-v1`. It binds
provider, exact model, deployment metadata, parameters, tools, moderator, topic,
schedule, budget, five-participant topology and every instrument hash.

The repository calibration config uses `nvidia_vllm` with `qwen3-32b`. It never
references or invokes the separate LeoClaw service. Credentials are external
environment variables only. A mock provider is an infrastructure fixture and
cannot produce live or scientific evidence.
