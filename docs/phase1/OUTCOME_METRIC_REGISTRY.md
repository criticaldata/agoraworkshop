# Outcome and Metric Registry

All metrics carry a version, numerator, denominator, exclusions, source IDs and
missingness state in the analysis export.

| Family | Role | Definition |
|---|---|---|
| Role Fidelity (`rf-v1`) | primary | weighted mean of criterion scores per participant, then run mean |
| Interaction Contingency (`icr-v1`) | key secondary | contingent messages divided by eligible messages with exposed peer content |
| Participation inequality (`gini-v1`) | secondary | message-count Gini among participants; not dominance |
| Expressed position change (`categorical-switch-v1`) | secondary | fraction of S1/S6 choices changed, averaged within run |
| S7/S8 structural outcomes | descriptive | ballot validity, counts, minority preservation and deterministic reconstruction |
| Relation subtypes | exploratory | supports/challenges/extends/rejects/revises; not a primary gate |
| Artifact quality | exploratory | human-rated S8 artifact only, never participant behavior |

The experimental contrast is treatment minus control within paired block. Missing
endpoints remain null with explicit reason codes.
