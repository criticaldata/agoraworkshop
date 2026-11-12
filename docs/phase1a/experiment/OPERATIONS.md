# AGORA operator runbook

## Installed deployment

Host: `mit-critical-data-1` via authorized Brev SSH. Project: `/data/PROJECTS/simon/agora-pilot`, mode 0700. Dedicated Ollama 0.40.16 binary under `runtime/bin/ollama`; model cache under `models`. No shared engine upgrade, global GPU changes, node restart or shared service replacement.

| Family | Fixed alias | Artifact |
| --- | --- | --- |
| GEMMA | `agora-gemma3-27b:20261112` | Gemma 3 27B IT Q4_K_M |
| QWEN | `agora-qwen3-32b:20261112` | Qwen3 32B Q4_K_M |
| MODEL_X | `agora-llama31-8b:20261112` | Llama 3.1 8B Instruct Q4_K_M |

The backend listens at 127.0.0.1:18501; the authenticated gateway at 127.0.0.1:18500. Neither service reserves VRAM while idle. Gateway calls claim GPU 0 through the existing `GPUS.txt.lock`, check actual GPU memory, pin its UUID, run one model, unload, and release only their own reservation. Busy resources return HTTP 429. There is no alternate-GPU or alternate-model fallback. Shared-cluster availability is checked again at launch and on every call.

The checked deployment file pins the binary, gateway source, model manifests and options. Aliases must not be updated in place. A changed deployment requires new canaries, a new plan hash and new Mateo approval. Backend and gateway PID files and logs are project-local.

If services need restarting, run the idempotent project starter over SSH:

```sh
ssh -T mit-critical-data-1 'python3 /data/PROJECTS/simon/agora-pilot/start_server.py'
```

It validates executable/source hashes and GPU identity. It refuses PID reuse, version/config mismatch and a halted gateway. It does not restart an unhealthy active service or allocate a GPU. No boot-time daemon has been installed; after a cluster reboot the starter is required. The reviewed application runner stays on Simon's Mac.

## Private credentials and tunnel

Local `~/.config/agora-pilot/gateway.credential` and `backup.identity` are mode 0600 under a mode 0700 directory. Do not print, commit, copy into the plan or upload the identity. The cluster holds a gateway credential with matching permissions. Same-user processes on this shared node are not isolated by file permissions: this is not a claim of exclusive host control. Only encrypted backup archives are uploaded; the model necessarily receives inference prompts.

The launcher opens a non-multiplexed SSH forward if needed, verifies authenticated health against the reviewed digest, and passes credentials only through the child's environment. An earlier multiplexed Brev tunnel disappeared during a technical call; the working setup explicitly uses `-S none -o ControlMaster=no`. No automatic inference retry hides an ambiguous transport failure.

## Approval and execution

`docs/phase1a/experiment/proposal/plan.json` is the prepared review file. It has **no approval records**. The sole pending collection gate is Mateo's genuine approval of the exact final plan hash, including D11/D16 timing and operational amendments. Record reviewer `Mateo`, role `scientific`, actual UTC approval time and a real evidence reference. Never invent an attestation. Calibration and independent human coding are still required before scoring; they are not represented as complete.

Run from repository root:

```sh
python3 src/phase1a/deployment/launch.py docs/phase1a/experiment/proposal/plan.json
# Only after actual approval, to collect:
python3 src/phase1a/deployment/launch.py docs/phase1a/experiment/proposal/plan.json --run
```

The first command performs preflight with no model calls. Both commands reject missing/stale approval before credential lookup. The launcher checks source-bound plan readiness, starts/reuses the tunnel, validates deployment health and runs into the single approved private output directory. Preserve the reviewed source and dependency lock. Do not use a fresh output directory to repeat a failed campaign.

## Backup and recovery

The launcher backs up on normal completion or runner error, after the ledger closes. It refuses a remaining execution lock. It compresses then age-encrypts the local archive, uploads only ciphertext to the private NVIDIA backups directory, checks the remote SHA-256, downloads and decrypts into a fresh temporary directory, compares every byte and runs WP06 evidence verification in new Node processes. A failed backup causes a nonzero exit and must be resolved; do not report that collection is safely archived.

A manual backup of a stopped archive uses:

```sh
python3 src/phase1a/deployment/backup.py PRIVATE_ARCHIVE \
  "$HOME/.config/agora-pilot/backup.identity" PRIVATE_BACKUP_REPORT.json
```

Only ciphertext resides off the Mac. Preserve the age identity: losing it makes that ciphertext unrecoverable. The tested recovery assumes the identity remains available; this is not disaster-recovery certification against simultaneous loss of the Mac and its key. Raw data is not backed up continuously during the campaign. Retention is proposed as 12 months after collection followed by Mateo review, with no automatic deletion.

## Failures

A timeout, unknown token usage, changed model revision, truncated/invalid response or failed unload halts further inference. Preserve logs, ledger and partial roster. A 429 may receive the single configured, recorded retry; continuing resource contention fails the workshop and halts the campaign. Reconcile whether a request actually completed before deciding on any amendment. No automatic replacement of failed workshops.

If the gateway is halted, inspect only the project's gateway/backend logs, `/api/ps`, GPU 0 memory/processes and its own lease row. Never clear another owner's lease or kill a shared service. Only after the own request is finished and its runner unloaded may the operator release an AGORA reservation and restart the gateway. Do not restart to conceal an ambiguous scientific call.

For a stale local execution lock, first verify the recorded process is dead, retain the lock as evidence, and reconcile in-flight calls. A completed operation boundary can resume; ambiguous in-flight operations cannot. The tested synthetic rehearsal demonstrates separate-process resume with the same 12 run IDs and 330 calls.
