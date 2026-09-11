# Locked Dataset Snapshot Manifest

`phase1_dataset_snapshots` stores canonical recursively sorted bytes, a SHA-256
content hash, revision, lock state and source campaign. `verifyDatasetLock` checks
bytes, payload and content-addressed identity. The application lock is not a WORM
archive; `phase1_archive_handoffs` records whether an external immutable archive
has been declared or independently confirmed. A URI alone is only a declaration;
`confirmArchiveHandoff` is the explicit post-verification transition.

Exports must carry the snapshot ID and exact hash. Any source, instrument,
membership or label mutation requires a new campaign/version.
