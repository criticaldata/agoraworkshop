# Expressed-Position Questionnaire

Instrument version: `expressed-position-v1`.

S1 and S6 use the exact same question IDs, wording and option order. Each agent
returns one choice, confidence from 0 to 100, a rationale, a complete ranking
without ties and a primary concern. The record describes an expressed response,
not a latent belief or calibrated probability.

Responses are typed as valid, explicit abstention where permitted, invalid,
provider failure, timeout, deadline, budget, cancellation or
`unknown_incomplete`. Missing or invalid responses are unavailable measurements;
they are never converted to a behavioral zero.

The canonical implementation is `src/phase1/positions.ts`; S1/S6 context is
independently recorded and never inserted into workshop dialogue.
